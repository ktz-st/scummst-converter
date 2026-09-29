// Manual end-to-end worker test; needs original CD images in GCC.ELF.
import {readFileSync, openAsBlob, writeFileSync} from "node:fs";
import {basename, dirname, join} from "node:path";

const root = process.env.SCUMMST_WORKSPACE;
const game = process.argv[2] || "INDY3T";
if (!root) throw new Error("Set SCUMMST_WORKSPACE");
const cues = {
  INDY3T: "indy-vga/fm-towns/Indiana Jones and the Last Crusade (1989)(LucasFilm)(Jp-En).cue",
  LOOM: "loom-vga/loom-pc-vga40-en.cue",
  ZAK: "zak-fm-towns/Zak McKracken and The Alien Mindbenders (1990)(Lucasarts)(Jp-En).cue",
};
const fullCue = join(root, cues[game]);
const text = readFileSync(fullCue, "utf8");
const binName = text.match(/^FILE\s+"([^"]+)"/m)[1];
const binFile = await openAsBlob(join(dirname(fullCue), binName));
binFile.name = binName;
const dataFiles = [];
if (game === "LOOM") {
  for (const name of ["000.LFL", "DISK01.LEC", "901.LFL", "902.LFL", "903.LFL", "904.LFL"]) {
    const blob = await openAsBlob(join(root, "loom-vga/extracted/game-files", name));
    blob.name = name;
    dataFiles.push(blob);
  }
}
let result = null, error = null;
globalThis.self = {postMessage(message) {
  if (message.type === "done") result = message;
  if (message.type === "error") error = message.error;
}};
await import("../web/worker.js");
await self.onmessage({data: {game, cueFile: {name: basename(fullCue), text: async () => text}, binFile, dataFiles}});
if (error) throw new Error(error);
if (!result) throw new Error("Worker did not return files");
for (const file of result.files) {
  if (process.env.SCUMMST_OUTPUT_DIR) writeFileSync(join(process.env.SCUMMST_OUTPUT_DIR, file.name), file.data);
  console.log(file.name, file.data.length);
}
if (process.env.SCUMMST_ZIP) {
  const {createZip} = await import("../web/zip.js");
  const archive = new Map(result.files.map(({name, data}) => [`READY/${name}`, data]));
  const zip = await createZip(archive);
  writeFileSync(process.env.SCUMMST_ZIP, new Uint8Array(await zip.arrayBuffer()));
  console.log("ZIP", zip.size);
}
