# SCUMMST Converter

[English documentation](README.en.md) · Interfejs strony: przełącznik PL/EN w prawym górnym rogu.

Statyczny konwerter assetów INDY3T, Loom VGA CD, Monkey1 CD i Zak FM-Towns do Atari STE.
Cała konwersja odbywa się w przeglądarce: obrazy płyt nie są przesyłane na serwer.
Strona nadaje się do publikacji na GitHub Pages bez backendu.

## Uruchomienie

Otwórz stronę GitHub Pages tego repozytorium albo lokalnie uruchom dowolny
serwer statyczny, np. `python3 -m http.server 8765`, i przejdź na
`http://127.0.0.1:8765/`. Otwarcie `index.html` przez `file://` nie działa,
ponieważ moduły ES i WebAssembly potrzebują HTTP(S).

1. Wybierz grę oraz własne, oryginalne pliki CUE i wszystkie wskazane w nim BIN.
2. Dla Loom strona sama wyciąga `000.LFL`, `DISK01.LEC` i `901.LFL`–`904.LFL`
   ze ścieżki danych obrazu CD. Dla Monkey1 wskaż `MONKEY.000`, `MONKEY.001` i
   `MONSTER.SOU` z wersji Ultimate Talkie oraz osobno CUE/BIN płyty CD z muzyką.
   Obsługiwany jest zarówno jeden BIN (`mycd.cue`), jak i wiele BIN (`monkey.cue`).
   Dla INDY3T/ZAK strona sama odczytuje angielskie LFL z ISO9660.
3. Strona automatycznie dołącza pasujący PRG z `prgs/` oraz domyślny INF.
   W sekcji zaawansowanej możesz je zastąpić plikami z własnego builda SCUMMST.
4. Kliknij „Sprawdź pliki”, następnie „Rozpocznij konwersję”. Pobierz ZIP i
   skopiuj zawartość `READY/` do katalogu gry na Atari STE.

Obsługiwane źródła:

| Gra | Źródło | Wynik |
| --- | --- | --- |
| INDY3T | FM-Towns English, `INDY3ENG` | `INDY3T.ST0/.ST1`, `98/99.LFL`, `I3F100.IDX`, `I3CD100.PCM`, `I3FX100.PCM` |
| LOOM | DOS VGA CD-ROM (CUE/BIN) | `LOOMCD.ST0/.ST1`, `901–904.LFL`, `LOOMCD.PCM` |
| MONKEY1 | Ultimate Talkie `MONKEY.000/.001`, `MONSTER.SOU` + CD audio | `MONKEY.ST0/.ST1`, `M1PCM.IDX`, `M1MUSIC.PCM`, `M1VOICE.PCM`, `M1SFX.PCM` |
| ZAK | FM-Towns English, `ZAKENG` | `ZAKT.ST0/.ST1`, `98/99.LFL`, `ZAKPCM.IDX`, `ZAKCD.PCM`, `ZAKSFX.PCM` |

ZIP zawiera także odpowiedni `PRG` i `INF`; dla MONKEY1 plik źródłowy
`prgs/MONKEY1.PRG` jest zapisywany jako `READY/M1PCM.PRG`, zgodnie z buildem Atari.

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
- Mowa i efekty VOC w Monkey1 używają 12-tap resamplera JS. CD110 (intro)
  otrzymuje osobną kopię z wzmocnieniem +9,1 dB w ścieżce JS i limiterem;
  CD130 zachowuje oryginalny fragment. Taki poziom odpowiada około −14,6 LUFS
  i −1,5 dBTP lokalnego profilu FFmpeg/EBU R128 (+5,9 dB po innym downmixie),
  ale nie jest bitowo identyczny. Plik `MONSTER.SOU` nie jest dołączany do ZIP.
- Loom używa profilu +12,1 dB i limitera dobranego dla dostarczonego wcześniej
  wydania CD. Inne wydanie może wymagać osobnej kalibracji głośności.
- Wbudowanych ścieżek Euphony nie konwertujemy; tak samo jak lokalny pipeline.
- Oryginalne pliki gry nie są częścią repozytorium ani GitHub Pages. PRG
  dołączone przez użytkownika są w `prgs/` i pobierane tylko przy pakowaniu ZIP.
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
SCUMMST_WORKSPACE=/ścieżka/do/GCC.ELF node tests/worker-smoke.mjs MONKEY1
```

## Publikacja na GitHub Pages

W GitHub → Settings → Pages ustaw „Deploy from a branch”, branch `main`,
folder `/ (root)`. `.nojekyll` pozwala serwować gotowe pliki bez Jekyll.
Nie jest potrzebny serwer Python, Wine ani FFmpeg po stronie użytkownika.

Kod ScummST pochodzi od Andersa Granlunda i projektu ScummVM; licencja
GPL-2.0-or-later, szczegóły w `LICENSE` i nagłówkach plików `engine-src/`.
