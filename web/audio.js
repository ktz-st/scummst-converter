// Pure-JavaScript audio path for GitHub Pages. Source samples never leave the
// browser. The 24-tap windowed-sinc resampler is deterministic but is not a
// byte-for-byte clone of FFmpeg's swresample.
export const RATE = 12516;
const TAPS = 24;
const HALF = TAPS / 2;
const PHASES = 1024;
const CHUNK_FRAMES = 262144;

const u16 = (b, p) => b[p] | (b[p + 1] << 8);
const u32 = (b, p) => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
const put32 = (v, b, p) => { for (let i = 0; i < 4; i++) b[p + i] = (v >>> (i * 8)) & 255; };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const signed = (value) => value < 128 ? value : value - 256;

function filterTable(sourceRate) {
  const cutoff = Math.min(1, RATE / sourceRate) * 0.94;
  const table = new Float32Array(PHASES * TAPS);
  for (let phase = 0; phase < PHASES; phase++) {
    const fraction = phase / PHASES;
    let sum = 0;
    for (let tap = 0; tap < TAPS; tap++) {
      const distance = tap - (HALF - 1) - fraction;
      const x = Math.PI * distance * cutoff;
      const sinc = x === 0 ? 1 : Math.sin(x) / x;
      const window = Math.abs(distance) < HALF ? 0.5 + 0.5 * Math.cos(Math.PI * distance / HALF) : 0;
      const value = cutoff * sinc * window;
      table[phase * TAPS + tap] = value;
      sum += value;
    }
    for (let tap = 0; tap < TAPS; tap++) table[phase * TAPS + tap] /= sum;
  }
  return table;
}

function quantize(value) {
  return clamp(Math.round(value * 128), -128, 127) & 255;
}

function createLimiter(options = {}) {
  const gain = 10 ** ((options.gainDb || 0) / 20);
  const ceiling = options.ceiling ?? 1;
  const release = 1 - Math.exp(-1 / (RATE * 0.08));
  let reduction = 1;
  return (sample) => {
    const boosted = sample * gain;
    const target = Math.abs(boosted) > ceiling ? ceiling / Math.abs(boosted) : 1;
    reduction = target < reduction ? target : reduction + (target - reduction) * release;
    return quantize(boosted * reduction);
  };
}

export function resampleTowns(raw, sourceRate, velocity = 127) {
  const table = filterTable(sourceRate);
  const result = new Uint8Array(Math.round(raw.length * RATE / sourceRate));
  for (let out = 0; out < result.length; out++) {
    const position = out * sourceRate / RATE;
    const center = Math.floor(position);
    const phase = clamp(Math.round((position - center) * PHASES), 0, PHASES - 1);
    let value = 0;
    const base = phase * TAPS;
    for (let tap = 0; tap < TAPS; tap++) {
      const index = clamp(center + tap - HALF + 1, 0, raw.length - 1);
      const byte = raw[index];
      const towns = (byte & 128) ? (byte & 127) : -byte;
      value += (towns / 128) * table[base + tap];
    }
    result[out] = quantize(value * velocity / 127);
  }
  return result;
}

export async function resampleCD(bin, byteStart, byteLength, options = {}, progress = () => {}) {
  if (byteStart < 0 || byteLength <= 0 || byteLength % 4 || byteStart + byteLength > bin.size)
    throw new Error("Niepoprawny zakres audio CD.");
  const inputFrames = byteLength / 4;
  const result = new Uint8Array(Math.round(inputFrames * RATE / 44100));
  const table = filterTable(44100);
  const process = createLimiter(options);
  let chunkStart = -1, chunkEnd = -1, samples = null;
  for (let out = 0; out < result.length; out++) {
    const position = out * 44100 / RATE;
    const center = Math.floor(position);
    if (center + HALF >= chunkEnd) {
      chunkStart = Math.max(0, center - HALF);
      chunkEnd = Math.min(inputFrames, chunkStart + CHUNK_FRAMES + TAPS * 2);
      const raw = await bin.slice(byteStart + chunkStart * 4, byteStart + chunkEnd * 4).arrayBuffer();
      const view = new DataView(raw);
      samples = new Float32Array(chunkEnd - chunkStart);
      for (let i = 0; i < samples.length; i++)
        samples[i] = (view.getInt16(i * 4, true) + view.getInt16(i * 4 + 2, true)) / 65536;
      progress(out / result.length);
    }
    const phase = clamp(Math.round((position - center) * PHASES), 0, PHASES - 1);
    const base = phase * TAPS;
    let value = 0;
    for (let tap = 0; tap < TAPS; tap++) {
      const index = clamp(center + tap - HALF + 1, 0, inputFrames - 1) - chunkStart;
      value += samples[index] * table[base + tap];
    }
    result[out] = process(value);
  }
  progress(1);
  return result;
}

export function soundDirectory(data) {
  for (let p = 0; p + 8 <= data.length;) {
    const size = u32(data, p);
    if (size < 8 || p + size > data.length) throw new Error("Niepoprawny katalog dźwięków LFL.");
    if (data[p + 4] === 0x30 && data[p + 5] === 0x4e) {
      const count = u16(data, p + 6);
      if (size !== 8 + count * 5) throw new Error("Niepoprawna długość katalogu 0N.");
      return Array.from({length: count}, (_, i) => [data[p + 8 + i * 5], u32(data, p + 9 + i * 5)]);
    }
    p += size;
  }
  throw new Error("Brak katalogu dźwięków 0N.");
}

export function townsWave(data, at) {
  if (at + 32 > data.length) throw new Error("Ucięty nagłówek PCM FM-Towns.");
  const size = u32(data, at + 12), loop = u32(data, at + 16), length = u32(data, at + 20);
  if (!size || at + 32 + size > data.length || loop + length > size)
    throw new Error("Niepoprawny zakres próbki FM-Towns.");
  if (data[50] !== u32(data, at + 28)) throw new Error("Próbka z transpozycją wymaga osobnej konwersji.");
  const step = u16(data, at + 24) + u16(data, at + 26);
  if (step <= 0 || step > 2048) throw new Error("Niepoprawna szybkość odtwarzania próbki.");
  const sourceRate = Math.round(19300 * step / 2048);
  let raw = data.subarray(at + 32, at + 32 + size);
  let loopLength = length;
  if (length) {
    while (raw.length && raw.at(-1) === 255) raw = raw.subarray(0, -1);
    loopLength = Math.min(loop + length, raw.length) - loop;
    if (loopLength <= 0) throw new Error("Pusta pętla PCM po usunięciu znacznika.");
  }
  const pcm = resampleTowns(raw, sourceRate, data[14] >> 1);
  const start = length ? Math.round(loop * RATE / sourceRate) : 0;
  const end = length ? Math.min(pcm.length, Math.round((loop + loopLength) * RATE / sourceRate)) : 0;
  if (length && end <= start) throw new Error("Pusta pętla PCM po resamplingu.");
  return {pcm, loop: start, loopLength: end - start, next: at + 32 + size};
}

function merge(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function offsetBinary(pcm) {
  const result = new Uint8Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) result[i] = (signed(pcm[i]) + 128) & 255;
  return result;
}

function encodeIndex(signature, entries) {
  const result = new Uint8Array(32 + 256 * 32);
  result.set(new TextEncoder().encode(signature), 0);
  for (const [position, value] of [1, RATE, 256, 256, 256, 2, 0].entries()) put32(value, result, 4 + position * 4);
  for (let i = 0; i < 256; i++)
    for (let field = 0; field < 8; field++) put32(entries[i][field], result, 32 + i * 32 + field * 4);
  return result;
}

export async function convertTownsAudio(game, disc, lfl, progress = () => {}) {
  if (game !== "INDY3T" && game !== "ZAK") throw new Error("Audio FM-Towns: nieznana gra.");
  const entries = Array.from({length: 256}, () => Array(8).fill(0));
  const soundLocations = soundDirectory(lfl.get("00.LFL"));
  if (game === "ZAK" && soundLocations.slice(192).some(([room, offset]) => room && offset !== 0xffffffff))
    throw new Error("ID dźwięków ZAK nakładają się na drugi głos.");
  const musicIds = new Set([29, 35, 38, 39, 40, 41, 42, 54, 66, 67, 69, 70]);
  if (game === "INDY3T") for (const id of musicIds) entries[id][0] = 3;
  const sfxParts = [], cdParts = [], report = [];
  let sfxBytes = 0, cdBytes = 0, nextVoice = game === "ZAK" ? 192 : 128;
  for (let id = 0; id < soundLocations.length; id++) {
    const [room, offset] = soundLocations[id];
    if (!room || offset === 0xffffffff) continue;
    const file = lfl.get(`${String(room).padStart(2, "0")}.LFL`);
    if (!file) throw new Error(`Brak pokoju ${room} dla dźwięku ${id}.`);
    const size = u32(file, offset);
    const data = file.subarray(offset, offset + size);
    if (data.length !== size || size < 22 || (game === "ZAK" && (data[4] !== 83 || data[5] !== 79)))
      throw new Error(`Ucięty dźwięk ${id}.`);
    const kind = data[13];
    const item = {id, towns_type: kind};
    if (kind === 0) {
      try {
        if (data[20] < 1 || data[20] > 2) throw new Error("Nieobsługiwana liczba głosów PCM.");
        let p = 22;
        const waves = [];
        for (let voice = 0; voice < data[20]; voice++) {
          const wave = townsWave(data, p);
          p = wave.next;
          waves.push(wave);
        }
        for (let voice = 0; voice < waves.length; voice++) {
          const wave = waves[voice];
          const index = voice ? nextVoice++ : id;
          if (index >= 256) throw new Error("Brak miejsca na drugi głos PCM.");
          if (voice) entries[id][7] = index;
          entries[index] = [1, sfxBytes, wave.pcm.length, wave.loop, wave.loopLength,
            wave.loopLength ? 0 : 1, u16(data, 10), 0];
          sfxParts.push(wave.pcm);
          sfxBytes += wave.pcm.length;
        }
        item.samples = waves.length;
      } catch (error) { item.unsupported = String(error.message); }
    } else if (kind === 2) {
      if (data.length < 30) throw new Error(`Ucięta wskazówka CD ${id}.`);
      const [track, loops, sm, ss, sf, em, es, ef] = data.subarray(22, 30);
      const info = disc.tracks[track];
      if (!info || info.kind !== "AUDIO" || ss >= 60 || es >= 60 || sf >= 75 || ef >= 75)
        throw new Error(`Niepoprawna ścieżka CD dźwięku ${id}.`);
      const start = (sm * 60 + ss) * 75 + sf;
      let end = (em * 60 + es) * 75 + ef;
      if (end <= start) end = info.end - info.start;
      if (start < 0 || end > info.end - info.start || end <= start)
        throw new Error(`Fragment CD ${id} wykracza poza ścieżkę.`);
      const gainDb = game === "ZAK" && id === 93 ? 20 * Math.log10(1.25) :
        game === "INDY3T" && id === 35 ? 3 : game === "INDY3T" && id === 80 ? 2.5 : 0;
      const byteStart = (info.start + start) * 2352;
      const pcm = await resampleCD(disc.bin, byteStart, (end - start) * 2352,
        {gainDb}, (fraction) => progress({sound: id, fraction}));
      entries[id] = [2, cdBytes, pcm.length, 0, pcm.length, loops === 255 ? 0 : Math.max(1, loops), 0, 0];
      cdParts.push(pcm);
      cdBytes += pcm.length;
      item.cue_track = track + 1;
      item.bytes = pcm.length;
    } else item.unsupported = "Euphony / nieznany format dźwięku";
    report.push(item);
    progress({sound: id, fraction: 1});
  }
  const signature = game === "ZAK" ? "ZKOF" : "I3OF";
  const index = encodeIndex(signature, entries);
  const sfx = offsetBinary(merge(sfxParts));
  const cd = offsetBinary(merge(cdParts));
  if (game === "INDY3T" && (!sfx.length || sfx.length > 2 * 1024 * 1024))
    throw new Error("Niepoprawny bank SFX INDY3T.");
  return game === "ZAK" ? new Map([["ZAKPCM.IDX", index], ["ZAKSFX.PCM", sfx], ["ZAKCD.PCM", cd]]) :
    new Map([["I3F100.IDX", index], ["I3FX100.PCM", sfx], ["I3CD100.PCM", cd]]);
}

export async function convertLoomAudio(disc, progress = () => {}) {
  if (disc.tracks.length !== 2 || disc.tracks[1].kind !== "AUDIO" || disc.tracks[1].start !== 22500)
    throw new Error("LOOM wymaga jednej ścieżki AUDIO od 05:00:00.");
  const start = disc.tracks[1].start * 2352;
  const length = disc.bin.size - start;
  return resampleCD(disc.bin, start, length, {gainDb: 12.1, ceiling: 0.6138891914894552}, progress);
}
