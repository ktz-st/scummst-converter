// Browser-side extraction of the English FM-Towns LFL files. The image is
// accessed with Blob.slice(), so the whole CD is never loaded into RAM.
const SECTOR = 2352;
const USER_OFFSET = 16;
const USER_SIZE = 2048;
export const LOOM_FILES = ["000.LFL", "DISK01.LEC", "901.LFL", "902.LFL", "903.LFL", "904.LFL"];

function u32(bytes, at) {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
}

export function parseCue(text) {
  const names = [...text.matchAll(/^\s*FILE\s+"([^"]+)"\s+BINARY\s*$/gim)].map((m) => m[1]);
  if (names.length !== 1) throw new Error("Oczekiwany jest CUE z jednym surowym plikiem BIN.");
  const tracks = [];
  for (const line of text.split(/\r?\n/)) {
    const track = line.match(/^\s*TRACK\s+(\d+)\s+(\S+)/i);
    if (track) {
      tracks.push({number: Number(track[1]), kind: track[2].toUpperCase(), start: null});
      continue;
    }
    const index = line.match(/^\s*INDEX\s+01\s+(\d+):(\d+):(\d+)/i);
    if (index && tracks.length) {
      const [, mm, ss, ff] = index.map(Number);
      if (ss >= 60 || ff >= 75) throw new Error("Niepoprawny czas w CUE.");
      tracks.at(-1).start = (mm * 60 + ss) * 75 + ff;
    }
  }
  if (tracks.some((track) => track.start === null)) throw new Error("Ścieżka CUE nie ma INDEX 01.");
  if (!tracks.length || tracks[0].number !== 1 || tracks[0].kind !== "MODE1/2352" || tracks[0].start !== 0)
    throw new Error("Pierwsza ścieżka musi być MODE1/2352 od sektora 0.");
  for (let i = 0; i + 1 < tracks.length; i++) {
    tracks[i].end = tracks[i + 1].start;
    if (tracks[i].end <= tracks[i].start) throw new Error("Puste lub nieuporządkowane ścieżki CUE.");
  }
  return {binName: names[0].replaceAll("\\", "/").split("/").at(-1), tracks};
}

export class Disc {
  constructor(bin, tracks) {
    if (bin.size % SECTOR !== 0) throw new Error("BIN nie ma rozmiaru wielokrotności 2352 bajtów.");
    this.bin = bin;
    this.tracks = tracks;
    this.tracks.at(-1).end = bin.size / SECTOR;
    if (this.tracks.at(-1).end <= this.tracks.at(-1).start)
      throw new Error("Ostatnia ścieżka wykracza poza BIN.");
    this.files = new Map();
  }

  async read(sector, size) {
    if (!Number.isSafeInteger(sector) || !Number.isSafeInteger(size) || sector < 0 || size < 0 ||
        sector + Math.ceil(size / USER_SIZE) > this.tracks[0].end)
      throw new Error("Zakres ISO wykracza poza ścieżkę danych.");
    const count = Math.ceil(size / USER_SIZE);
    const result = new Uint8Array(count * USER_SIZE);
    for (let i = 0; i < count; i++) {
      const offset = (sector + i) * SECTOR + USER_OFFSET;
      const part = new Uint8Array(await this.bin.slice(offset, offset + USER_SIZE).arrayBuffer());
      if (part.length !== USER_SIZE) throw new Error("Ucięty sektor ISO.");
      result.set(part, i * USER_SIZE);
    }
    return result.subarray(0, size);
  }

  async scan() {
    const pvd = await this.read(16, USER_SIZE);
    if (String.fromCharCode(...pvd.subarray(0, 7)) !== "\x01CD001\x01")
      throw new Error("Brak katalogu ISO9660 w BIN.");
    await this.walk(u32(pvd, 158), u32(pvd, 166), "", new Set());
    return this.files;
  }

  async walk(sector, size, parent, visited) {
    if (visited.has(`${sector}:${size}`)) throw new Error("Zapętlony katalog ISO.");
    visited.add(`${sector}:${size}`);
    const data = await this.read(sector, size);
    for (let p = 0; p < data.length;) {
      const length = data[p];
      if (!length) { p = (Math.floor(p / USER_SIZE) + 1) * USER_SIZE; continue; }
      if (length < 34 || p + length > data.length) throw new Error("Niepoprawny wpis katalogu ISO.");
      const entry = data.subarray(p, p + length);
      p += length;
      const name = new TextDecoder("ascii").decode(entry.subarray(33, 33 + entry[32])).split(";")[0];
      if (name === "\x00" || name === "\x01") continue;
      const path = `${parent}/${name}`;
      const extent = {sector: u32(entry, 2), size: u32(entry, 10)};
      if (entry[25] & 2) {
        if (path.length > 256) throw new Error("Zbyt głęboki katalog ISO.");
        await this.walk(extent.sector, extent.size, path, visited);
      } else this.files.set(path, extent);
    }
  }

  async extractEnglish(game) {
    const directory = game === "INDY3T" ? "INDY3ENG" : game === "ZAK" ? "ZAKENG" : null;
    if (!directory) throw new Error("Ekstrakcja ISO obsługuje INDY3T i ZAK.");
    if (!this.files.size) await this.scan();
    const result = new Map();
    for (const [path, extent] of this.files) {
      const match = path.match(new RegExp(`^/${directory}/(\\d{2}\\.LFL)$`, "i"));
      if (match) result.set(match[1].toUpperCase(), await this.read(extent.sector, extent.size));
    }
    for (const required of ["00.LFL", "98.LFL", "99.LFL"])
      if (!result.has(required)) throw new Error(`Brak ${required} w katalogu ${directory}.`);
    result.set(game === "INDY3T" ? "TOWNS.ID" : "ZAK.ID",
      new TextEncoder().encode(`${directory} FM-Towns; target ${game === "INDY3T" ? "indy3t" : "zakt"}\n`));
    return result;
  }

  loomExtents() {
    const result = new Map();
    for (const name of LOOM_FILES) {
      const extent = this.files.get(`/${name}`) ||
        [...this.files].find(([path]) => path.toUpperCase() === `/${name}`)?.[1];
      if (!extent) throw new Error(`Brak ${name} w obrazie CD.`);
      result.set(name, extent);
    }
    return result;
  }

  async extractLoom() {
    if (!this.files.size) await this.scan();
    const result = new Map();
    for (const [name, extent] of this.loomExtents())
      result.set(name, await this.read(extent.sector, extent.size));
    return result;
  }
}
