import createScummST from "./scummst-engine.js";
import {parseCue, Disc} from "./disc.js";
import {convertTownsAudio, convertLoomAudio} from "./audio.js";

const required = {
  INDY3T: {stem: "INDY3T", fonts: ["98.LFL", "99.LFL"], marker: "TOWNS.ID"},
  LOOM: {stem: "LOOMCD", fonts: ["901.LFL", "902.LFL", "903.LFL", "904.LFL"]},
  ZAK: {stem: "ZAKT", fonts: ["98.LFL", "99.LFL"], marker: "ZAK.ID"},
};

const log = (text, percent) => self.postMessage({type: "log", text, percent});

async function run({game, cueFile, binFile, dataFiles}) {
  const spec = required[game];
  if (!spec) throw new Error("Nieznana gra.");
  log("Odczyt CUE i walidacja obrazu CD…", 2);
  const cue = parseCue(await cueFile.text());
  if (cue.binName.toLowerCase() !== binFile.name.toLowerCase())
    throw new Error(`CUE wskazuje ${cue.binName}, a wybrano ${binFile.name}.`);
  const disc = new Disc(binFile, cue.tracks);
  let source;
  if (game === "LOOM") {
    source = new Map();
    for (const file of dataFiles) {
      const name = file.name.toUpperCase();
      if (!/^(000|901|902|903|904)\.LFL$|^DISK01\.LEC$/.test(name)) continue;
      if (source.has(name)) throw new Error(`Powtórzony plik ${name}.`);
      source.set(name, new Uint8Array(await file.arrayBuffer()));
    }
    for (const name of ["000.LFL", "DISK01.LEC", ...spec.fonts])
      if (!source.has(name)) throw new Error(`Brak pliku Loom ${name}.`);
    if (disc.tracks.length !== 2 || disc.tracks[1].kind !== "AUDIO" || disc.tracks[1].start !== 22500)
      throw new Error("Ta płyta nie ma układu Loom VGA CD.");
  } else {
    log("Ekstrakcja angielskich plików LFL z ISO9660…", 7);
    source = await disc.extractEnglish(game);
  }
  log(`Wczytano ${source.size} plików źródłowych. Ładuję konwerter WebAssembly…`, 17);

  const module = await createScummST({
    locateFile: (name) => new URL(name, import.meta.url).href,
    print: (line) => log(line),
    printErr: (line) => log(`stderr: ${line}`),
  });
  const {FS} = module;
  FS.mkdir("/game");
  for (const [name, data] of source) FS.writeFile(`/game/${name}`, data);
  log("Konwersja zasobów do planarnych .ST0/.ST1…", 25);
  module.callMain(["-p", "/game/"]);
  const outputs = new Map();
  for (const extension of ["ST0", "ST1"]) {
    const name = FS.readdir("/game").find((file) => file.toUpperCase() === `${spec.stem}.${extension}`);
    if (!name) throw new Error(`Konwerter nie utworzył ${spec.stem}.${extension}.`);
    outputs.set(`${spec.stem}.${extension}`, FS.readFile(`/game/${name}`));
  }
  for (const name of spec.fonts) outputs.set(name, source.get(name));
  log("Grafika gotowa. Przygotowuję dźwięk 8-bit / 12516 Hz…", 42);

  if (game === "LOOM") {
    const audio = await convertLoomAudio(disc, (fraction) => {
      if (Math.floor(fraction * 20) !== Math.floor((fraction - 0.005) * 20))
        log(`Loom CD: ${Math.round(fraction * 100)}%`, 42 + Math.round(fraction * 48));
    });
    outputs.set("LOOMCD.PCM", audio);
  } else {
    let last = -1;
    const audio = await convertTownsAudio(game, disc, source, ({sound, fraction}) => {
      const step = Math.floor(sound / 10);
      if (step !== last) {
        last = step;
        log(`Audio FM-Towns: dźwięk ${sound}`, 42 + Math.min(48, Math.round(sound / 256 * 48)));
      }
    });
    for (const [name, bytes] of audio) outputs.set(name, bytes);
  }
  log("Konwersja zakończona. Tworzę paczkę ZIP…", 93);
  const files = [...outputs].map(([name, data]) => ({name, data}));
  self.postMessage({type: "done", files}, files.map(({data}) => data.buffer));
}

self.onmessage = async ({data}) => {
  try { await run(data); }
  catch (error) { self.postMessage({type: "error", error: error instanceof Error ? error.message : String(error)}); }
};
