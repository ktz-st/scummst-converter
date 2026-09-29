import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync, readFileSync, openAsBlob} from "node:fs";
import {dirname, join} from "node:path";
import test from "node:test";
import {parseCue, Disc} from "../web/disc.js";

const root = process.env.SCUMMST_WORKSPACE;
const cases = [
  ["INDY3T", "indy-vga/fm-towns/Indiana Jones and the Last Crusade (1989)(LucasFilm)(Jp-En).cue", "indy-vga/fm-towns-ste/00.LFL"],
  ["ZAK", "zak-fm-towns/Zak McKracken and The Alien Mindbenders (1990)(Lucasarts)(Jp-En).cue", "zak-fm-towns/game-files/00.LFL"],
];

for (const [game, cuePath, referencePath] of cases) {
  test(`${game}: browser ISO extraction matches existing source`, {skip: !root}, async () => {
    const fullCue = join(root, cuePath);
    const {binName, tracks} = parseCue(readFileSync(fullCue, "utf8"));
    const binPath = join(dirname(fullCue), binName);
    assert.ok(existsSync(binPath));
    const disc = new Disc(await openAsBlob(binPath), tracks);
    const result = await disc.extractEnglish(game);
    assert.ok(result.size > 3);
    const extracted = createHash("sha256").update(result.get("00.LFL")).digest("hex");
    const reference = createHash("sha256").update(readFileSync(join(root, referencePath))).digest("hex");
    assert.equal(extracted, reference);
  });
}
