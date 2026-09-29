// Optional FM-Towns PCM bank for DOS Indy3. GPL-2.0-or-later.
// One mixer input: CD + eight resident PCM voices (two with INDY3_MIX3). File I/O is
// confined to construction/startMusic/service, never the DMA callback.
#ifndef SCUMM_INDY3_TOWNS_H
#define SCUMM_INDY3_TOWNS_H
#include "sound/audiostream.h"
#include "common/file.h"
#if defined(INDY3_PCM_OFFLINE) && (!defined(INDY3_MIX3) || !defined(INDY3_MIX3_HALF))
#error Offline PCM requires the three-voice half-gain mixer
#endif
#if defined(INDY3_PCM_FULL) && !defined(INDY3_PCM_OFFLINE)
#error Full amplitude requires offline PCM
#endif

#if defined(INDY3_MIX3) && defined(__ATARI__)
extern "C" void indy3_mix3(byte *, const byte *, const byte *, const byte *, unsigned long);
extern "C" void indy3_mix3_half(byte *, const byte *, const byte *, const byte *, unsigned long, const byte *);
extern "C" void indy3_mix3_offline(byte *, const byte *, const byte *, const byte *, unsigned long);
#endif

class Indy3TownsStream : public AudioStream {
public:
	enum { kRate = 12516, kCapacity = 32768, kMask = kCapacity - 1, kVoices = 8,
	       kStateWords = 3 + kVoices * 4 };
#ifdef INDY3_MIX3
	enum { kRenderVoices = 2, kMixChunk = 1024 };
#ifdef INDY3_MIX3_HALF
#ifdef INDY3_PCM_FULL
	enum { kSfxDivisor = 1, kSfxBias = 128, kOfflineEncoding = 2 };
#else
	enum { kSfxDivisor = 2, kSfxBias = 64 };
	enum { kOfflineEncoding = 1 };
#endif
#ifdef INDY3_PCM_OFFLINE
	enum { kClipSize = 768 }; // Bounds-safe even if a PCM payload is corrupt.
#else
	enum { kClipSize = 384 };
#endif
#else
	enum { kSfxDivisor = 4, kSfxBias = 32 };
#endif
#else
	enum { kRenderVoices = kVoices };
#endif
	struct Entry { uint32 kind, offset, length, loop, loopLength, plays, priority, second; };
	struct Voice { uint32 id, entry, pos, end; };
	Indy3TownsStream(const char *directory) : _samples(0), _ready(false), _musicReady(false),
		_musicId(0), _musicPos(0), _plays(0), _sourcePos(0), _sourcePlays(0),
		_read(0), _write(0), _finished(true), _failed(false), _underruns(0) {
		memset(_entries, 0, sizeof(_entries));
		memset(_voices, 0, sizeof(_voices));
#ifdef INDY3_MIX3
#ifndef INDY3_PCM_OFFLINE
		_mixSamples = _pendingSamples = _retiredSamples = 0;
		_sampleBytes = 0; _scaledVolume = _pendingVolume = -1;
#endif
#ifdef INDY3_MIX3_HALF
		for (int i = 0; i < kClipSize; ++i) {
			int sample = i - 3 * kSfxBias;
			_mixClip[i] = (byte)(sample < -128 ? -128 : sample > 127 ? 127 : sample);
		}
#endif
#endif
#ifndef INDY3_PCM_OFFLINE
		_musicVolume = _sfxVolume = -1;
		setVolumes(256, 256);
#endif
		File index, samples;
#ifdef INDY3_PCM_OFFLINE
		byte head[32];
#ifdef INDY3_PCM_FULL
#ifdef GAME_ZAKT
		const char *indexName = "ZAKPCM.IDX", *sfxName = "ZAKSFX.PCM", *musicName = "ZAKCD.PCM";
#else
		const char *indexName = "I3F100.IDX", *sfxName = "I3FX100.PCM", *musicName = "I3CD100.PCM";
#endif
#else
		const char *indexName = "I3FIX.IDX", *sfxName = "I3FX50.PCM", *musicName = "I3CD50.PCM";
#endif
		const char *signature =
#ifdef GAME_ZAKT
			"ZKOF";
#else
			"I3OF";
#endif
		if (!index.open(indexName, directory) || index.read(head, 32) != 32 ||
			memcmp(head, signature, 4) || le32(head + 4) != 1 || le32(head + 8) != kRate ||
			le32(head + 12) != 256 || le32(head + 16) > 256 || le32(head + 20) > 256 ||
			le32(head + 24) != kOfflineEncoding || le32(head + 28) != 0 || index.size() != 32 + 256 * 32) return;
		if (!samples.open(sfxName, directory)) return;
#else
		byte head[16];
		if (!index.open("I3TOWNS.IDX", directory) || index.read(head, 16) != 16 ||
			memcmp(head, "I3PC", 4) || le32(head + 4) != 1 || le32(head + 8) != kRate ||
			le32(head + 12) != 256 || index.size() != 16 + 256 * 32) return;
		if (!samples.open("I3SFX.PCM", directory)) return;
#endif
		uint32 size = samples.size();
		if (!size || size > 2 * 1024 * 1024) return;
#ifdef INDY3_PCM_OFFLINE
		_musicReady = _music.open(musicName, directory);
#else
		_musicReady = _music.open("I3MUSIC.PCM", directory);
#endif
		uint32 musicSize = _musicReady ? _music.size() : 0;
		for (int i = 0; i < 256; ++i) {
			byte raw[32];
			if (index.read(raw, 32) != 32) return;
			Entry &e = _entries[i];
			e.kind = le32(raw); e.offset = le32(raw + 4); e.length = le32(raw + 8);
			e.loop = le32(raw + 12); e.loopLength = le32(raw + 16);
			e.plays = le32(raw + 20); e.priority = le32(raw + 24); e.second = le32(raw + 28);
			if (e.kind > 3 || e.second >= 256) return;
			if (e.kind == 1 || (e.kind == 2 && _musicReady)) {
				uint32 limit = e.kind == 1 ? size : musicSize;
				if (!e.length || e.offset > limit || e.length > limit - e.offset ||
					e.loop > e.length || e.loopLength > e.length - e.loop) return;
			}
			if (e.kind == 2 && !_musicReady) e.kind = 3;
		}
		for (int i = 0; i < 256; ++i) {
			uint32 second = _entries[i].second;
			if (second && (second < 128 || _entries[second].kind != 1 || _entries[second].second)) return;
		}
		_samples = new byte[size];
		if (!_samples || samples.read(_samples, size) != size) return;
#if defined(INDY3_MIX3) && !defined(INDY3_PCM_OFFLINE)
		_sampleBytes = size;
		prepareVolumes(256);
		setVolumes(256, 256);
		if (!_mixSamples) return;
#endif
		_ready = true;
	}
	~Indy3TownsStream() {
		delete[] _samples;
#if defined(INDY3_MIX3) && !defined(INDY3_PCM_OFFLINE)
		delete[] _mixSamples; delete[] _pendingSamples; delete[] _retiredSamples;
#endif
	}
	bool ready() const { return _ready; }
	int kind(int id) const {
#ifdef GAME_ZAKT
		return _ready && id > 0 && id < 192 ? _entries[id].kind : 0;
#else
		return _ready && id > 0 && id < 128 ? _entries[id].kind : 0;
#endif
	}
	int musicId() const { return _musicId; }
	bool muteMusic(int id) const { return id == (int)_musicId && id != 0 && !_failed; }
	uint32 underruns() const { return _underruns; }
	bool failed() const { return _failed; }
#ifndef INDY3_PCM_OFFLINE
#ifdef INDY3_MIX3
	// Main thread only, OUTSIDE the audio lock. The ISR keeps using the old
	// bank until setVolumes publishes the complete replacement under the lock.
	void prepareVolumes(int sfx) {
		sfx = sfx < 0 ? 0 : sfx > 256 ? 256 : sfx;
		delete[] _retiredSamples; _retiredSamples = 0;
		if (sfx == _scaledVolume || !_sampleBytes) return;
		delete[] _pendingSamples; _pendingSamples = new byte[_sampleBytes];
		if (!_pendingSamples) return; // Keep the previous bank on allocation failure.
		byte gain[256];
		for (int i = 0; i < 256; ++i) gain[i] = ((int)(int8)i * sfx / 256) / kSfxDivisor + kSfxBias;
		for (uint32 i = 0; i < _sampleBytes; ++i) _pendingSamples[i] = gain[_samples[i]];
		_pendingVolume = sfx;
	}
#endif
	void setVolumes(int music, int sfx) {
		music = music < 0 ? 0 : music > 256 ? 256 : music;
		sfx = sfx < 0 ? 0 : sfx > 256 ? 256 : sfx;
#ifdef INDY3_MIX3
		if (_pendingSamples && _pendingVolume == sfx) {
			_retiredSamples = _mixSamples; _mixSamples = _pendingSamples;
			_pendingSamples = 0; _scaledVolume = sfx;
		}
#endif
		if (music == _musicVolume && sfx == _sfxVolume) return;
		_musicVolume = music; _sfxVolume = sfx;
		for (int i = 0; i < 256; ++i) {
			_musicGain[i] = ((int)(int8)i * music) / 256;
			_sfxGain[i] = ((int)(int8)i * sfx) / 256;
#ifdef INDY3_MIX3
			_mixMusicGain[i] = (int)_musicGain[i] / 2 + 64;
#endif
		}
	}

#endif // !INDY3_PCM_OFFLINE: no volume API, LUTs or bank rescaling in this build.
	// Calls which change voices or the stream position require detached output
	// (or the backend audio lock). service() is the sole concurrent producer.
	void stop(int id = 0) {
		if (!id || id == (int)_musicId) {
			_musicId = _musicPos = 0; _read = _write = 0; _finished = true;
		}
		for (int i = 0; i < kVoices; ++i)
			if (!id || _voices[i].id == (uint32)id) _voices[i].id = 0;
	}
	bool startMusic(int id, uint32 position = 0, uint32 plays = 0xffffffff) {
		if (_musicId) stop(_musicId);
		if (kind(id) != 2 || position > _entries[id].length) return false;
		_musicId = id; _musicPos = position; _failed = false;
		_plays = plays == 0xffffffff ? _entries[id].plays : plays;
		_sourcePos = position; _sourcePlays = _plays;
		_finished = position == _entries[id].length;
		_read = _write = 0;
		_music.clearIOFailed();
		if (!_finished) {
			_music.seek(_entries[id].offset + position);
			if (_music.ioFailed() || _music.pos() != _entries[id].offset + position) _failed = _finished = true;
		}
		service();
		if (_failed) { stop(id); return false; }
		return true;
	}
	void startEffect(int id) {
#if defined(GAME_INDY3T) && defined(INDY3_CD_ONLY)
		return; // Diagnostic CD-only build: no resident SFX voices.
#endif
		if (kind(id) != 1) return;
		stop(id);
		uint32 indices[2] = { (uint32)id, _entries[id].second };
		for (int v = 0; v < 2 && indices[v]; ++v) {
			int slot = -1;
			for (int i = 0; i < kRenderVoices; ++i) {
				if (!_voices[i].id) { slot = i; break; }
				if (_voices[i].id != (uint32)id && _entries[_voices[i].entry].priority <= _entries[id].priority &&
					(slot < 0 || _entries[_voices[i].entry].priority < _entries[_voices[slot].entry].priority)) slot = i;
			}
			if (slot < 0) continue;
			Voice &voice = _voices[slot];
			voice.id = id; voice.entry = indices[v]; voice.pos = 0; voice.end = _entries[indices[v]].length;
		}
	}
	bool effectActive(int id) const {
		for (int i = 0; i < kVoices; ++i) if (_voices[i].id == (uint32)id && id) return true;
		return false;
	}
	bool musicActive() const { return _musicId && _musicPos < _entries[_musicId].length && !_failed; }
	void service() {
		for (int chunk = 0; chunk < 4 && !_finished; ++chunk) {
			const Entry &e = _entries[_musicId];
			unsigned write = _write, free = (_read - write - 1) & kMask;
			uint32 left = e.length - _sourcePos;
			if (free < 8192 && free < left) break;
			unsigned count = free;
			if (count > 8192) count = 8192;
			if (count > kCapacity - write) count = kCapacity - write;
			if (count > left) count = left;
			if (!count) break;
			unsigned got = _music.read(_ring + write, count);
			_sourcePos += got;
			barrier(); _write = (write + got) & kMask;
			if (got != count) { _failed = _finished = true; break; }
			if (_sourcePos == e.length) {
				if (_sourcePlays == 1) { _finished = true; break; }
				if (_sourcePlays) --_sourcePlays;
				_sourcePos = 0; _music.seek(e.offset);
				if (_music.ioFailed() || _music.pos() != e.offset) _failed = _finished = true;
			}
		}
	}
	int readBuffer(uint8 *output, int count) {
#ifdef INDY3_PCM_OFFLINE
		memset(output, kSfxBias, count); // Silence in the on-disk unsigned-biased encoding.
#else
		memset(output, 0, count);
#endif
		int done = 0;
		while (done < count) {
			unsigned read = _read, available = (_write - read) & kMask;
			if (!available) break;
			unsigned n = count - done;
			if (n > available) n = available;
			if (n > kCapacity - read) n = kCapacity - read;
			memcpy(output + done, _ring + read, n);
			barrier(); _read = (read + n) & kMask;
			done += n;
			uint32 length = _entries[_musicId].length;
			_musicPos += n;
			while (_musicPos >= length && _plays != 1) {
				_musicPos -= length;
				if (_plays) --_plays;
			}
		}
		if (done < count && !_finished) ++_underruns;
#ifdef INDY3_MIX3
		mixThree(output, count);
#else
		Voice *active[kVoices];
		int numActive = 0;
		for (int i = 0; i < kVoices; ++i) if (_voices[i].id) active[numActive++] = &_voices[i];
		if (!numActive) {
			for (int p = 0; p < done; ++p) output[p] = (byte)((int)_musicGain[output[p]] / 2);
			return count;
		}
		// Fixed headroom keeps music gain stable when effects enter/leave.
		// Mix all voices before clipping; no File/malloc/resampler in this path.
		for (int p = 0; p < count; ++p) {
			int sum = _musicGain[output[p]];
			for (int i = 0; i < numActive; ++i) {
				Voice &v = *active[i];
				if (!v.id) continue;
				const Entry &e = _entries[v.entry];
				sum += _sfxGain[_samples[e.offset + v.pos++]];
				if (v.pos == v.end) {
					if (e.loopLength) { v.pos = e.loop; v.end = e.loop + e.loopLength; }
					else v.id = 0;
				}
			}
			sum /= 2;
			output[p] = (byte)(sum < -128 ? -128 : sum > 127 ? 127 : sum);
		}
#endif
		return count; // persistent composite stream; inactive voices output silence
	}
	int readBufferConv(uint8 *output, int count, uint32 step) {
		if (step == 256) return readBuffer(output, count);
		memset(output, 0, count); return count; // controller enables only 12516-Hz DMA
	}
	bool endOfData() const { return false; }
	bool endOfStream() const { return false; }
	int getRate() const { return kRate; }
	void snapshot(uint32 *state) const {
		*state++ = _musicId; *state++ = _musicPos; *state++ = _plays;
		for (int i = 0; i < kVoices; ++i) {
			*state++ = _voices[i].id; *state++ = _voices[i].entry;
			*state++ = _voices[i].pos; *state++ = _voices[i].end;
		}
	}
	void restore(const uint32 *state) {
		stop();
		if (state[0] < 256 && kind(state[0]) == 2) startMusic(state[0], state[1], state[2]);
#if defined(GAME_INDY3T) && defined(INDY3_CD_ONLY)
		return; // Loading a mixed-audio save must not re-enable SFX.
#endif
		state += 3;
		for (int i = 0; i < kRenderVoices; ++i, state += 4) {
			uint32 id = state[0], entry = state[1], pos = state[2], end = state[3];
			if (!id || id >= 256 || entry >= 256 || kind(id) != 1 ||
				(entry != id && entry != _entries[id].second) || pos >= end || end > _entries[entry].length) continue;
			_voices[i].id = id; _voices[i].entry = entry; _voices[i].pos = pos; _voices[i].end = end;
		}
	}
private:
#ifdef INDY3_MIX3
	void mixThree(byte *output, int count) {
		for (int offset = 0; offset < count; offset += kMixChunk) {
			unsigned n = count - offset;
			if (n > kMixChunk) n = kMixChunk;
			for (int i = 0; i < kRenderVoices; ++i) {
				byte *dest = (byte *)_mixScratch[i];
				memset(dest, kSfxBias, n);
				Voice &v = _voices[i];
				unsigned done = 0;
				while (v.id && done < n) {
					const Entry &e = _entries[v.entry];
					unsigned span = v.end - v.pos;
					if (span > n - done) span = n - done;
#ifdef INDY3_PCM_OFFLINE
					memcpy(dest + done, _samples + e.offset + v.pos, span);
#else
					memcpy(dest + done, _mixSamples + e.offset + v.pos, span);
#endif
					v.pos += span; done += span;
					if (v.pos == v.end) {
						if (e.loopLength) { v.pos = e.loop; v.end = e.loop + e.loopLength; }
						else v.id = 0;
					}
				}
			}
			byte *dst = output + offset;
			const byte *a = (byte *)_mixScratch[0], *b = (byte *)_mixScratch[1];
#ifdef __ATARI__
			// DMA buffers are aligned; keep the AudioStream API safe for odd destinations too.
			if (!((unsigned long)dst & 1)) {
#ifdef INDY3_PCM_OFFLINE
				indy3_mix3_offline(dst, a, b, _mixClip, n);
#elif defined(INDY3_MIX3_HALF)
				indy3_mix3_half(dst, a, b, _mixMusicGain, n, _mixClip);
#else
				indy3_mix3(dst, a, b, _mixMusicGain, n);
#endif
				continue;
			}
#endif
			for (unsigned p = 0; p < n; ++p) {
#ifdef INDY3_PCM_OFFLINE
				dst[p] = _mixClip[dst[p] + a[p] + b[p]];
#elif defined(INDY3_MIX3_HALF)
				dst[p] = _mixClip[_mixMusicGain[dst[p]] + a[p] + b[p]];
#else
				dst[p] = (byte)(_mixMusicGain[dst[p]] + a[p] + b[p]) ^ 128;
#endif
			}
		}
	}
#ifndef INDY3_PCM_OFFLINE
	byte *_mixSamples, *_pendingSamples, *_retiredSamples;
	uint32 _sampleBytes;
	int _scaledVolume, _pendingVolume;
	byte _mixMusicGain[256];
#endif
#ifdef INDY3_MIX3_HALF
	byte _mixClip[kClipSize]; // Remove combined bias and saturate the three-lane sum.
#endif
	uint32 _mixScratch[kRenderVoices][kMixChunk / 4];
#endif
	static uint32 le32(const byte *p) { return (uint32)p[0] | (uint32)p[1] << 8 | (uint32)p[2] << 16 | (uint32)p[3] << 24; }
	static void barrier() { __asm__ volatile ("" : : : "memory"); }
	Entry _entries[256];
	Voice _voices[kVoices];
	byte *_samples;
	File _music;
	bool _ready, _musicReady;
#ifndef INDY3_PCM_OFFLINE
	int _musicVolume, _sfxVolume;
	int8 _musicGain[256], _sfxGain[256];
#endif
	uint32 _musicId, _musicPos, _plays, _sourcePos, _sourcePlays;
	byte _ring[kCapacity];
	volatile uint16 _read, _write;
	volatile bool _finished, _failed;
	uint32 _underruns;
};
#endif
