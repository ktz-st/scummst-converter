import test from "node:test";
import assert from "node:assert/strict";
import {parseMonkeyCue} from "../web/monkey-disc.js";
import {resampleUnsigned8} from "../web/audio.js";

test("Monkey1 CUE supports multiple BIN files and INDEX 01 offsets", () => {
  const cue = `FILE "data.bin" BINARY
 TRACK 01 MODE1/2352
 INDEX 01 00:00:00
FILE "music.bin" BINARY
 TRACK 02 AUDIO
 INDEX 00 00:00:00
 INDEX 01 00:04:18
FILE "next.bin" BINARY
 TRACK 03 AUDIO
 INDEX 01 00:00:00
`;
  const files = [
    {name: "data.bin", size: 100 * 2352},
    {name: "music.bin", size: 500 * 2352},
    {name: "next.bin", size: 300 * 2352},
  ];
  const tracks = parseMonkeyCue(cue, files);
  assert.deepEqual(tracks.map(({number, start, end}) => [number, start, end]),
    [[1, 0, 100], [2, 318, 500], [3, 0, 300]]);
});

test("Monkey1 CUE supports all tracks in one BIN", () => {
  const cue = `FILE "disc.bin" BINARY
 TRACK 01 MODE1/2352
 INDEX 01 00:00:00
 TRACK 02 AUDIO
 INDEX 01 05:00:00
 TRACK 03 AUDIO
 INDEX 01 07:00:00
`;
  const tracks = parseMonkeyCue(cue, [{name: "disc.bin", size: 40000 * 2352}]);
  assert.equal(tracks[0].end, 22500);
  assert.equal(tracks[1].end, 31500);
  assert.equal(tracks[2].end, 40000);
});

test("Monkey1 CUE rejects missing BIN and bad sample extents", () => {
  const cue = `FILE "disc.bin" BINARY
 TRACK 01 MODE1/2352
 INDEX 01 00:00:00
 TRACK 02 AUDIO
 INDEX 01 05:00:00
`;
  assert.throws(() => parseMonkeyCue(cue, []), /Brak pliku BIN/);
  assert.throws(() => parseMonkeyCue(cue, [{name: "disc.bin", size: 100}]), /2352/);
});

test("unsigned VOC silence resamples to signed PCM silence", () => {
  const output = resampleUnsigned8(new Uint8Array(11025).fill(128), 11025);
  assert.equal(output.length, 12516);
  assert.ok(output.every((sample) => sample === 0));
});
