/* ScummVM - Scumm Interpreter
 * Copyright (C) 2001  Ludvig Strigeus
 * Copyright (C) 2001-2004 The ScummVM project
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.

 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.

 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA  02111-1307, USA.
 *
 * $Header: /cvsroot/scummvm/scummvm/scumm/sound.cpp,v 1.320 2004/02/14 04:12:22 kirben Exp $
 *
 */

#include "stdafx.h"
#include "scumm/actor.h"
#include "scumm/imuse.h"
#include "scumm/scumm.h"
#include "scumm/sound.h"
#ifdef GAME_ZAKT
#include "scumm/zak_cd.h"
#endif

#include "common/config-manager.h"
#include "common/timer.h"
#include "common/util.h"

#include "sound/mididrv.h"
#include "sound/mixer.h"
#include "sound/voc.h"
#ifdef GAME_SPEECH_PCM
#include "scumm/speech_pcm.h"
#endif
#ifdef GAME_MONKEY_PCM
#include "scumm/monkey_pcm.h"
#include "scumm/saveload.h"
#if defined(__ATARI__) && defined(MONKEY_PCM_TRACE)
#include <mint/arch/nf_ops.h>
extern volatile uint32 indy3DmaFills, indy3DmaOverruns, indy3DmaMaxTicks, indy3DmaMissed;
#endif
#endif
#if defined(GAME_INDY3) || defined(GAME_ZAKT)
#include "scumm/indy3_towns.h"
#include "scumm/saveload.h"
#if defined(__ATARI__) && defined(INDY3_TOWNS_TRACE)
#include <mint/arch/nf_ops.h>
#ifdef INDY3_MIX3
extern volatile uint32 indy3DmaFills, indy3DmaOverruns, indy3DmaMaxTicks, indy3DmaMissed;
#endif
#endif
#endif
#ifdef GAME_LOOM
#include "scumm/loom_pcm.h"
#include "scumm/saveload.h"
#if defined(__ATARI__) && defined(LOOM_CD_TRACE)
#include <mint/arch/nf_ops.h>
#endif
#endif


namespace Scumm {

struct MP3OffsetTable {					/* Compressed Sound (.SO3) */
	int org_offset;
	int new_offset;
	int num_tags;
	int compressed_size;
};


Sound::Sound(ScummEngine *parent) {
	memset(this,0,sizeof(Sound));	// palmos
	
	_vm = parent;

	_sfxFile = 0;
#ifdef GAME_MONKEY_PCM
	_monkeyMutex = _vm->_system->create_mutex();
#endif
#if defined(GAME_INDY3) || defined(GAME_ZAKT)
	_townsMutex = _vm->_system->create_mutex();
#endif
#ifdef GAME_LOOM
	_cdMutex = _vm->_system->create_mutex();
#endif
}

Sound::~Sound() {
#ifdef GAME_SPEECH_PCM
	delete _speechPCM;
#endif
#ifdef GAME_MONKEY_PCM
	_vm->_mixer->stopHandle(_monkeyHandle);
	delete _monkey;
	_vm->_system->delete_mutex(_monkeyMutex);
#endif
#if defined(GAME_INDY3) || defined(GAME_ZAKT)
	_vm->_mixer->stopHandle(_townsHandle);
	delete _towns;
	_vm->_system->delete_mutex(_townsMutex);
#endif
#ifdef GAME_LOOM
	stopLoomCD();
	_vm->_system->delete_mutex(_cdMutex);
#endif
	stopCDTimer();
	delete _sfxFile;
}

static void cd_timer_handler(void *refCon) {
	ScummEngine *scumm = (ScummEngine *)refCon;
	if (!scumm->_sound->_soundsPaused)
		scumm->VAR(scumm->VAR_MUSIC_TIMER) += 6;
}

void Sound::startCDTimer() {
#ifdef GAME_MONKEY_PCM
	_monkeyTimerRunning = true;
#endif
#ifdef GAME_LOOM
	_cdTimerRunning = true;
#endif
	_vm->VAR(_vm->VAR_MUSIC_TIMER) = 0;
	_vm->_timer->removeTimerProc(&cd_timer_handler);
	_vm->_timer->installTimerProc(&cd_timer_handler, 100000, _vm);
}

void Sound::stopCDTimer() {
#ifdef GAME_MONKEY_PCM
	_monkeyTimerRunning = false;
#endif
#ifdef GAME_LOOM
	_cdTimerRunning = false;
#endif
	_vm->_timer->removeTimerProc(&cd_timer_handler);
}

void Sound::playLoomCD(uint16 offset, uint16 duration) {
#ifdef GAME_LOOM
#if defined(__ATARI__) && defined(LOOM_CD_TRACE)
	nf_debugprintf("LOOM CD command offset=%u duration=%u room=%u\n", offset, duration, _vm->_currentRoom);
#endif
	stopLoomCD();
	_vm->VAR(_vm->VAR_MUSIC_TIMER) = 0;
	if (!offset && !duration) return;
	int frame = LoomPCMStream::startFrame(offset);
	if (frame < 0) frame = 0;
	uint32 start = LoomPCMStream::frameToSample(frame);
	uint32 end = LoomPCMStream::frameToSample(frame + LoomPCMStream::durationFrames(duration));
	startLoomPCM(start, end - start);
	// Keep the original script clock running even with missing audio/Off,
	// and after the fragment ends; scripts may wait past its end.
	startCDTimer();
#endif
}

void Sound::updateCD() {
#ifdef GAME_MONKEY_PCM
	if (_monkey && !_soundsPaused) _monkey->service();
#endif
#if defined(GAME_INDY3) || defined(GAME_ZAKT)
	if (_towns && !_soundsPaused) _towns->service();
	updateTownsVolume();
#endif
#ifdef GAME_LOOM
	if (_cdStream && !_soundsPaused) _cdStream->service();
#endif
}

#ifdef GAME_MONKEY_PCM
void Sound::attachMonkey() {
	if (_monkey && !_monkeyHandle.isActive())
		_vm->_mixer->playInputStream(&_monkeyHandle, _monkey, false, 256, 0, -1, false);
}

void Sound::saveLoadMonkey(Serializer *s) {
	if (s->getVersion() < 36) return;
	uint32 state[MonkeyPCMStream::kStateWords] = {0};
	if (s->isSaving() && _monkey) {
		// Only the short snapshot is locked, never a disk read/refill.
		Common::StackLock lock(_monkeyMutex);
		_monkey->snapshot(state);
	}
	s->saveLoadArrayOf(state, MonkeyPCMStream::kStateWords, 4, sleUint32);
	if (s->isSaving()) {
		s->saveByte(_monkeyTimerRunning);
		s->saveUint16(_monkeyCD);
		s->saveByte(_sfxMode);
		s->saveByte(_mouthSyncMode);
		s->saveUint16(_talk_sound_frame);
	} else {
		bool running = s->loadByte() != 0;
		_monkeyCD = s->loadUint16();
		_sfxMode = s->loadByte() & 3;
		_mouthSyncMode = s->loadByte() != 0;
		_talk_sound_frame = (int16)s->loadUint16();
		_endOfMouthSync = false;
		_vm->_mixer->stopHandle(_monkeyHandle);
		if (_monkey) {
			_monkey->restore(state);
			if (_monkey->active(1))
				_monkey->sync((_monkey->key(1)&0x7fffffff)-1, _mouthSyncTimes, 64);
			else _sfxMode &= ~2;
			attachMonkey();
		}
		int timer = _vm->VAR(_vm->VAR_MUSIC_TIMER);
		stopCDTimer();
		if (running) startCDTimer();
		_vm->VAR(_vm->VAR_MUSIC_TIMER) = timer;
	}
}
#endif

#if defined(GAME_INDY3) || defined(GAME_ZAKT)
void Sound::initTowns() {
	if (_townsChecked) return;
	_townsChecked = true;
	// Fixed-rate mixing is for STE DMA. Retain YM/MIDI when samples are Off,
	// the bank is absent, or the backend uses a different sample rate.
	if (GetConfig(kConfig_SoundDriver) == SD_NULL || !_vm->_mixer->isReady() ||
		_vm->_mixer->getOutputRate() != Indy3TownsStream::kRate) return;
	_towns = new Indy3TownsStream(_vm->getGameDataPath());
	if (!_towns->ready()) { delete _towns; _towns = 0; }
}

void Sound::attachTowns() {
	updateTownsVolume();
	if (_towns && !_townsHandle.isActive())
		_vm->_mixer->playInputStream(&_townsHandle, _towns, false, 256, 0, -1, false);
}

void Sound::updateTownsVolume() {
#ifndef INDY3_PCM_OFFLINE
	if (!_towns) return;
	int master = GetConfig(kConfig_MasterVolume);
	int music = GetConfig(kConfig_MusicDriver) == MD_NULL ? 0 : GetConfig(kConfig_MusicVolume);
#ifdef INDY3_MIX3
	_towns->prepareVolumes(GetConfig(kConfig_SfxVolume) * master / 255);
#endif
	Common::StackLock lock(_townsMutex);
	_towns->setVolumes(music * master / 255, GetConfig(kConfig_SfxVolume) * master / 255);
#endif // Fixed bank has no runtime volume or mute processing.
}

bool Sound::muteTownsMusic(int id) const {
	return _towns && _towns->muteMusic(id);
}

bool Sound::playTowns(int id) {
	initTowns();
	if (!_towns) return false;
	int kind = _towns->kind(id);
	if (!kind) return false;
#if defined(GAME_INDY3T) && defined(INDY3_CD_ONLY)
	if (kind == 1) return true; // Ignore SFX without detaching the CD stream.
#endif
#if defined(GAME_INDY3T) || defined(GAME_ZAKT)
	// Euphony is a separate device on Towns: an unsupported Euphony cue
	// must not stop a concurrently playing CD track as a DOS fallback would.
	if (kind == 3) return false;
#endif
#ifdef INDY3_MIX3
	if (kind == 1) {
		{ Common::StackLock lock(_townsMutex); _towns->startEffect(id); }
		attachTowns(); // Never detach/restart the CD stream just to start an effect.
#if defined(__ATARI__) && defined(INDY3_TOWNS_TRACE)
		nf_debugprintf("I3 PCM mix3 SFX=%d music=%d underruns=%lu\n", id,
			_towns->musicId(), (unsigned long)_towns->underruns());
#endif
		return true;
	}
#endif
	// Detach first: no callback may race a seek, voice replacement or deletion.
	_vm->_mixer->stopHandle(_townsHandle);
	if (kind == 1) {
		if (_vm->_musicEngine) _vm->_musicEngine->stopSound(id);
		_towns->startEffect(id);
	} else {
		int old = _towns->musicId();
		if (old && _vm->_musicEngine) _vm->_musicEngine->stopSound(old);
		if (old) _towns->stop(old);
		if (kind == 2 && !_towns->startMusic(id))
			warning("Indy3: PCM music %d failed; using YM/MIDI", id);
	}
	attachTowns();
#if defined(__ATARI__) && defined(INDY3_TOWNS_TRACE)
	nf_debugprintf("I3 PCM id=%d kind=%d music=%d underruns=%lu\n", id, kind,
		_towns->musicId(), (unsigned long)_towns->underruns());
#endif
	// CD cues also run the original DOS sequencer, with note-ons suppressed.
	// Its beat clock and script-visible status remain unchanged (not CD 60 Hz).
	return kind == 1;
}

void Sound::stopTowns(int id) {
	if (!_towns) return;
#if defined(INDY3_MIX3) && defined(__ATARI__) && defined(INDY3_TOWNS_TRACE)
	nf_debugprintf("I3 PCM DMA fills=%lu overruns=%lu maxTicks=%lu missed=%lu\n",
		(unsigned long)indy3DmaFills, (unsigned long)indy3DmaOverruns,
		(unsigned long)indy3DmaMaxTicks, (unsigned long)indy3DmaMissed);
#endif
#if defined(__ATARI__) && defined(INDY3_TOWNS_TRACE)
	nf_debugprintf("I3 PCM stop=%d underruns=%lu failed=%d\n", id,
		(unsigned long)_towns->underruns(), _towns->failed());
#endif
	Common::StackLock lock(_townsMutex);
	_towns->stop(id);
}

void Sound::saveLoadTowns(Serializer *s) {
	if (s->getVersion() < 36) return; // v35 restores the original DOS audio
	uint32 state[Indy3TownsStream::kStateWords];
	memset(state, 0, sizeof(state));
	if (s->isSaving()) {
		{ Common::StackLock lock(_townsMutex); if (_towns) _towns->snapshot(state); }
		for (unsigned i = 0; i < ARRAYSIZE(state); ++i) s->saveUint32(state[i]);
	} else {
		for (unsigned i = 0; i < ARRAYSIZE(state); ++i) state[i] = s->loadUint32();
#if defined(GAME_INDY3T) || defined(GAME_ZAKT)
		stopCDTimer();
		if (state[0]) {
			int timer = _vm->VAR(_vm->VAR_MUSIC_TIMER);
			startCDTimer();
			_vm->VAR(_vm->VAR_MUSIC_TIMER) = timer;
		}
#endif
		initTowns();
		if (_towns) {
			_vm->_mixer->stopHandle(_townsHandle);
			_towns->restore(state);
			attachTowns();
		}
	}
}
#endif

#ifdef GAME_LOOM
void Sound::stopLoomCD() {
	stopCDTimer();
	_vm->_mixer->stopHandle(_cdHandle);
#if defined(__ATARI__) && defined(LOOM_CD_TRACE)
	if (_cdStream) nf_debugprintf("LOOM CD stop played=%lu underruns=%lu\n",
		(unsigned long)_cdStream->played(), (unsigned long)_cdStream->underruns());
#endif
	delete _cdStream;
	_cdStream = 0;
}

void Sound::startLoomPCM(uint32 start, uint32 length) {
#if defined(__ATARI__) && defined(LOOM_CD_TRACE)
	nf_debugprintf("LOOM PCM start=%lu bytes=%lu rate=%u\n", (unsigned long)start,
		(unsigned long)length, _vm->_mixer->getOutputRate());
#endif
	if (GetConfig(kConfig_SoundDriver) == SD_NULL || !_vm->_mixer->isReady() || !length) return;
	_cdStream = new LoomPCMStream(_vm->getGameDataPath(), start, length);
	if (_cdStream->failed()) {
		warning("Loom CD: cannot read LOOMCD.PCM at %lu", (unsigned long)start);
		delete _cdStream; _cdStream = 0;
		return;
	}
	// Like Indy4 speech: the Atari backend services non-music sample channels.
	// Sound owns the stream, including its main-thread File and refill buffer.
	_vm->_mixer->playInputStream(&_cdHandle, _cdStream, false, 256, 0, -1, false);
}

void Sound::saveLoadCD(Serializer *s) {
	if (s->getVersion() < 36) {
		// V35 stored the script timer but no CD position. Keep old saves
		// progressing silently until the next voice command starts a fragment.
		if (s->isLoading() && _vm->VAR(_vm->VAR_MUSIC_TIMER) > 0) {
			int timer = _vm->VAR(_vm->VAR_MUSIC_TIMER);
			startCDTimer();
			_vm->VAR(_vm->VAR_MUSIC_TIMER) = timer;
		}
		return;
	}
	if (s->isSaving()) {
		uint32 position, remaining;
		bool running;
		{
			Common::StackLock lock(_cdMutex);
			position = _cdStream ? _cdStream->position() : 0;
			remaining = _cdStream ? _cdStream->remaining() : 0;
			running = _cdTimerRunning;
		}
		s->saveUint32(position);
		s->saveUint32(remaining);
		s->saveByte(running);
	} else {
		uint32 start = s->loadUint32(), length = s->loadUint32();
		bool running = s->loadByte() != 0;
		int timer = _vm->VAR(_vm->VAR_MUSIC_TIMER);
		stopLoomCD();
		startLoomPCM(start, length);
		if (running) startCDTimer();
		_vm->VAR(_vm->VAR_MUSIC_TIMER) = timer;
	}
}
#endif

void Sound::addSoundToQueue(int sound) {
	_vm->VAR(_vm->VAR_LAST_SOUND) = sound;
#ifdef GAME_MONKEY_PCM
	if (!_monkey || !_monkey->kind(sound))
#endif
	_vm->ensureResourceLoaded(rtSound, sound);
	addSoundToQueue2(sound);
}

void Sound::addSoundToQueue2(int sound) {
	assert(_soundQue2Pos < ARRAYSIZE(_soundQue2));
	_soundQue2[_soundQue2Pos++] = sound;
}

void Sound::processSoundQues() {
	updateCD();
	int i = 0, d, num;
	int data[16];

	processSfxQueues();

	while (_soundQue2Pos) {
		d = _soundQue2[--_soundQue2Pos];
		if (d)
			playSound(d);
	}

	while (i < _soundQuePos) {
		num = _soundQue[i++];
		if (i + num > _soundQuePos) {
			warning("processSoundQues: invalid num value");
			break;
		}
		memset(data, 0, sizeof(data));
		if (num > 0) {
			for (int j = 0; j < num; j++)
				data[j] = _soundQue[i + j];
			i += num;

			debugC(DEBUG_IMUSE, "processSoundQues(%d,%d,%d,%d,%d,%d,%d,%d,%d)",
						data[0] >> 8, data[0] & 0xFF,
						data[1], data[2], data[3], data[4], data[5], data[6], data[7]);

			if (_vm->_imuse) {
				_vm->VAR(_vm->VAR_SOUNDRESULT) = (short)_vm->_imuse->doCommand (num, data);
			}
		}
	}
	_soundQuePos = 0;
}

void Sound::playSound(int soundID) {
#ifdef GAME_MONKEY_PCM
	if (_monkey && _monkey->kind(soundID)) {
		int kind = _monkey->kind(soundID);
		if (kind >= 2) {
			if (_monkeyCD == soundID && _monkey->active(0)) return;
			_monkeyCD = soundID;
			startCDTimer();
		}
		_monkey->playSound(soundID);
		attachMonkey();
#if defined(__ATARI__) && defined(MONKEY_PCM_TRACE)
		nf_debugprintf("M1 sound=%d kind=%d room=%u underruns=%lu\n", soundID, kind,
			_vm->_currentRoom, (unsigned long)_monkey->underruns());
#endif
		return;
	}
#endif
	byte *ptr;
//	char *sound;
//	int size;
//	int rate;
//	byte flags = SoundMixer::FLAG_UNSIGNED | SoundMixer::FLAG_AUTOFREE;
	
	debug(1, "playSound #%d (room %d)", soundID, 
		_vm->getResourceRoomNr(rtSound, soundID));

	ptr = _vm->getResourceAddress(rtSound, soundID);
	if (!ptr) {
		return;
	}

#if defined(GAME_INDY3T) || defined(GAME_ZAKT)
	// Full Towns scripts address Towns SO resources, never the DOS iMUSE
	// tracks. Keep its 60-Hz CD clock even if the user disables samples.
	if (ptr[13] == 2) {
		if (_towns && _towns->musicId() == soundID && _towns->musicActive()) return;
		startCDTimer();
	}
	playTowns(soundID);
	return;
#endif

#if defined(GAME_INDY3) || defined(GAME_ZAKT)
	if (playTowns(soundID)) return;
#endif

	if (_vm->_musicEngine) {
		_vm->_musicEngine->startSound(soundID);
	}
}

void Sound::processSfxQueues() {

	if (_talk_sound_mode != 0) {
		if (_talk_sound_mode & 1)
			startTalkSound(_talk_sound_a1, _talk_sound_b1, 1);
		if (_talk_sound_mode & 2)
			startTalkSound(_talk_sound_a2, _talk_sound_b2, 2, &_talkChannelHandle);
		_talk_sound_mode = 0;
	}

	const int act = _vm->talkingActor();
	if ((_sfxMode & 2) && act != 0) {
		Actor *a;
		bool b, finished;

		finished = !_talkChannelHandle.isActive();
#ifdef GAME_MONKEY_PCM
		if (_monkey) {
			finished = !_monkey->active(1);
			uint32 samples = _monkey->position(1);
			_curSoundPos = samples / MonkeyPCMStream::kRate * 60 +
				(samples % MonkeyPCMStream::kRate) * 60 / MonkeyPCMStream::kRate;
		}
#endif

		if ((uint) act < 0x80 && !_vm->_string[0].no_talk_anim && (finished || !_endOfMouthSync)) {
			a = _vm->derefActor(act, "processSfxQueues");
			if (a->isInCurrentRoom()) {
				b = finished || isMouthSyncOff(_curSoundPos);
				if (_mouthSyncMode != b) {
					_mouthSyncMode = b;
					if (_talk_sound_frame != -1) {
						a->startAnimActor(_talk_sound_frame);
						_talk_sound_frame = -1;
					} else
						a->startAnimActor(b ? a->talkStopFrame : a->talkStartFrame);
				}
			}
		}

		if (finished && _vm->_talkDelay == 0) {
			_vm->stopTalk();
		}
	}

	if (_sfxMode & 1) {
		if (isSfxFinished()) {
			_sfxMode &= ~1;
		}
	}
}
/*
static int compareMP3OffsetTable(const void *a, const void *b) {
	return ((const MP3OffsetTable *)a)->org_offset - ((const MP3OffsetTable *)b)->org_offset;
}
*/
void Sound::startTalkSound(uint32 offset, uint32 b, int mode, PlayingSoundHandle *handle) {
#ifdef GAME_MONKEY_PCM
	if (_monkey) {
		int lane = mode == 2 ? 1 : 2;
		if (mode == 2) {
			_mouthSyncTimes[0] = 0xffff;
			_monkey->sync(offset, _mouthSyncTimes, 64);
			_curSoundPos = 0;
			_mouthSyncMode = true;
			_endOfMouthSync = false;
		}
		_sfxMode |= mode;
		_monkey->playVoice(offset, lane);
		attachMonkey();
#if defined(__ATARI__) && defined(MONKEY_PCM_TRACE)
		nf_debugprintf("M1 voice=%lu mode=%d active=%d underruns=%lu\n", (unsigned long)offset,
			mode, _monkey->active(lane), (unsigned long)_monkey->underruns());
#endif
		return;
	}
#endif
	int num = 0, i;
	int size = 0;
	int id = -1;

#ifdef GAME_SPEECH_PCM
	int pcmMarkers = b > 8 ? (b - 8) >> 1 : 0;
	AudioStream *pcmInput = 0;
	if (!_speechPCM->load(offset, pcmMarkers, _mouthSyncTimes, ARRAYSIZE(_mouthSyncTimes),
		!_soundsPaused && _vm->_mixer->isReady(), pcmInput))
		error("Speech PCM: missing or invalid dialogue %lu", (unsigned long)offset);
	_sfxMode |= mode;
	_curSoundPos = 0;
	_mouthSyncMode = true;
	if (pcmInput) _vm->_mixer->playInputStream(handle, pcmInput, false, 256, 0, id);
	return;
#endif

	if (!_sfxFile->isOpen()) {
		warning("startTalkSound: SFX file is not open");
		return;
	}

	if (mode == 1 && (_vm->_gameId == GID_TENTACLE
		|| (_vm->_gameId == GID_SAMNMAX && !_vm->isScriptRunning(99)))) {
		id = 777777;
		_vm->_mixer->stopID(id);
	}

	if (b > 8) {
		num = (b - 8) >> 1;
	}

	offset += 8;
	size = -1;

	_sfxFile->seek(offset, SEEK_SET);

	assert(num + 1 < (int)ARRAYSIZE(_mouthSyncTimes));
	for (i = 0; i < num; i++)
		_mouthSyncTimes[i] = _sfxFile->readUint16BE();

	_mouthSyncTimes[i] = 0xFFFF;
	_sfxMode |= mode;
	_curSoundPos = 0;
	_mouthSyncMode = true;

	if (!_soundsPaused && _vm->_mixer->isReady())
		startSfxSound(_sfxFile, size, handle, id);
}

void Sound::stopTalkSound() {
	if (_sfxMode & 2) {
#ifdef GAME_MONKEY_PCM
		if (_monkey) _monkey->stopLane(1);
#endif
		_vm->_mixer->stopHandle(_talkChannelHandle);
		_sfxMode &= ~2;
	}
}

bool Sound::isMouthSyncOff(uint pos) {
	uint j;
	bool val = true;
	uint16 *ms = _mouthSyncTimes;

	_endOfMouthSync = false;
	do {
		val = !val;
		j = *ms++;
		if (j == 0xFFFF) {
			_endOfMouthSync = true;
			break;
		}
	} while (pos > j);
	return val;
}


int Sound::isSoundRunning(int sound) const {
	if (isSoundInQueue(sound))
		return 1;
#ifdef GAME_MONKEY_PCM
	if (_monkey && _monkey->kind(sound)) {
		int lane = _monkey->kind(sound) == 1 ? 2 : 0;
		return _monkey->key(lane) == (uint32)sound && _monkey->active(lane);
	}
#endif

#if defined(GAME_INDY3T) || defined(GAME_ZAKT)
	if (!_towns) return 0;
	Common::StackLock lock(_townsMutex);
	return _towns->kind(sound) == 2 ?
		(_towns->musicId() == sound && _towns->musicActive()) : _towns->effectActive(sound);
#endif

#if defined(GAME_INDY3) || defined(GAME_ZAKT)
	if (_towns && _towns->kind(sound) == 1) {
		Common::StackLock lock(_townsMutex);
		return _towns->effectActive(sound);
	}
#endif

	if (!_vm->isResourceLoaded(rtSound, sound))
		return 0;

	if (_vm->_musicEngine)
		return _vm->_musicEngine->getSoundStatus(sound);

	return 0;
}

/**
 * Check whether the sound resource with the specified ID is still
 * used. This is invoked by ScummEngine::isResourceInUse, to determine
 * which resources can be expired from memory.
 * Technically, this works very similar to isSoundRunning, however it
 * calls IMuse::get_sound_active() instead of IMuse::getSoundStatus().
 * The difference between those two is in how they treat sounds which
 * are being faded out: get_sound_active() returns true even when the
 * sound is being faded out, while getSoundStatus() returns false in
 * that case.
 */
bool Sound::isSoundInUse(int sound) const {
#ifdef GAME_MONKEY_PCM
	if (_monkey && _monkey->kind(sound)) return isSoundRunning(sound) != 0;
#endif

#if defined(GAME_INDY3T) || defined(GAME_ZAKT)
	return isSoundRunning(sound) != 0;
#endif

	if (isSoundInQueue(sound))
		return true;

#if defined(GAME_INDY3) || defined(GAME_ZAKT)
	if (_towns && _towns->kind(sound) == 1) {
		Common::StackLock lock(_townsMutex);
		return _towns->effectActive(sound);
	}
#endif

	if (!_vm->isResourceLoaded(rtSound, sound))
		return false;

	if (_vm->_imuse)
		return _vm->_imuse->get_sound_active(sound);

	return false;
}

int Sound::townsCDQuery(int command) const {
#ifdef GAME_ZAKT
	// Disc metadata is also available with audio disabled or no PCM bank loaded.
	if (command >= 1 && command <= 23)
		return zakCDTrackLength(command);
#endif
#if defined(GAME_INDY3T) || defined(GAME_ZAKT)
	Common::StackLock lock(_townsMutex);
	switch (command) {
	case 0: return !_towns || !_towns->musicActive();
	case 0xFE: return _towns ? _towns->musicId() : 0;
	case 0xFF: return 255; // Initial CD volume; script volume overrides pending.
	}
#endif
	return 0; // Unsupported queries (including track lengths on other targets).
}

bool Sound::isSoundInQueue(int sound) const {
	int i, num;

	i = _soundQue2Pos;
	while (i--) {
		if (_soundQue2[i] == sound)
			return true;
	}

	i = 0;
	while (i < _soundQuePos) {
		num = _soundQue[i++];

		if (num > 0) {
			if (_soundQue[i + 0] == 0x10F && _soundQue[i + 1] == 8 && _soundQue[i + 2] == sound)
				return true;
			i += num;
		}
	}
	return false;
}

void Sound::stopSound(int a) {
	int i;
#ifdef GAME_MONKEY_PCM
	if (_monkey) _monkey->stopSound(a);
	if (a == _monkeyCD) { stopCDTimer(); _monkeyCD = 0; }
#endif

#if defined(GAME_INDY3T) || defined(GAME_ZAKT)
	if (a && a == townsCDQuery(0xFE)) stopCDTimer();
#endif

#if defined(GAME_INDY3) || defined(GAME_ZAKT)
	stopTowns(a);
#endif

	if (_vm->_musicEngine)
		_vm->_musicEngine->stopSound(a);

	for (i = 0; i < ARRAYSIZE(_soundQue2); i++)
		if (_soundQue2[i] == a)
			_soundQue2[i] = 0;
}

void Sound::stopAllSounds() {
#ifdef GAME_MONKEY_PCM
	if (_monkey) _monkey->stopSound(0);
	_monkeyCD = 0;
#endif
#if defined(GAME_INDY3) || defined(GAME_ZAKT)
	stopTowns();
#endif
#ifdef GAME_LOOM
	stopLoomCD();
#endif
	stopCDTimer();

	// Clear the (secondary) sound queue
	_soundQue2Pos = 0;
	memset(_soundQue2, 0, sizeof(_soundQue2));

	if (_vm->_musicEngine) {
		_vm->_musicEngine->stopAllSounds();
	}
	if (_vm->_imuse) {
		// FIXME: Maybe we could merge this call to clear_queue()
		// into IMuse::stopAllSounds() ?
		_vm->_imuse->clear_queue();
	}

	// Stop all SFX
	_vm->_mixer->stopAll();
}

void Sound::soundKludge(int *list, int num) {
	int i;

	if (list[0] == -1) {
		processSoundQues();
	} else {
		_soundQue[_soundQuePos++] = num;
		
		for (i = 0; i < num; i++) {
			_soundQue[_soundQuePos++] = list[i];
		}
	}
}

void Sound::talkSound(uint32 a, uint32 b, int mode, int frame) {
	if (mode == 1) {
		_talk_sound_a1 = a;
		_talk_sound_b1 = b;
	} else {
		_talk_sound_a2 = a;
		_talk_sound_b2 = b;
	}

	_talk_sound_frame = frame;
	_talk_sound_mode |= mode;
}

/* The sound code currently only supports General Midi.
 * General Midi is used in Day Of The Tentacle.
 * Roland music is also playable, but doesn't sound well.
 * A mapping between roland instruments and GM instruments
 * is needed.
 */

void Sound::setupSound() {
#ifdef GAME_SPEECH_PCM
	delete _speechPCM;
	_speechPCM=new SpeechPCM(_vm->getGameDataPath(),_vm->getGameName());
	if(!_speechPCM->ready())error("Speech PCM: missing or invalid IDX / PCM bank");
#endif
#ifdef GAME_MONKEY_PCM
	_vm->_mixer->stopHandle(_monkeyHandle);
	delete _monkey;
	_monkey = new MonkeyPCMStream(_vm->getGameDataPath());
	if (!_monkey->ready()) error("Monkey PCM: missing or invalid M1PCM.IDX / PCM bank");
	if (!_vm->_mixer->isReady() || _vm->_mixer->getOutputRate() != MonkeyPCMStream::kRate)
		error("Monkey PCM requires STE DMA at 12516 Hz");
#endif
	delete _sfxFile;
	// All talkie offsets are mapped by M1PCM.IDX; don't search for a second
	// copy of MONSTER.SOU (or probe irrelevant subdirectories on GEMDOS).
#ifdef GAME_MONKEY_PCM
	_sfxFile = new File();
#else
	_sfxFile = openSfxFile();
#endif
}

void Sound::pauseSounds(bool pause) {
#if defined(GAME_MONKEY_PCM) && defined(__ATARI__) && defined(MONKEY_PCM_TRACE)
	if (pause && _monkey)
		nf_debugprintf("M1 DMA fills=%lu overruns=%lu maxTicks=%lu missed=%lu underruns=%lu\n",
			(unsigned long)indy3DmaFills, (unsigned long)indy3DmaOverruns,
			(unsigned long)indy3DmaMaxTicks, (unsigned long)indy3DmaMissed,
			(unsigned long)_monkey->underruns());
#endif
	if (_vm->_imuse)
		_vm->_imuse->pause(pause);

	// Don't pause sounds if the game isn't active
	// FIXME - this is quite a nasty hack, replace with something cleaner, and w/o
	// having to access member vars directly!
	if (!_vm->_roomResource)
		return;

	_soundsPaused = pause;

	_vm->_mixer->pauseAll(pause);
/*
	if ((_vm->_features & GF_AUDIOTRACKS) && _vm->VAR(_vm->VAR_MUSIC_TIMER) > 0) {
		if (pause)
			stopCDTimer();
		else
			startCDTimer();
	}
*/		
}

void Sound::startSfxSound(File *file, int file_size, PlayingSoundHandle *handle, int id) {
#ifndef DISABLE_VOC
	AudioStream *input = 0;
	input = makeVOCStream(_sfxFile);
	if (!input) {
		warning("startSfxSound failed to load sound");
		return;
	}

	_vm->_mixer->playInputStream(handle, input, false, 256, 0, id);
#endif
}

File *Sound::openSfxFile() {
	File *file = new File();
#ifndef DISABLE_VOC
	char buf[256];
	sprintf(buf, "%s.sou", _vm->getGameName());
	if (!file->open(buf, _vm->getGameDataPath())) {
		file->open("monster.sou", _vm->getGameDataPath());
	}

	if (!file->isOpen()) {
		sprintf(buf, "%s.tlk", _vm->getGameName());
		file->open(buf, _vm->getGameDataPath(), File::kFileReadMode, 0x69);
	}
#endif
	return file;
}

bool Sound::isSfxFinished() const {
#ifdef GAME_MONKEY_PCM
	if (_monkey) return !_monkey->active(2);
#endif
	return !_vm->_mixer->hasActiveSFXChannel();
}



} // End of namespace Scumm
