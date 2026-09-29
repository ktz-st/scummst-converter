import {parseCue, Disc} from "./web/disc.js";
import {createZip} from "./web/zip.js";

const $ = (id) => document.getElementById(id);
const names = {INDY3T: {prg: "INDY3T.PRG", inf: "INDY3T.INF"},
  LOOM: {prg: "LOOM.PRG", inf: "LOOMCD.INF"},
  ZAK: {prg: "ZAKT.PRG", inf: "ZAKT.INF"}};
let running = false;
let downloadURL = null;
let worker = null;

function game() { return document.querySelector('input[name="game"]:checked').value; }
function files(id) { return [...$(id).files]; }
function file(id) { return files(id)[0] || null; }
function log(text) {
  const area = $("log");
  area.textContent += `${text}\n`;
  area.scrollTop = area.scrollHeight;
}
function status(text, percent = null) {
  $("result").classList.remove("hidden");
  $("status").textContent = text;
  if (percent !== null) {
    $("progress").classList.remove("hidden");
    $("progress").value = percent;
  }
}
function setRunning(value) {
  running = value;
  $("check").disabled = $("convert").disabled = value;
  document.querySelectorAll("input").forEach((input) => { input.disabled = value; });
  $("spinner").classList.toggle("hidden", !value);
}
function selectedGame() {
  document.querySelectorAll(".game").forEach((card) =>
    card.classList.toggle("active", card.querySelector("input").checked));
  $("data-field").classList.toggle("hidden", game() !== "LOOM");
}
function readableSize(size) {
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${(size / 1024).toFixed(1)} KB`;
}
function clearOutput() {
  if (downloadURL) { URL.revokeObjectURL(downloadURL); downloadURL = null; }
  $("download").classList.add("hidden");
  $("file-list").classList.add("hidden");
  $("file-list").replaceChildren();
  $("log").textContent = "";
  $("output-path").textContent = "";
  $("progress").classList.add("hidden");
  $("progress").value = 0;
}

async function validate() {
  const cueFile = file("cue"), binFile = file("bin");
  if (!cueFile || !binFile) throw new Error("Wybierz CUE i BIN.");
  const cue = parseCue(await cueFile.text());
  if (cue.binName.toLowerCase() !== binFile.name.toLowerCase())
    throw new Error(`CUE wskazuje plik ${cue.binName}, a wybrano ${binFile.name}.`);
  const disc = new Disc(binFile, cue.tracks);
  if (game() === "LOOM") {
    if (cue.tracks.length !== 2 || cue.tracks[1].kind !== "AUDIO" || cue.tracks[1].start !== 22500)
      throw new Error("Wymagana jest płyta Loom VGA CD ze ścieżką AUDIO od 05:00:00.");
    const inputs = files("data").map((item) => item.name.toUpperCase());
    for (const name of ["000.LFL", "DISK01.LEC", "901.LFL", "902.LFL", "903.LFL", "904.LFL"])
      if (!inputs.includes(name)) throw new Error(`Brak wypakowanego pliku Loom ${name}.`);
  } else {
    const entries = await disc.scan();
    const folder = game() === "INDY3T" ? "INDY3ENG" : "ZAKENG";
    for (const name of ["00.LFL", "98.LFL", "99.LFL"])
      if (![...entries.keys()].some((key) => key.toUpperCase() === `/${folder}/${name}`))
        throw new Error(`Brak ${folder}/${name} w obrazie CD.`);
  }
  for (const kind of ["prg", "inf"]) {
    const chosen = file(kind);
    if (chosen && chosen.name.toUpperCase() !== names[game()][kind])
      throw new Error(`Dla ${game()} wybierz ${names[game()][kind]}.`);
  }
  return {cueFile, binFile, dataFiles: files("data"), game: game()};
}

async function check() {
  if (running) return;
  clearOutput();
  setRunning(true);
  status("Sprawdzanie plików…", 2);
  try {
    const input = await validate();
    status("Pliki wyglądają poprawnie", 100);
    log(`${input.game}: CUE, BIN i wymagane pliki źródłowe są dostępne.`);
    log("Sprawdzenie nie obejmuje pełnej walidacji wszystkich zasobów gry.");
  } catch (error) { status("Nie można kontynuować"); log(error.message); }
  finally { setRunning(false); }
}

function showFiles(ready) {
  const list = $("file-list");
  list.replaceChildren();
  for (const [name, content] of ready) {
    const row = document.createElement("div");
    const label = document.createElement("strong");
    const size = document.createElement("span");
    label.textContent = name;
    size.textContent = readableSize(content.size);
    row.append(label, size);
    list.append(row);
  }
  list.classList.remove("hidden");
}

async function complete(message) {
  const ready = new Map(message.files.map(({name, data}) => [name, new Blob([data])]));
  for (const kind of ["prg", "inf"]) {
    const chosen = file(kind);
    if (chosen) ready.set(names[game()][kind], chosen);
  }
  const manifest = {
    game: game(),
    converter: "ScummST resource converter v8, Emscripten / WebAssembly",
    audio: "JavaScript 24-tap resampler, 12516 Hz, 8-bit; not byte-identical to FFmpeg",
    source: {cue: file("cue").name, bin: file("bin").name},
    ready: [...ready].map(([name, content]) => ({name, bytes: content.size})),
    generated: new Date().toISOString(),
  };
  const archive = new Map([["conversion.json", new Blob([JSON.stringify(manifest, null, 2) + "\n"])] ]);
  for (const [name, content] of ready) archive.set(`READY/${name}`, content);
  const zip = await createZip(archive, (fraction) => {
    status("Pakowanie ZIP…", 93 + Math.round(fraction * 7));
  });
  showFiles(ready);
  downloadURL = URL.createObjectURL(zip);
  const download = $("download");
  download.href = downloadURL;
  download.download = `${game()}-SCUMMST-READY.zip`;
  download.classList.remove("hidden");
  status("Gotowe — pobierz ZIP", 100);
  $("output-path").textContent = `${ready.size} plików w READY/ · ${readableSize(zip.size)}` +
    (!file("prg") || !file("inf") ? " · dodaj PRG/INF z własnego builda przed uruchomieniem na STE" : "");
  log("Gotowe. Pliki źródłowe nie opuściły przeglądarki.");
  setRunning(false);
  worker?.terminate(); worker = null;
}

async function convert() {
  if (running) return;
  clearOutput();
  setRunning(true);
  status("Sprawdzanie plików…", 1);
  let input;
  try { input = await validate(); }
  catch (error) { status("Nie można kontynuować"); log(error.message); setRunning(false); return; }
  worker = new Worker(new URL("./web/worker.js", import.meta.url), {type: "module"});
  worker.onmessage = async ({data}) => {
    if (data.type === "log") { log(data.text); if (data.percent !== undefined) status("Trwa konwersja…", data.percent); }
    else if (data.type === "error") {
      status("Błąd konwersji"); log(data.error); setRunning(false); worker.terminate(); worker = null;
    } else if (data.type === "done") {
      try { await complete(data); }
      catch (error) { status("Błąd pakowania ZIP"); log(error.message); setRunning(false); }
    }
  };
  worker.onerror = (event) => {
    status("Błąd modułu WebAssembly"); log(event.message || "Nieznany błąd Workera.");
    setRunning(false); worker.terminate(); worker = null;
  };
  status("Uruchamianie modułu WebAssembly…", 2);
  worker.postMessage(input);
}

document.querySelectorAll('input[name="game"]').forEach((radio) => radio.addEventListener("change", selectedGame));
$("check").addEventListener("click", check);
$("convert").addEventListener("click", convert);
$("copy-log").addEventListener("click", () => navigator.clipboard.writeText($("log").textContent));
selectedGame();
