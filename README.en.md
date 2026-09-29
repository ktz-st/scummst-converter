# SCUMMST Converter

[Polska dokumentacja](README.md)

A browser-only asset converter for INDY3T, Loom VGA CD, and Zak FM-Towns on Atari STE. Conversion happens locally: your disc images are not uploaded. This static site can be hosted directly on GitHub Pages.

## Usage

Open this repository's GitHub Pages site, or serve it locally with any static HTTP server, for example `python3 -m http.server 8765`, then open `http://127.0.0.1:8765/`. Opening `index.html` via `file://` does not work because ES modules and WebAssembly require HTTP(S).

1. Select the game and your own original CUE and BIN files.
2. For Loom, also select the extracted `000.LFL`, `DISK01.LEC`, and `901.LFL`–`904.LFL` files. For INDY3T and ZAK, the page extracts English LFL files from the ISO9660 image.
3. Optionally select matching `PRG` and `INF` files from your local SCUMMST build. Without these, the ZIP contains assets, not a complete runnable game.
4. Click “Check files”, then “Start conversion”. Download the ZIP and copy the contents of `READY/` into the game's directory on Atari STE.

| Game | Source | Output |
| --- | --- | --- |
| INDY3T | FM-Towns English, `INDY3ENG` | `INDY3T.ST0/.ST1`, `98/99.LFL`, `I3F100.IDX`, `I3CD100.PCM`, `I3FX100.PCM` |
| LOOM | DOS VGA CD-ROM plus extracted LFL/LEC | `LOOMCD.ST0/.ST1`, `901–904.LFL`, `LOOMCD.PCM` |
| ZAK | FM-Towns English, `ZAKENG` | `ZAKT.ST0/.ST1`, `98/99.LFL`, `ZAKPCM.IDX`, `ZAKCD.PCM`, `ZAKSFX.PCM` |

A modern browser with WebAssembly, module Workers, and the File API is required. Chrome, Firefox, and Safari are the target browsers. Older mobile browsers may run out of memory. ZIP32 has a 4 GB limit.

## Compatibility and limitations

- The `.ST0/.ST1` files are produced by the original ScummST v8 resource converter compiled to WebAssembly. Its source snapshot is in `engine-src/`.
- Audio is resampled in JavaScript with a 24-tap filter to 8-bit mono at 12516 Hz. Output is not byte-identical to FFmpeg: individual cues/SFX may differ by 1–2 samples; the index bank is built to match the new lengths.
- Loom uses a +12.1 dB gain and limiter profile calibrated for the CD release previously supplied. Other releases may need separate loudness calibration.
- Embedded Euphony tracks are not converted, matching the local pipeline.
- Original game files and PRGs are not included in this repository or on GitHub Pages.
- This tool does not compile game code, create save files, or alter source assets.

## Building the WebAssembly engine

Prebuilt `web/scummst-engine.js` and `web/scummst-engine.wasm` are included. Rebuilding requires the Emscripten SDK:

```sh
source /path/to/emsdk/emsdk_env.sh
bash build-wasm.sh
```

JavaScript tests (Node 24+):

```sh
node --test tests/disc.test.js tests/zip.test.js tests/i18n.test.js
```

Optional integration checks require your own CD images and an existing `GCC.ELF` workspace:

```sh
SCUMMST_WORKSPACE=/path/to/GCC.ELF node --test tests/real-disc.test.js
SCUMMST_WORKSPACE=/path/to/GCC.ELF node tests/wasm-smoke.mjs INDY3T
SCUMMST_WORKSPACE=/path/to/GCC.ELF node tests/audio-smoke.mjs LOOM
```

## GitHub Pages

In GitHub → Settings → Pages, choose “Deploy from a branch”, branch `main`, folder `/ (root)`. `.nojekyll` serves the prebuilt files directly. Users do not need Python, Wine, or FFmpeg.

ScummST code derives from Anders Granlund and ScummVM; GPL-2.0-or-later. See `LICENSE` and the headers in `engine-src/`.
