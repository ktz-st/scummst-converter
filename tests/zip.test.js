import assert from "node:assert/strict";
import test from "node:test";
import {createZip} from "../web/zip.js";

test("ZIP contains local headers and central directory without copying game data", async () => {
  const archive = await createZip(new Map([
    ["READY/HELLO.TXT", new Blob(["abc"])],
    ["conversion.json", new TextEncoder().encode("{}")],
  ]));
  const bytes = new Uint8Array(await archive.arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(bytes.length - 12, true), 2);
});
