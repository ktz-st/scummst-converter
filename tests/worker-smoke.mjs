// Manual end-to-end worker test; needs original CD images in GCC.ELF.
import {readFileSync, openAsBlob, writeFileSync} from "node:fs";
import {basename, dirname, join} from "node:path";

const root = process.env.SCUMMST_WORKSPACE;
const game = process.argv[2] || "INDY3T";
if (!root) throw new Error("Set SCUMMST_WORKSPACE");
const cues = {
  INDY3T: "indy-vga/fm-towns/Indiana Jones and the Last Crusade (1989)(LucasFilm)(Jp-En).cue",
  LOOM: "loom-vga/loom-pc-vga40-en.cue",
  MONKEY1: "monkey1-vga/monkey.cue",
  ZAK: "zak-fm-towns/Zak McKracken and The Alien Mindbenders (1990)(Lucasarts)(Jp-En).cue",
};
const fullCue = join(root, cues[game]);
const text = readFileSync(fullCue, "utf8");
const binNames = [...text.matchAll(/^FILE\s+"([^"]+)"/gm)].map((match) => match[1]);
const binFiles = await Promise.all(binNames.map(async (name) => {
  const blob = await openAsBlob(join(dirname(fullCue), name));
  blob.name = name;
  return blob;
}));
const binFile = binFiles[0];
const dataFiles = [];
if (game === "MONKEY1") {
  for (const name of ["monkey.000", "monkey.001", "monster.sou"]) {
    const blob = await openAsBlob(join(root, "monkey1-vga/MI1UTDE", name));
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
await self.onmessage({data: {game, cueFile: {name: basename(fullCue), text: async () => text}, binFile, binFiles, dataFiles}});
if (error) throw new Error(error);
if (!result) throw new Error("Worker did not return files");
for (const file of result.files) {
  if (process.env.SCUMMST_OUTPUT_DIR) writeFileSync(join(process.env.SCUMMST_OUTPUT_DIR, file.name), file.data);
  console.log(file.name, file.data.length);
}
if (process.env.SCUMMST_ZIP) {
  const {createZip} = await import("../web/zip.js");
  const archive = new Map(result.files.map(({name, data}) => [`READY/${name}`, data]));
  const programs = {INDY3T: ["INDY3T.PRG", "INDY3T.INF"], LOOM: ["LOOM.PRG", "LOOMCD.INF"],
    MONKEY1: ["MONKEY1.PRG", "MONKEY.INF"], ZAK: ["ZAKT.PRG", "ZAKT.INF"]};
  const [program, config] = programs[game];
  archive.set(`READY/${game === "MONKEY1" ? "M1PCM.PRG" : program}`,
    readFileSync(new URL(`../prgs/${program}`, import.meta.url)));
  archive.set(`READY/${config}`, new Uint8Array([1, 3, 2, 0xc0, 1]));
  const zip = await createZip(archive);
  writeFileSync(process.env.SCUMMST_ZIP, new Uint8Array(await zip.arrayBuffer()));
  console.log("ZIP", zip.size);
}
