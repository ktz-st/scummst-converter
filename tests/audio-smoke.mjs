// Manual, needs user-supplied CD: SCUMMST_WORKSPACE=/path/to/GCC.ELF node tests/audio-smoke.mjs INDY3T
import {readFileSync, readdirSync, openAsBlob, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {createHash} from "node:crypto";
import {parseCue, Disc} from "../web/disc.js";
import {convertTownsAudio, convertLoomAudio} from "../web/audio.js";

const root = process.env.SCUMMST_WORKSPACE;
const game = process.argv[2] || "INDY3T";
if (!root) throw new Error("Set SCUMMST_WORKSPACE");
const config = {
  INDY3T: ["indy-vga/fm-towns/Indiana Jones and the Last Crusade (1989)(LucasFilm)(Jp-En).cue", "indy-vga/fm-towns-ste"],
  LOOM: ["loom-vga/loom-pc-vga40-en.cue", "loom-vga/extracted/game-files"],
  ZAK: ["zak-fm-towns/Zak McKracken and The Alien Mindbenders (1990)(Lucasarts)(Jp-En).cue", "zak-fm-towns/game-files"],
};
const [cuePath, lflPath] = config[game];
const fullCue = join(root, cuePath);
const cue = parseCue(readFileSync(fullCue, "utf8"));
const disc = new Disc(await openAsBlob(join(dirname(fullCue), cue.binName)), cue.tracks);
if (game !== "LOOM") await disc.scan();
const lfl = new Map();
for (const name of readdirSync(join(root, lflPath)))
  if (/^\d{2}\.LFL$/i.test(name)) lfl.set(name.toUpperCase(), readFileSync(join(root, lflPath, name)));
const output = game === "LOOM" ? new Map([["LOOMCD.PCM", await convertLoomAudio(disc)]]) :
  await convertTownsAudio(game, disc, lfl, ({sound, fraction}) => {
    if (fraction === 1) process.stdout.write(`\r${game}: sound ${sound}   `);
  });
console.log();
const digest = (b) => createHash("sha256").update(b).digest("hex");
const level = (b, offset = 0) => {
  let energy = 0, peak = 0;
  for (const byte of b) {
    const value = ((byte - offset + 128) & 255) - 128;
    energy += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  return {rms: Math.sqrt(energy / b.length).toFixed(2), peak};
};
for (const [name, data] of output) {
  if (process.env.SCUMMST_OUTPUT_DIR) writeFileSync(join(process.env.SCUMMST_OUTPUT_DIR, name), data);
  const installed = readFileSync(join(root, "SCUMMBLD", game, name));
  console.log(name, data.length, "installed", installed.length, "sha", digest(data),
    "match", digest(data) === digest(installed),
    name.endsWith(".PCM") ? `level ${JSON.stringify(level(data, game === "LOOM" ? 0 : 128))} vs ${JSON.stringify(level(installed, game === "LOOM" ? 0 : 128))}` : "");
}
