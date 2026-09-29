// Multi-file (or single-file) CUE support for the Monkey Island CD soundtrack.
// The original DOS game files are supplied separately; the MODE1 track is
// checked but never extracted or uploaded.
const SECTOR = 2352;

export function parseMonkeyCue(text, bins) {
  const selected = new Map();
  for (const file of bins) {
    const key = file.name.toLowerCase();
    if (selected.has(key)) throw new Error(`Powtórzony plik BIN ${file.name}.`);
    if (file.size % SECTOR) throw new Error(`BIN ${file.name} nie ma rozmiaru wielokrotności 2352 bajtów.`);
    selected.set(key, file);
  }
  const tracks = [];
  let fileName = null;
  for (const line of text.split(/\r?\n/)) {
    const file = line.match(/^\s*FILE\s+"([^"]+)"\s+BINARY\s*$/i);
    if (file) {
      fileName = file[1].replaceAll("\\", "/").split("/").at(-1);
      continue;
    }
    const track = line.match(/^\s*TRACK\s+(\d+)\s+(\S+)/i);
    if (track) {
      if (!fileName) throw new Error("TRACK w CUE nie ma poprzedzającego FILE.");
      tracks.push({number: Number(track[1]), kind: track[2].toUpperCase(), fileName, start: null});
      continue;
    }
    const index = line.match(/^\s*INDEX\s+01\s+(\d+):(\d+):(\d+)/i);
    if (index && tracks.length) {
      const [, mm, ss, ff] = index.map(Number);
      if (ss >= 60 || ff >= 75) throw new Error("Niepoprawny czas w CUE.");
      tracks.at(-1).start = (mm * 60 + ss) * 75 + ff;
    }
  }
  if (tracks.length < 2 || tracks[0].number !== 1 || tracks[0].kind !== "MODE1/2352" || tracks[0].start !== 0)
    throw new Error("Monkey1 CD wymaga ścieżki danych MODE1/2352 od sektora 0 i ścieżek AUDIO.");
  if (tracks.some((track) => track.start === null)) throw new Error("Ścieżka CUE nie ma INDEX 01.");
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    if (track.number !== i + 1 || (i > 0 && track.kind !== "AUDIO"))
      throw new Error("Monkey1 CD wymaga kolejnych ścieżek AUDIO po ścieżce danych.");
    const blob = selected.get(track.fileName.toLowerCase());
    if (!blob) throw new Error(`Brak pliku BIN ${track.fileName} wskazanego w CUE.`);
    track.file = blob;
    const next = tracks.slice(i + 1).find((candidate) => candidate.fileName.toLowerCase() === track.fileName.toLowerCase());
    track.end = next ? next.start : blob.size / SECTOR;
    if (track.start >= track.end) throw new Error(`Pusta ścieżka CD ${track.number}.`);
  }
  return tracks;
}
