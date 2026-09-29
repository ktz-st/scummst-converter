// Buffered signed 8-bit mono CD replacement for Loom. GPL-2.0-or-later.
// Producer: main game loop (File I/O). Consumer: existing talkie/DMA callback.
#ifndef SCUMM_LOOM_PCM_H
#define SCUMM_LOOM_PCM_H
#include "sound/audiostream.h"
#include "common/file.h"

class LoomPCMStream : public AudioStream {
public:
	enum { kRate = 12516, kCapacity = 32768, kMask = kCapacity - 1 };
	static uint32 frameToSample(uint32 frame) {
		// Avoid overflow for a full-length CD; floor at each absolute boundary.
		return (frame / 75) * kRate + ((frame % 75) * kRate) / 75;
	}
	static int startFrame(uint16 offset) { return ((int)offset * 15 - 45300) / 2; }
	static int durationFrames(uint16 duration) { return ((int)duration * 15) / 2 + 5; }

	LoomPCMStream(const char *directory, uint32 start, uint32 length)
		: _read(0), _write(0), _finished(false), _failed(false), _remaining(0),
		  _played(0), _underruns(0), _fraction(0), _start(start), _length(0) {
		if (!_file.open("LOOMCD.PCM", directory)) { _finished = _failed = true; return; }
		uint32 size = _file.size();
		if (start >= size || !length) { _finished = _failed = true; return; }
		_length = length < size - start ? length : size - start;
		_remaining = _length;
		_file.seek(start);
		if (_file.ioFailed() || _file.pos() != start) { _finished = _failed = true; return; }
		service();
	}
	// Single-producer/single-consumer, not a general threaded queue. On 68000,
	// aligned 16-bit indices are atomic. Publish only after copying the bytes;
	// never hold the audio mutex across GEMDOS reads.
	void service() {
		for (int chunk = 0; chunk < 4 && !_finished; ++chunk) {
			unsigned write = _write;
			unsigned free = (_read - write - 1) & kMask;
			if (free < 8192 && free < _remaining) break;
			unsigned count = free;
			if (count > 8192) count = 8192;
			if (count > kCapacity - write) count = kCapacity - write;
			if (count > _remaining) count = _remaining;
			if (!count) break;
			unsigned got = _file.read(_data + write, count);
			_remaining -= got;
			barrier();
			_write = (write + got) & kMask;
			if (got != count) _failed = true;
			if (!_remaining || _failed) { barrier(); _finished = true; }
		}
	}
	int readBuffer(uint8 *output, int count) {
		int done = 0;
		while (done < count) {
			unsigned read = _read, available = (_write - read) & kMask;
			if (!available) break;
			unsigned n = count - done;
			if (n > available) n = available;
			if (n > kCapacity - read) n = kCapacity - read;
			memcpy(output + done, _data + read, n);
			barrier();
			_read = (read + n) & kMask;
			_played += n;
			done += n;
		}
		if (done < count) {
			memset(output + done, 0, count - done); // signed PCM silence
			if (!_finished) ++_underruns;
		}
		return done;
	}
	int readBufferConv(uint8 *output, int count, uint32 step) {
		// Retain the existing low-rate fallback (e.g. ST YM sample output).
		// The intended STE 12516 Hz path uses readBuffer/memcpy, no resampling.
		if (step == 256) return readBuffer(output, count);
		int done = 0;
		while (step && done < count) {
			unsigned read = _read, available = (_write - read) & kMask;
			unsigned advance = (_fraction + step) >> 8;
			if (!available || (available < advance && !_finished)) break;
			output[done++] = _data[read];
			_fraction = (_fraction + step) & 255;
			if (advance > available) advance = available;
			barrier();
			_read = (read + advance) & kMask;
			_played += advance;
		}
		if (done < count) {
			memset(output + done, 0, count - done);
			if (!_finished) ++_underruns;
		}
		return done;
	}
	bool endOfData() const { return _finished && _read == _write; }
	bool endOfStream() const { return endOfData(); }
	int getRate() const { return kRate; }
	bool failed() const { return _failed; }
	uint32 played() const { return _played; } // main-loop snapshots require audio lock
	uint32 remaining() const { return _length - _played; }
	uint32 position() const { return _start + _played; }
	uint32 underruns() const { return _underruns; }
private:
	static void barrier() { __asm__ volatile ("" : : : "memory"); }
	File _file;
	byte _data[kCapacity];
	volatile uint16 _read, _write;
	volatile bool _finished;
	bool _failed;
	uint32 _remaining;
	volatile uint32 _played, _underruns;
	unsigned _fraction;
	uint32 _start, _length;
};
#endif
