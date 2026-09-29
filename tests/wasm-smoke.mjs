// Manual integration check: SCUMMST_WORKSPACE=/path/to/GCC.ELF node tests/wasm-smoke.mjs INDY3T
import {readFileSync, readdirSync, existsSync, writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {join} from "node:path";
import createScummST from "../web/scummst-engine.js";

const root = process.env.SCUMMST_WORKSPACE;
const game = process.argv[2] || "INDY3T";
if (!root) throw new Error("Set SCUMMST_WORKSPACE");
const sources = {
  INDY3T: "indy-vga/fm-towns-ste",
  LOOM: "loom-vga/extracted/game-files",
  MONKEY1: "monkey1-vga/MI1UTDE",
  ZAK: "zak-fm-towns/game-files",
};
const directory = join(root, sources[game]);
if (!existsSync(directory)) throw new Error(`Missing ${directory}`);
const module = await createScummST({
  locateFile: (name) => new URL(`../web/${name}`, import.meta.url).pathname,
  print: (line) => console.log(line),
  printErr: (line) => console.error(line),
});
const {FS} = module;
FS.mkdir("/game");
for (const name of readdirSync(directory)) {
  if (/^(\d{2,3}\.LFL|DISK01\.LEC|MONKEY\.00[01])$/i.test(name))
    FS.writeFile(`/game/${name.toUpperCase()}`, readFileSync(join(directory, name)));
}
if (game === "INDY3T") FS.writeFile("/game/TOWNS.ID", "TOWNS\n");
if (game === "ZAK") FS.writeFile("/game/ZAK.ID", "ZAK\n");
console.log(`Loaded ${FS.readdir("/game").length - 2} source files`);
try { module.callMain(["-p", "/game/"]); }
catch (error) { console.error("Converter exited:", error); }
console.log("Output:", FS.readdir("/game"));
for (const name of FS.readdir("/game").filter((n) => /\.ST[01]$/i.test(n))) {
  const actual = FS.readFile(`/game/${name}`);
  if (process.env.SCUMMST_OUTPUT_DIR) writeFileSync(join(process.env.SCUMMST_OUTPUT_DIR, name.toUpperCase()), actual);
  const referencePath = join(root, "SCUMMBLD", game, name.toUpperCase());
  const freshPath = process.env.SCUMMST_REFERENCE_DIR && join(process.env.SCUMMST_REFERENCE_DIR, game, name);
  const digest = (data) => createHash("sha256").update(data).digest("hex");
  console.log(name, actual.length, digest(actual),
    existsSync(referencePath) ? `matches installed: ${digest(actual) === digest(readFileSync(referencePath))}` : "no installed reference",
    freshPath && existsSync(freshPath) ? `matches fresh Wine: ${digest(actual) === digest(readFileSync(freshPath))}` : "");
}
