// Manual full-bank check using the user's original disc and game files.
import {openAsBlob, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {parseMonkeyCue} from "../web/monkey-disc.js";
import {convertMonkeyAudio} from "../web/monkey-audio.js";

const root = process.env.SCUMMST_WORKSPACE;
if (!root) throw new Error("Set SCUMMST_WORKSPACE");
const disc = join(root, "monkey1-vga");
const cue = readFileSync(join(disc, "monkey.cue"), "utf8");
const names = [...cue.matchAll(/^FILE\s+"([^"]+)"/gim)].map((match) => match[1]);
const bins = await Promise.all(names.map(async (name) => {
  const blob = await openAsBlob(join(disc, name));
  blob.name = name;
  return blob;
}));
const tracks = parseMonkeyCue(cue, bins);
const monster = await openAsBlob(join(disc, "MI1UTDE/monster.sou"));
const source = join(root, "SCUMMBLD/MONKEY1");
const outputs = await convertMonkeyAudio(tracks, monster,
  readFileSync(join(source, "MONKEY.ST0")), readFileSync(join(source, "MONKEY.ST1")),
  ({phase, count, total, fraction}) => {
    if (phase === "music" || phase === "speech" && count % 500 === 0)
      console.log(phase, count, total || "", Math.round(fraction * 100) + "%");
  });
for (const [name, data] of outputs) {
  console.log(name, data.length, "reference", readFileSync(join(source, name)).length);
  if (process.env.SCUMMST_OUTPUT_DIR) writeFileSync(join(process.env.SCUMMST_OUTPUT_DIR, name), data);
}
