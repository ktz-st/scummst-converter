# SCUMMST Converter

[English documentation](README.en.md) · Interfejs strony: przełącznik PL/EN w prawym górnym rogu.

Statyczny konwerter assetów INDY3T, Loom VGA CD i Zak FM-Towns do Atari STE.
Cała konwersja odbywa się w przeglądarce: obrazy płyt nie są przesyłane na serwer.
Strona nadaje się do publikacji na GitHub Pages bez backendu.

## Uruchomienie

Otwórz stronę GitHub Pages tego repozytorium albo lokalnie uruchom dowolny
serwer statyczny, np. `python3 -m http.server 8765`, i przejdź na
`http://127.0.0.1:8765/`. Otwarcie `index.html` przez `file://` nie działa,
ponieważ moduły ES i WebAssembly potrzebują HTTP(S).

1. Wybierz grę oraz własne, oryginalne pliki CUE i BIN.
2. Dla Loom wskaż jednocześnie wypakowane `000.LFL`, `DISK01.LEC` i
   `901.LFL`–`904.LFL`. Dla INDY3T/ZAK strona sama odczytuje angielskie LFL z ISO9660.
3. Opcjonalnie wskaż pasujące `PRG` i `INF` z lokalnego builda SCUMMST.
   Bez nich ZIP zawiera tylko assety, nie kompletną grę.
4. Kliknij „Sprawdź pliki”, następnie „Rozpocznij konwersję”. Pobierz ZIP i
   skopiuj zawartość `READY/` do katalogu gry na Atari STE.

Obsługiwane źródła:

| Gra | Źródło | Wynik |
| --- | --- | --- |
| INDY3T | FM-Towns English, `INDY3ENG` | `INDY3T.ST0/.ST1`, `98/99.LFL`, `I3F100.IDX`, `I3CD100.PCM`, `I3FX100.PCM` |
| LOOM | DOS VGA CD-ROM + wypakowane LFL/LEC | `LOOMCD.ST0/.ST1`, `901–904.LFL`, `LOOMCD.PCM` |
| ZAK | FM-Towns English, `ZAKENG` | `ZAKT.ST0/.ST1`, `98/99.LFL`, `ZAKPCM.IDX`, `ZAKCD.PCM`, `ZAKSFX.PCM` |

Wymagany jest współczesny browser z WebAssembly, modułowymi Workerami i File
API oraz dość wolnej pamięci na kilkudziesięciomegabajtowe assety. Chrome,
Firefox i Safari są docelowymi przeglądarkami; stare mobilne przeglądarki mogą
zakończyć pracę z powodu limitu pamięci. ZIP32 ma limit 4 GB.

## Zgodność i ograniczenia

- `.ST0/.ST1` tworzy oryginalny konwerter zasobów ScummST v8 skompilowany do
  WebAssembly. Kod źródłowy użyty do budowy jest w `engine-src/`.
- Dźwięk jest resamplowany w JavaScript filtrem 24-tap do 8-bit mono 12516 Hz.
  To nie jest bitowo identyczne z FFmpeg: długość pojedynczych cue/SFX może
  różnić się o 1–2 próbki. Bank indeksowy jest budowany dla nowych długości.
- Loom używa profilu +12,1 dB i limitera dobranego dla dostarczonego wcześniej
  wydania CD. Inne wydanie może wymagać osobnej kalibracji głośności.
- Wbudowanych ścieżek Euphony nie konwertujemy; tak samo jak lokalny pipeline.
- Oryginalne pliki gry i PRG nie są częścią repozytorium ani GitHub Pages.
- Konwerter nie buduje kodu gry, nie generuje zapisów i nie modyfikuje źródeł.

## Budowa silnika WebAssembly

Repozytorium zawiera gotowe `web/scummst-engine.js` i
`web/scummst-engine.wasm`. Do przebudowy potrzebny jest Emscripten SDK:

```sh
source /ścieżka/do/emsdk/emsdk_env.sh
bash build-wasm.sh
```

Testy JavaScript (Node 24+):

```sh
node --test tests/disc.test.js tests/zip.test.js
```

Opcjonalne testy porównawcze wymagają własnych obrazów CD i istniejącego
workspace `GCC.ELF`:

```sh
SCUMMST_WORKSPACE=/ścieżka/do/GCC.ELF node --test tests/real-disc.test.js
SCUMMST_WORKSPACE=/ścieżka/do/GCC.ELF node tests/wasm-smoke.mjs INDY3T
SCUMMST_WORKSPACE=/ścieżka/do/GCC.ELF node tests/audio-smoke.mjs LOOM
```

## Publikacja na GitHub Pages

W GitHub → Settings → Pages ustaw „Deploy from a branch”, branch `main`,
folder `/ (root)`. `.nojekyll` pozwala serwować gotowe pliki bez Jekyll.
Nie jest potrzebny serwer Python, Wine ani FFmpeg po stronie użytkownika.

Kod ScummST pochodzi od Andersa Granlunda i projektu ScummVM; licencja
GPL-2.0-or-later, szczegóły w `LICENSE` i nagłówkach plików `engine-src/`.
