import {parseCue, Disc} from "./web/disc.js";
import {createZip} from "./web/zip.js";
import {message, translateRuntime} from "./web/i18n.js";

const $ = (id) => document.getElementById(id);
const names = {INDY3T: {prg: "INDY3T.PRG", inf: "INDY3T.INF"},
  LOOM: {prg: "LOOM.PRG", inf: "LOOMCD.INF"},
  ZAK: {prg: "ZAKT.PRG", inf: "ZAKT.INF"}};
let running = false;
let downloadURL = null;
let worker = null;
let language = "pl";
try { language = localStorage.getItem("scummst-language") === "en" ? "en" : "pl"; } catch { /* Storage may be disabled. */ }
let currentStatus = {key: "waiting", percent: null};
let outputSummary = null;
const logEntries = [];
const t = (key, values) => message(language, key, values);

function renderLog() {
  const area = $("log");
  area.textContent = logEntries.map((entry) => entry.key ? t(entry.key, entry.values) : translateRuntime(language, entry.text)).join("\n");
  if (logEntries.length) area.textContent += "\n";
  area.scrollTop = area.scrollHeight;
}
function setLanguage(lang) {
  language = lang === "en" ? "en" : "pl";
  document.documentElement.lang = language;
  try { localStorage.setItem("scummst-language", language); } catch { /* Storage may be disabled. */ }
  for (const element of document.querySelectorAll("[data-i18n]")) element.textContent = t(element.dataset.i18n);
  for (const element of document.querySelectorAll("[data-i18n-html]")) element.innerHTML = t(element.dataset.i18nHtml);
  for (const element of document.querySelectorAll("[data-i18n-aria-label]")) element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  document.querySelectorAll("[data-lang]").forEach((button) => {
    const active = button.dataset.lang === language;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("status").textContent = t(currentStatus.key);
  if (outputSummary) renderSummary();
  renderLog();
}

function game() { return document.querySelector('input[name="game"]:checked').value; }
function files(id) { return [...$(id).files]; }
function file(id) { return files(id)[0] || null; }
function log(text) {
  logEntries.push({text});
  renderLog();
}
function logKey(key, values = {}) { logEntries.push({key, values}); renderLog(); }
function status(key, percent = null) {
  currentStatus = {key, percent};
  $("result").classList.remove("hidden");
  $("status").textContent = t(key);
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
  logEntries.length = 0;
  $("output-path").textContent = "";
  outputSummary = null;
  $("progress").classList.add("hidden");
  $("progress").value = 0;
}

async function validate() {
  const cueFile = file("cue"), binFile = file("bin");
  if (!cueFile || !binFile) throw new Error(message("pl", "missingCueBin"));
  const cue = parseCue(await cueFile.text());
  if (cue.binName.toLowerCase() !== binFile.name.toLowerCase())
    throw new Error(`CUE wskazuje plik ${cue.binName}, a wybrano ${binFile.name}.`);
  const disc = new Disc(binFile, cue.tracks);
  if (game() === "LOOM") {
    if (cue.tracks.length !== 2 || cue.tracks[1].kind !== "AUDIO" || cue.tracks[1].start !== 22500)
      throw new Error(message("pl", "loomDisc"));
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
  status("checking", 2);
  try {
    const input = await validate();
    status("valid", 100);
    logKey("checkOk", {game: input.game});
    logKey("checkPartial");
  } catch (error) { status("cannotContinue"); log(error.message); }
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
    status("packing", 93 + Math.round(fraction * 7));
  });
  showFiles(ready);
  downloadURL = URL.createObjectURL(zip);
  const download = $("download");
  download.href = downloadURL;
  download.download = `${game()}-SCUMMST-READY.zip`;
  download.classList.remove("hidden");
  status("complete", 100);
  outputSummary = {count: ready.size, size: readableSize(zip.size), missingProgram: !file("prg") || !file("inf")};
  renderSummary();
  logKey("doneLog");
  setRunning(false);
  worker?.terminate(); worker = null;
}

async function convert() {
  if (running) return;
  clearOutput();
  setRunning(true);
  status("checking", 1);
  let input;
  try { input = await validate(); }
  catch (error) { status("cannotContinue"); log(error.message); setRunning(false); return; }
  worker = new Worker(new URL("./web/worker.js", import.meta.url), {type: "module"});
  worker.onmessage = async ({data}) => {
    if (data.type === "log") { log(data.text); if (data.percent !== undefined) status("converting", data.percent); }
    else if (data.type === "error") {
      status("conversionError"); log(data.error); setRunning(false); worker.terminate(); worker = null;
    } else if (data.type === "done") {
      try { await complete(data); }
      catch (error) { status("zipError"); log(error.message); setRunning(false); }
    }
  };
  worker.onerror = (event) => {
    status("wasmError"); log(event.message || t("unknownWorker"));
    setRunning(false); worker.terminate(); worker = null;
  };
  status("startingWasm", 2);
  worker.postMessage(input);
}

document.querySelectorAll('input[name="game"]').forEach((radio) => radio.addEventListener("change", selectedGame));
$("check").addEventListener("click", check);
$("convert").addEventListener("click", convert);
$("copy-log").addEventListener("click", () => navigator.clipboard.writeText($("log").textContent));
document.querySelectorAll("[data-lang]").forEach((button) => button.addEventListener("click", () => setLanguage(button.dataset.lang)));
function renderSummary() {
  $("output-path").textContent = t("readyCount", outputSummary) + (outputSummary.missingProgram ? t("missingProgram") : "");
}
setLanguage(language);
selectedGame();
