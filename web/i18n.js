export const translations = {
  pl: {
    local: "100% W PRZEGLĄDARCE", steps: "PŁYTA → KONWERSJA → ZIP",
    hero: "Przenieś przygodę<br><em>na Atari STE.</em>",
    intro: "Wybierz własne pliki źródłowe. Grafika i dźwięk są konwertowane lokalnie przez JavaScript i WebAssembly — nic nie jest wysyłane na serwer.",
    chooseGame: "Wybierz grę", gameHint: "Wersja źródłowa musi odpowiadać opisowi.", gameAria: "Gra",
    inputs: "Pliki wejściowe", inputsHint: "Wybierz CUE oraz wskazany w nim BIN. Dla Loom dołącz także pliki gry wypakowane z płyty.",
    cueFile: "Plik CUE", binFile: "Plik BIN", loomFiles: "Pliki gry Loom", required: "wymagane", optional: "opcjonalnie",
    cueHint: "Tekstowy opis ścieżek płyty.", binHint: "Surowy obraz CD z sektorami 2352 B.",
    loomHint: "Wybierz razem: <code>000.LFL</code>, <code>DISK01.LEC</code> i <code>901–904.LFL</code>.",
    advanced: "Dołącz aktualny program i konfigurację Atari", prgHint: "Program z Twojego lokalnego builda SCUMMST.",
    infHint: "Ustawienia gry z tego samego builda.", runTitle: "Sprawdź i konwertuj",
    runHint: "Konwersja obrazu CD może potrwać kilka minut. Nie zamykaj karty do pobrania ZIP.",
    check: "Sprawdź pliki", convert: "Rozpocznij konwersję",
    note: "Audio ma format 8-bit mono 12516 Hz, a grafika <code>.ST0/.ST1</code> dla SCUMMST. Resampler JS może dać nieco inne próbki niż wcześniejszy pipeline FFmpeg. Plików gry ani PRG nie udostępniamy na stronie.",
    waiting: "Oczekiwanie", download: "Pobierz ZIP", logTitle: "DZIENNIK KONWERSJI", copyLog: "Kopiuj log",
    footer: "GITHUB PAGES · TWOJE PLIKI POZOSTAJĄ W PRZEGLĄDARCE",
    checking: "Sprawdzanie plików…", valid: "Pliki wyglądają poprawnie", cannotContinue: "Nie można kontynuować",
    packing: "Pakowanie ZIP…", complete: "Gotowe — pobierz ZIP", converting: "Trwa konwersja…",
    conversionError: "Błąd konwersji", zipError: "Błąd pakowania ZIP", wasmError: "Błąd modułu WebAssembly",
    startingWasm: "Uruchamianie modułu WebAssembly…", unknownWorker: "Nieznany błąd Workera.",
    missingCueBin: "Wybierz CUE i BIN.", loomDisc: "Wymagana jest płyta Loom VGA CD ze ścieżką AUDIO od 05:00:00.",
    checkOk: "{game}: CUE, BIN i wymagane pliki źródłowe są dostępne.", checkPartial: "Sprawdzenie nie obejmuje pełnej walidacji wszystkich zasobów gry.",
    readyCount: "{count} plików w READY/ · {size}", missingProgram: " · dodaj PRG/INF z własnego builda przed uruchomieniem na STE",
    doneLog: "Gotowe. Pliki źródłowe nie opuściły przeglądarki.",
  },
  en: {
    local: "100% IN YOUR BROWSER", steps: "DISC → CONVERT → ZIP",
    hero: "Bring the adventure<br><em>to Atari STE.</em>",
    intro: "Select your own source files. Graphics and audio are converted locally with JavaScript and WebAssembly — nothing is uploaded to a server.",
    chooseGame: "Choose a game", gameHint: "The source version must match the description.", gameAria: "Game",
    inputs: "Source files", inputsHint: "Select the CUE and the BIN it references. For Loom, also add the game files extracted from the disc.",
    cueFile: "CUE file", binFile: "BIN file", loomFiles: "Loom game files", required: "required", optional: "optional",
    cueHint: "Text description of the CD tracks.", binHint: "Raw CD image with 2352-byte sectors.",
    loomHint: "Select together: <code>000.LFL</code>, <code>DISK01.LEC</code>, and <code>901–904.LFL</code>.",
    advanced: "Add the Atari program and configuration", prgHint: "Program from your local SCUMMST build.",
    infHint: "Game settings from the same build.", runTitle: "Check and convert",
    runHint: "CD conversion may take a few minutes. Keep this tab open until you download the ZIP.",
    check: "Check files", convert: "Start conversion",
    note: "Audio is 8-bit mono at 12516 Hz; graphics are SCUMMST <code>.ST0/.ST1</code> files. The JavaScript resampler may produce slightly different samples than the earlier FFmpeg pipeline. Game files and PRGs are not hosted here.",
    waiting: "Waiting", download: "Download ZIP", logTitle: "CONVERSION LOG", copyLog: "Copy log",
    footer: "GITHUB PAGES · YOUR FILES STAY IN YOUR BROWSER",
    checking: "Checking files…", valid: "Files look valid", cannotContinue: "Cannot continue",
    packing: "Creating ZIP…", complete: "Ready — download ZIP", converting: "Converting…",
    conversionError: "Conversion error", zipError: "ZIP packaging error", wasmError: "WebAssembly module error",
    startingWasm: "Starting WebAssembly module…", unknownWorker: "Unknown Worker error.",
    missingCueBin: "Select both a CUE and a BIN file.", loomDisc: "Loom VGA CD with an AUDIO track starting at 05:00:00 is required.",
    checkOk: "{game}: CUE, BIN, and required source files are available.", checkPartial: "This check does not fully validate every game resource.",
    readyCount: "{count} files in READY/ · {size}", missingProgram: " · add PRG/INF from your own build before running on STE",
    doneLog: "Done. Your source files never left the browser.",
  },
};

export function message(lang, key, values = {}) {
  const template = (translations[lang] || translations.pl)[key];
  if (template === undefined) throw new Error(`Missing translation: ${lang}/${key}`);
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}

// The conversion libraries keep their original Polish diagnostics so existing
// tests and the WASM converter remain unchanged. Translate only at the UI edge.
const exact = new Map([
  ["Oczekiwany jest CUE z jednym surowym plikiem BIN.", "Expected a CUE with one raw BIN file."],
  ["Wybierz CUE i BIN.", "Select both a CUE and a BIN file."],
  ["Wymagana jest płyta Loom VGA CD ze ścieżką AUDIO od 05:00:00.", "Loom VGA CD with an AUDIO track starting at 05:00:00 is required."],
  ["Niepoprawny czas w CUE.", "Invalid time in CUE."],
  ["Ścieżka CUE nie ma INDEX 01.", "CUE track has no INDEX 01."],
  ["Pierwsza ścieżka musi być MODE1/2352 od sektora 0.", "First track must be MODE1/2352 starting at sector 0."],
  ["Puste lub nieuporządkowane ścieżki CUE.", "Empty or out-of-order CUE tracks."],
  ["BIN nie ma rozmiaru wielokrotności 2352 bajtów.", "BIN size is not a multiple of 2352 bytes."],
  ["Ostatnia ścieżka wykracza poza BIN.", "Final track extends beyond the BIN file."],
  ["Zakres ISO wykracza poza ścieżkę danych.", "ISO range extends beyond the data track."],
  ["Ucięty sektor ISO.", "Truncated ISO sector."],
  ["Brak katalogu ISO9660 w BIN.", "ISO9660 directory not found in BIN."],
  ["Zapętlony katalog ISO.", "ISO directory loop detected."],
  ["Niepoprawny wpis katalogu ISO.", "Invalid ISO directory entry."],
  ["Zbyt głęboki katalog ISO.", "ISO directory is too deep."],
  ["Ekstrakcja ISO obsługuje INDY3T i ZAK.", "ISO extraction supports INDY3T and ZAK."],
  ["Niebezpieczna nazwa w ZIP:", "Unsafe ZIP filename:"],
  ["ZIP przekracza limit 4 GB.", "ZIP exceeds the 4 GB limit."],
  ["Za dużo plików w ZIP32.", "Too many files for ZIP32."],
  ["Niepoprawny zakres audio CD.", "Invalid CD audio range."],
  ["Niepoprawny katalog dźwięków LFL.", "Invalid LFL sound directory."],
  ["Niepoprawna długość katalogu 0N.", "Invalid 0N directory length."],
  ["Brak katalogu dźwięków 0N.", "0N sound directory not found."],
  ["Ucięty nagłówek PCM FM-Towns.", "Truncated FM-Towns PCM header."],
  ["Niepoprawny zakres próbki FM-Towns.", "Invalid FM-Towns sample range."],
  ["Próbka z transpozycją wymaga osobnej konwersji.", "Transposed sample requires separate conversion."],
  ["Niepoprawna szybkość odtwarzania próbki.", "Invalid sample playback rate."],
  ["Pusta pętla PCM po usunięciu znacznika.", "Empty PCM loop after marker removal."],
  ["Pusta pętla PCM po resamplingu.", "Empty PCM loop after resampling."],
  ["Audio FM-Towns: nieznana gra.", "FM-Towns audio: unknown game."],
  ["ID dźwięków ZAK nakładają się na drugi głos.", "ZAK sound IDs overlap the second voice."],
  ["Nieobsługiwana liczba głosów PCM.", "Unsupported number of PCM voices."],
  ["Brak miejsca na drugi głos PCM.", "No room for the second PCM voice."],
  ["Niepoprawny bank SFX INDY3T.", "Invalid INDY3T SFX bank."],
  ["LOOM wymaga jednej ścieżki AUDIO od 05:00:00.", "LOOM requires one AUDIO track starting at 05:00:00."],
  ["Nieznana gra.", "Unknown game."],
  ["Odczyt CUE i walidacja obrazu CD…", "Reading CUE and validating CD image…"],
  ["Ta płyta nie ma układu Loom VGA CD.", "This disc does not have the Loom VGA CD track layout."],
  ["Ekstrakcja angielskich plików LFL z ISO9660…", "Extracting English LFL files from ISO9660…"],
  ["Konwersja zasobów do planarnych .ST0/.ST1…", "Converting resources to planar .ST0/.ST1…"],
  ["Grafika gotowa. Przygotowuję dźwięk 8-bit / 12516 Hz…", "Graphics ready. Preparing 8-bit / 12516 Hz audio…"],
  ["Konwersja zakończona. Tworzę paczkę ZIP…", "Conversion finished. Creating ZIP…"],
]);

const patterns = [
  [/^CUE wskazuje(?: plik)? (.*), a wybrano (.*)\.$/, (_, cue, bin) => `CUE references ${cue}, but you selected ${bin}.`],
  [/^Brak wypakowanego pliku Loom (.*)\.$/, (_, name) => `Extracted Loom file ${name} is missing.`],
  [/^Brak (.*) w obrazie CD\.$/, (_, name) => `${name} is missing from the CD image.`],
  [/^Dla (.*) wybierz (.*)\.$/, (_, game, name) => `For ${game}, select ${name}.`],
  [/^Brak (.*) w katalogu (.*)\.$/, (_, name, folder) => `${name} is missing from ${folder}.`],
  [/^Brak pokoju (.*) dla dźwięku (.*)\.$/, (_, room, id) => `Room ${room} for sound ${id} is missing.`],
  [/^Ucięty dźwięk (.*)\.$/, (_, id) => `Truncated sound ${id}.`],
  [/^Ucięta wskazówka CD (.*)\.$/, (_, id) => `Truncated CD cue ${id}.`],
  [/^Niepoprawna ścieżka CD dźwięku (.*)\.$/, (_, id) => `Invalid CD track for sound ${id}.`],
  [/^Fragment CD (.*) wykracza poza ścieżkę\.$/, (_, id) => `CD fragment ${id} extends beyond its track.`],
  [/^Powtórzony plik (.*)\.$/, (_, name) => `Duplicate file ${name}.`],
  [/^Brak pliku Loom (.*)\.$/, (_, name) => `Loom file ${name} is missing.`],
  [/^Brak (.*)\.$/, (_, name) => `Missing ${name}.`],
  [/^Wczytano (\d+) plików źródłowych\. Ładuję konwerter WebAssembly…$/, (_, count) => `Loaded ${count} source files. Loading WebAssembly converter…`],
  [/^Konwerter nie utworzył (.*)\.$/, (_, name) => `Converter did not create ${name}.`],
  [/^Audio FM-Towns: dźwięk (\d+)$/, (_, sound) => `FM-Towns audio: sound ${sound}`],
];

export function translateRuntime(lang, text) {
  if (lang !== "en") return text;
  if (exact.has(text)) return exact.get(text);
  for (const [pattern, render] of patterns) {
    const match = text.match(pattern);
    if (match) return render(...match);
  }
  for (const [source, target] of exact) {
    if (text.startsWith(`${source} `)) return target + text.slice(source.length);
  }
  return text;
}
