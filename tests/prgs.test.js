import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("bundled Atari executables are valid nonempty TOS PRGs", () => {
  for (const name of ["INDY3T.PRG", "LOOM.PRG", "MONKEY1.PRG", "ZAKT.PRG"]) {
    const data = readFileSync(new URL(`../prgs/${name}`, import.meta.url));
    assert.ok(data.length > 64 * 1024, `${name} is unexpectedly small`);
    assert.equal(data.readUInt16BE(0), 0x601a, `${name} has no TOS executable header`);
  }
});
