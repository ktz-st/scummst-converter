// ZIP32 store-only archive. Large output files stay as Blob parts rather than
// being concatenated into another giant Uint8Array.
const encoder = new TextEncoder();
const TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let value = i;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  TABLE[i] = value >>> 0;
}
const put16 = (view, at, value) => view.setUint16(at, value, true);
const put32 = (view, at, value) => view.setUint32(at, value >>> 0, true);

async function crc32(blob) {
  let crc = 0xffffffff;
  for (let offset = 0; offset < blob.size; offset += 1024 * 1024) {
    const bytes = new Uint8Array(await blob.slice(offset, offset + 1024 * 1024).arrayBuffer());
    for (const byte of bytes) crc = (crc >>> 8) ^ TABLE[(crc ^ byte) & 255];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function createZip(files, progress = () => {}) {
  const archive = [], central = [];
  let position = 0;
  let count = 0;
  for (const [path, content] of files) {
    if (!/^[\x20-\x7e]+$/.test(path) || path.includes("..") || path.startsWith("/"))
      throw new Error(`Niebezpieczna nazwa w ZIP: ${path}`);
    const blob = content instanceof Blob ? content : new Blob([content]);
    const name = encoder.encode(path);
    if (blob.size > 0xffffffff || position + blob.size + 100 > 0xffffffff)
      throw new Error("ZIP przekracza limit 4 GB.");
    const crc = await crc32(blob);
    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    put32(l, 0, 0x04034b50); put16(l, 4, 20); put16(l, 8, 0);
    put32(l, 14, crc); put32(l, 18, blob.size); put32(l, 22, blob.size);
    put16(l, 26, name.length); local.set(name, 30);
    archive.push(local, blob);

    const header = new Uint8Array(46 + name.length);
    const c = new DataView(header.buffer);
    put32(c, 0, 0x02014b50); put16(c, 4, 20); put16(c, 6, 20);
    put32(c, 16, crc); put32(c, 20, blob.size); put32(c, 24, blob.size);
    put16(c, 28, name.length); put32(c, 42, position); header.set(name, 46);
    central.push(header);
    position += local.length + blob.size;
    count++;
    progress(count / files.size);
  }
  if (count > 65535) throw new Error("Za dużo plików w ZIP32.");
  const centralSize = central.reduce((size, header) => size + header.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  put32(e, 0, 0x06054b50); put16(e, 8, count); put16(e, 10, count);
  put32(e, 12, centralSize); put32(e, 16, position);
  return new Blob([...archive, ...central, end], {type: "application/zip"});
}
