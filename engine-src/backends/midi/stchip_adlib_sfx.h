/* iMUSE parameter envelopes, adapted from backends/midi/adlib.cpp (ScummVM,
 * GPL-2.0-or-later). This is control-rate synthesis, NOT an OPL emulator.
 * Keep the four stages, signed interpolation, random durations and loops.
 * FM-only parameters are tracked but cannot be reproduced by one PSG tone.
 */
#ifndef STCHIP_ADLIB_SFX_H
#define STCHIP_ADLIB_SFX_H

struct YmAdlibEnvelope {
	int active, current, start, maximum, count, value;
	int steps, divisor, hi, lo, remainder, direction;
	byte flags, times[4], targets[4];

	static int scale(int a, int b) {
		if (!b) return 0;
		if (b == 31) return a;
		if (a < -63 || a > 63) return (b * (a + 1)) >> 5;
		int magnitude = ((a < 0 ? -a : a) * ((b < 0 ? -b : b) + 1)) >> 5;
		return (a < 0) != (b < 0) ? -magnitude : magnitude;
	}
	static int random(int limit, byte &seed) {
		seed = (seed & 1) ? (seed >> 1) ^ 0xb8 : seed >> 1;
		return (seed * limit) >> 8;
	}
	void setup(byte &seed) {
		static const uint16 durations[32] = {
			1,2,4,5,6,7,8,9,10,12,14,16,18,21,24,30,
			36,50,64,82,100,136,160,192,240,276,340,460,600,860,1200,1600
		};
		int stage = active - 1;
		int index = times[stage] & 127;
		if (index > 31) index = 31; // guard malformed custom patches
		int duration = durations[index];
		if (times[stage] & 128) duration = random(duration, seed);
		steps = divisor = duration ? duration : 1;
		int delta = 0;
		if (stage != 2) {
			int target = scale(maximum, (targets[stage] & 127) - 31);
			if (targets[stage] & 128) target = random(target, seed);
			if (target + start > maximum) target = maximum - start;
			if (target + start < 0) target = -start;
			delta = target - current;
		}
		hi = delta / divisor;
		direction = delta < 0 ? -1 : 1;
		lo = (delta < 0 ? -delta : delta) % divisor;
		remainder = 0;
	}
	void init(const byte *data, int initial, byte &seed) {
		static const uint16 limits[16] = {767,31,7,63,15,15,15,3,63,15,15,15,3,62,31,0};
		memset(this, 0, sizeof(*this));
		flags = data[0];
		if (!(flags & 128)) return;
		maximum = limits[flags & 15];
		start = initial;
		count = data[1] * 63;
		times[0] = data[2]; times[1] = data[4]; times[2] = data[6]; times[3] = data[7];
		targets[0] = data[3]; targets[1] = data[5]; targets[3] = data[8];
		active = 1;
		setup(seed);
	}
	void tick(byte &seed) {
		if (!active) return;
		if (count && (count -= 17) <= 0) { active = 0; return; }
		current += hi;
		remainder += lo;
		if (remainder >= divisor) { remainder -= divisor; current += direction; }
		value = current; // Indy3 AD effects do not use modulation-wheel scaling
		if (!--steps) {
			if (++active > 4) active = (flags & 32) ? 1 : 0;
			if (active) setup(seed);
		}
	}
};

struct YmAdlibSfx {
	YmAdlibEnvelope envelopes[2];
	bool enabled;
	int pitch, level, baseLevel;
	unsigned phase;

	void init(const byte *patch, byte velocity, byte &seed) {
		enabled = ((patch[11] | patch[20]) & 128) != 0;
		phase = 0; pitch = 0;
		baseLevel = (patch[6] & 63) + ((velocity >> 1) * ((patch[9] >> 2) + 1) >> 5);
		if (baseLevel > 63) baseLevel = 63;
		level = baseLevel;
		for (int i = 0; i < 2; ++i) {
			const byte *data = patch + 11 + 9 * i;
			int initial = 0;
			switch (data[0] & 15) {
			case 0: initial = 383; break; // pitch, 1/8 semitone units
			case 2: initial = (patch[10] >> 1) & 7; break; // feedback
			case 3: initial = baseLevel; break; // carrier level
			case 8:
				initial = (patch[1] & 63) + ((velocity >> 1) * ((patch[4] >> 2) + 1) >> 5);
				if (initial > 63) initial = 63;
				break;
			case 9: initial = patch[0] & 15; break; // modulator multiplier
			}
			envelopes[i].init(data, initial, seed);
		}
	}
	void update(byte &seed) {
		if (!enabled) return;
		// Reference timer: 250 Hz * 0xD69 / 0x411B. Five timer slices per
		// PAL VBL preserve its average rate (about 51.5 envelope ticks/s).
		phase += 5 * 0xd69;
		while (phase >= 0x411b) {
			phase -= 0x411b;
			for (int i = 0; i < 2; ++i) {
				YmAdlibEnvelope &e = envelopes[i];
				e.tick(seed);
				if (!(e.flags & 128)) continue;
				if ((e.flags & 15) == 0) pitch = e.value;
				if ((e.flags & 15) == 3) level = e.start + e.value;
			}
		}
	}
	uint16 period(byte note, const uint16 *table) const {
		// Scale the existing note period; never index outside its playable
		// range during a sweep. Q16 semitone ratios, interpolated in eighths.
		static const uint32 ratios[13] = {65536,61858,58386,55109,52016,49097,
			46341,43740,41285,38968,36781,34716,32768};
		int octaves = pitch / 96, within = pitch % 96;
		if (within < 0) { within += 96; --octaves; }
		int n = within >> 3, fraction = within & 7;
		uint32 ratio = ratios[n] - (((ratios[n] - ratios[n + 1]) * fraction) >> 3);
		uint32 result = table[note] * ratio;
		result >>= 12; // retain four fractional bits for downward sweeps
		if (octaves < 0) result <<= -octaves;
		else result >>= octaves;
		result >>= 4;
		if (result > 4095) result = 4095;
		return result ? result : 1;
	}
};
#endif
