import assert from "node:assert/strict";
import test from "node:test";
import {parseCue, Disc} from "../web/disc.js";

test("CUE parser preserves audio track positions", () => {
  const cue = `FILE "disc.bin" BINARY\n  TRACK 01 MODE1/2352\n    INDEX 01 00:00:00\n  TRACK 02 AUDIO\n    INDEX 01 01:02:03\n`;
  const {binName, tracks} = parseCue(cue);
  assert.equal(binName, "disc.bin");
  assert.deepEqual(tracks, [
    {number: 1, kind: "MODE1/2352", start: 0, end: 4653},
    {number: 2, kind: "AUDIO", start: 4653},
  ]);
});

test("CUE parser rejects missing INDEX 01", () => {
  assert.throws(() => parseCue('FILE "disc.bin" BINARY\n TRACK 01 MODE1/2352\n'), /INDEX 01/);
});

test("raw CD sector reader excludes sync and ECC data", async () => {
  const sector = new Uint8Array(2352);
  sector.fill(0x80, 16, 16 + 2048);
  const bin = new Blob([sector]);
  const disc = new Disc(bin, [{number: 1, kind: "MODE1/2352", start: 0}]);
  assert.equal((await disc.read(0, 100)).length, 100);
  assert.equal((await disc.read(0, 100))[0], 0x80);
  await assert.rejects(disc.read(1, 1), /wykracza/);
});
