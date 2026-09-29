#!/usr/bin/env bash
set -euo pipefail

# Source `emsdk_env.sh` first. This builds the GPL ScummST resource converter
# snapshot in engine-src for a browser worker. No game data is embedded.
cd "$(dirname "$0")"
: "${EMSDK:?Source emsdk_env.sh before running this script}"
mkdir -p build web

sources=(
  backends/converter/converter.cpp
  backends/midi/adlib.cpp backends/midi/null.cpp
  common/sound/audiostream.cpp common/sound/fmopl.cpp common/sound/mididrv.cpp
  common/sound/midiparser.cpp common/sound/midiparser_smf.cpp common/sound/mixer.cpp
  common/sound/mpu401.cpp common/sound/rate.cpp common/sound/voc.cpp
  common/engine.cpp common/gameDetector.cpp common/main.cpp common/config-manager.cpp
  common/file.cpp common/scaler.cpp common/str.cpp common/timer.cpp common/util.cpp
  common/savefile.cpp common/system.cpp
  scumm/actor.cpp scumm/base-costume.cpp scumm/boxes.cpp scumm/camera.cpp
  scumm/charset.cpp scumm/costume.cpp scumm/cursor.cpp scumm/dialogs.cpp
  scumm/gfx.cpp scumm/imuse.cpp scumm/imuse_player.cpp scumm/instrument.cpp
  scumm/object.cpp scumm/palette.cpp scumm/resource.cpp scumm/saveload.cpp
  scumm/script.cpp scumm/scummvm.cpp scumm/sound.cpp scumm/string.cpp
  scumm/vars.cpp scumm/verbs.cpp scumm/resource_converter.cpp
  scumm/script_v5.cpp scumm/resource_v3.cpp scumm/resource_v4.cpp
  scumm/script_v6.cpp scumm/bomp.cpp
  common/gui/about.cpp common/gui/chooser.cpp common/gui/dialog.cpp
  common/gui/ListWidget.cpp common/gui/options.cpp common/gui/PopUpWidget.cpp
  common/gui/message.cpp common/gui/newgui.cpp common/gui/widget.cpp
)

defs=(
  -DUNIX -D__WIN32__ -DDISABLE_DEBUGGER
  -DENGINE_SCUMMALL -DENGINE_SCUMM4 -DENGINE_SCUMM5 -DENGINE_SCUMM6
  -DGAME_RESOURCECONVERTER -DSINGLEGAME
)
flags=(-std=gnu++11 -O2 -w -Wno-c++11-narrowing
  -Iengine-src -Iengine-src/common -Iengine-src/common/sound)

objects=()
for source in "${sources[@]}"; do
  object="build/${source//\//_}.o"
  objects+=("$object")
  if [[ ! -f "$object" || "engine-src/$source" -nt "$object" || engine-src/common/scummsys.h -nt "$object" ]]; then
    em++ "${flags[@]}" "${defs[@]}" -c "engine-src/$source" -o "$object"
  fi
done

em++ -O2 "${objects[@]}" -o web/scummst-engine.js \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createScummST \
  -sEXPORTED_RUNTIME_METHODS=FS,callMain \
  -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sALLOW_MEMORY_GROWTH=1 \
  -sINITIAL_MEMORY=268435456 -sENVIRONMENT=web,worker,node

echo "Built web/scummst-engine.js and web/scummst-engine.wasm"
