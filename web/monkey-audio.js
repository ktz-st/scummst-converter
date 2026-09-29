// Browser-only equivalent of the MONKEY1 PCM bank recipe. Source MONSTER.SOU
// is read in small Blob slices; it is never copied into the WASM filesystem.
import {RATE, resampleCD, resampleUnsigned8} from "./audio.js";

const le16 = (b, p) => b[p] | (b[p + 1] << 8);
const le32 = (b, p) => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
const be32 = (b, p) => ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
const text = (b, p, n) => String.fromCharCode(...b.subarray(p, p + n));
const put16 = (b, p, n) => { b[p] = n & 255; b[p + 1] = n >>> 8 & 255; };
const put32 = (b, p, n) => { for (let i = 0; i < 4; i++) b[p + i] = n >>> (i * 8) & 255; };

function concat(parts, size) {
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

export function convertedSounds(index, bundle) {
  let directory = null;
  for (let p = 0; p < index.length;) {
    if (p + 8 > index.length) throw new Error("Ucięty MONKEY.ST0.");
    const size = be32(index, p + 4);
    if (size < 8 || p + size > index.length) throw new Error("Niepoprawny blok MONKEY.ST0.");
    if (text(index, p, 4) === "DSOU") directory = index.subarray(p, p + size);
    p += size;
  }
  if (!directory || text(bundle, 0, 4) !== "LECF" || text(bundle, 8, 4) !== "LOFF")
    throw new Error("Niepoprawne zasoby MONKEY.ST0/.ST1.");
  const rooms = new Map();
  const count = bundle[16];
  if (17 + count * 5 > bundle.length) throw new Error("Ucięty katalog pokojów MONKEY.ST1.");
  for (let i = 0; i < count; i++) rooms.set(bundle[17 + i * 5], le32(bundle, 18 + i * 5));
  const sounds = le16(directory, 8);
  if (directory.length !== 10 + sounds * 5) throw new Error("Niepoprawny katalog DSOU.");
  const result = Array(sounds).fill(null);
  for (let i = 0; i < sounds; i++) {
    const room = directory[10 + i];
    const offset = le32(directory, 10 + sounds + i * 4);
    if (!room || offset === 0xffffffff) continue;
    if (!rooms.has(room)) throw new Error(`Brak pokoju ${room} dla dźwięku ${i}.`);
    const start = rooms.get(room) + offset;
    if (start + 8 > bundle.length || text(bundle, start, 4) !== "SOUN")
      throw new Error(`Niepoprawny dźwięk ${i}.`);
    const size = be32(bundle, start + 4);
    if (size < 8 || start + size > bundle.length) throw new Error(`Niepoprawny dźwięk ${i}.`);
    result[i] = bundle.subarray(start, start + size);
  }
  return result;
}

function vocBlock(data, at) {
  if (at + 6 > data.length || data[at] !== 1) throw new Error("Obsługiwany jest tylko VOC type 1.");
  const length = data[at + 1] | data[at + 2] << 8 | data[at + 3] << 16;
  const end = at + 4 + length;
  if (length < 2 || end > data.length || data[at + 5] !== 0 || data[at + 4] === 255)
    throw new Error("Niepoprawny lub skompresowany VOC.");
  return {raw: data.subarray(at + 6, end), rate: Math.round(1000000 / (256 - data[at + 4])), end};
}

function sblPcm(sound) {
  if (text(sound, 8, 4) !== "SOU ") return null;
  for (let p = 16; p < sound.length;) {
    if (p + 8 > sound.length) throw new Error("Ucięty blok SOU.");
    const size = be32(sound, p + 4), end = p + 8 + size;
    if (size < 1 || end > sound.length) throw new Error("Niepoprawny blok SOU.");
    if (text(sound, p, 4) === "SBL ") {
      const block = sound.subarray(p, end);
      if (!["AUhd", "WVhd"].includes(text(block, 8, 4)) ||
          !["AUdt", "WVdt"].includes(text(block, 19, 4)))
        throw new Error("Nieznany układ SBL.");
      const voc = vocBlock(block, 27);
      if (voc.end !== block.length - 1 || block[voc.end] !== 0)
        throw new Error("Nieobsługiwany koniec SBL.");
      return resampleUnsigned8(voc.raw, voc.rate);
    }
    p = end;
  }
  return null;
}

async function speechBank(monster, progress) {
  const first = new Uint8Array(await monster.slice(0, 8).arrayBuffer());
  if (first.length !== 8 || text(first, 0, 8) !== "SOU \0\0\0\0")
    throw new Error("Wymagany jest poprawny MONSTER.SOU.");
  const parts = [], voices = [], markers = [];
  let position = 8, bytes = 0;
  while (position < monster.size) {
    const header = new Uint8Array(await monster.slice(position, Math.min(monster.size, position + 256)).arrayBuffer());
    if (header.length < 40 || text(header, 0, 4) !== "VCTL")
      throw new Error(`Niepoprawny VCTL w MONSTER.SOU na pozycji ${position}.`);
    const size = be32(header, 4);
    if (size < 8 || size > 132 || size % 2 || position + size > monster.size)
      throw new Error(`Niepoprawna długość VCTL na pozycji ${position}.`);
    const markerOffset = markers.length;
    for (let p = 8; p < size; p += 2) markers.push(header[p] << 8 | header[p + 1]);
    if (text(header, size, 20) !== "Creative Voice File\x1a")
      throw new Error(`Niepoprawny nagłówek VOC na pozycji ${position}.`);
    const vocHeader = le16(header, size + 20);
    if (vocHeader < 26 || position + size + vocHeader + 6 > monster.size)
      throw new Error(`Niepoprawny offset VOC na pozycji ${position}.`);
    const block = size + vocHeader;
    if (block + 6 > header.length || header[block] !== 1 || header[block + 5] !== 0 || header[block + 4] === 255)
      throw new Error(`Nieobsługiwany blok VOC na pozycji ${position}.`);
    const length = header[block + 1] | header[block + 2] << 8 | header[block + 3] << 16;
    const end = position + block + 4 + length;
    if (length < 2 || end >= monster.size) throw new Error(`Ucięty VOC na pozycji ${position}.`);
    const raw = new Uint8Array(await monster.slice(position + block + 6, end).arrayBuffer());
    const tail = new Uint8Array(await monster.slice(end, end + 1).arrayBuffer());
    if (raw.length !== length - 2 || tail[0] !== 0) throw new Error(`Nieobsługiwany wieloblokowy VOC na pozycji ${position}.`);
    const rate = Math.round(1000000 / (256 - header[block + 4]));
    const pcm = resampleUnsigned8(raw, rate);
    voices.push([position, bytes, pcm.length, markerOffset, markers.length - markerOffset]);
    parts.push(pcm);
    bytes += pcm.length;
    position = end + 1;
    if (voices.length % 100 === 0) progress({phase: "speech", count: voices.length, fraction: position / monster.size});
  }
  progress({phase: "speech", count: voices.length, fraction: 1});
  return {voices, markers, pcm: concat(parts, bytes)};
}

function makeIndex(entries, voices, markers) {
  const index = new Uint8Array(32 + entries.length * 24 + voices.length * 20 + markers.length * 2);
  index.set(new TextEncoder().encode("M1PC"), 0);
  for (const [i, value] of [1, RATE, entries.length, voices.length, markers.length, 0, 0].entries())
    put32(index, 4 + i * 4, value);
  let p = 32;
  for (const entry of entries) { for (const value of entry) { put32(index, p, value); p += 4; } }
  for (const voice of voices) { for (const value of voice) { put32(index, p, value); p += 4; } }
  for (const marker of markers) { put16(index, p, marker); p += 2; }
  return index;
}

export async function convertMonkeyAudio(tracks, monster, st0, st1, progress = () => {}) {
  const sounds = convertedSounds(st0, st1);
  const trackIndex = new Map(), musicParts = [];
  let musicBytes = 0;
  const audioTracks = tracks.filter((track) => track.kind === "AUDIO");
  for (const [i, track] of audioTracks.entries()) {
    const pcm = await resampleCD(track.file, track.start * 2352, (track.end - track.start) * 2352);
    trackIndex.set(track.number, {offset: musicBytes, length: pcm.length, frames: track.end - track.start, track});
    musicParts.push(pcm);
    musicBytes += pcm.length;
    progress({phase: "music", count: i + 1, total: audioTracks.length, fraction: (i + 1) / audioTracks.length});
  }
  const entries = sounds.map(() => [0, 0, 0, 0, 0, 0]);
  const sfxParts = [];
  let sfxBytes = 0;
  for (let id = 0; id < sounds.length; id++) {
    const sound = sounds[id];
    if (!sound) continue;
    if (sound.length === 32 && sound[15] === 2) {
      const [track, loops, sm, ss, sf, em, es, ef] = sound.subarray(24, 32);
      const source = trackIndex.get(track + 1);
      if (!source) { entries[id] = [3, 0, 0, 0, track, 0]; continue; }
      const start = (sm * 60 + ss) * 75 + sf;
      let end = (em * 60 + es) * 75 + ef;
      if (end <= start) end = source.frames;
      if (start < 0 || end > source.frames || end <= start)
        throw new Error(`Fragment CD ${id} wykracza poza ścieżkę.`);
      const first = Math.floor(start * RATE / 75);
      const last = Math.min(source.length, Math.floor(end * RATE / 75));
      entries[id] = [2, source.offset + first, last - first, loops === 255 ? 0 : Math.max(1, loops), track, start];
    } else {
      const pcm = sblPcm(sound);
      if (pcm) { entries[id] = [1, sfxBytes, pcm.length, 1, 0, 0]; sfxParts.push(pcm); sfxBytes += pcm.length; }
    }
  }
  progress({phase: "sfx", count: sfxParts.length, fraction: 1});
  // CD110 is the intro. Append a louder copy rather than changing the shared
  // track: CD130 still points to the unmodified music bank prefix.
  const intro = entries[110];
  const introTrack = trackIndex.get(18);
  if (!intro || intro[0] !== 2 || intro[4] !== 17 || intro[5] !== 0 || !introTrack || intro[2] !== introTrack.length)
    throw new Error("Nieznana wskazówka intra CD110; nie podgłaszam automatycznie.");
  // The local FFmpeg recipe uses +5.9 dB after its mono downmix. Our JS
  // downmix averages L/R differently, so +9.1 dB with this limiter reaches
  // the same measured ~-14.6 LUFS / -1.5 dBTP on the supplied CD.
  const boosted = await resampleCD(introTrack.track.file, introTrack.track.start * 2352,
    (introTrack.track.end - introTrack.track.start) * 2352, {gainDb: 9.1, ceiling: 0.78});
  if (boosted.length !== intro[2]) throw new Error("Niepoprawna długość podgłośnionego intra.");
  intro[1] = musicBytes;
  musicParts.push(boosted);
  musicBytes += boosted.length;
  progress({phase: "intro", count: 1, fraction: 1});
  const speech = await speechBank(monster, progress);
  return new Map([
    ["M1PCM.IDX", makeIndex(entries, speech.voices, speech.markers)],
    ["M1MUSIC.PCM", concat(musicParts, musicBytes)],
    ["M1VOICE.PCM", speech.pcm],
    ["M1SFX.PCM", concat(sfxParts, sfxBytes)],
  ]);
}
