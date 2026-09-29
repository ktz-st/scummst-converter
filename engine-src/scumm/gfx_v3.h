/* SCUMM v3 VGA strip codecs, adapted from ScummVM 0.6.0 gfx.cpp.
 * Copyright (C) 2001-2004 The ScummVM project. GPL-2.0-or-later.
 * Decode into eight-pixel rows before the existing Atari planar conversion.
 */
#ifndef SCUMM_GFX_V3_H
#define SCUMM_GFX_V3_H
namespace Scumm {
struct V3StripBits {
	const unsigned char *src;
	unsigned bits, count;
	explicit V3StripBits(const unsigned char *p) : src(p), bits(0), count(0) {}
	unsigned read(unsigned n) {
		unsigned value = 0;
		for (unsigned i = 0; i < n; ++i) {
			if (!count) { bits = *src++; count = 8; }
			value |= (bits & 1) << i; bits >>= 1; --count;
		}
		return value;
	}
};

inline void decodeV3Strip(unsigned char *dst, const unsigned char *src,
		int height, int codec, const unsigned char *palette) {
	int pos = 0, total = height * 8;
	if (height <= 0) return;
	// The compressed stream advances vertically, then moves one column right.
#define V3_PIXEL(c) do { dst[(pos % height) * 8 + pos / height] = (c); \
	if (++pos == total) return; } while (0)
#define V3_COLOR(c) (palette ? palette[(c)] : (c))
	if (codec == 1) {
		for (;;) { unsigned char color = *src++; V3_PIXEL(color); }
	} else if (codec == 2) {
		for (;;) {
			unsigned run = *src++ + 1; unsigned char index = *src++; unsigned char color = V3_COLOR(index);
			do { V3_PIXEL(color); } while (--run);
		}
	} else if (codec == 3) {
		V3StripBits bits(src); unsigned bank = 0;
		for (;;) {
			unsigned code = bits.read(4), count = code & 3;
			switch (code >> 2) {
			case 0: {
				unsigned index = bank * 16 + bits.read(4); unsigned char color = V3_COLOR(index);
				for (unsigned i = 0; i < count + 2; ++i) { V3_PIXEL(color); }
				break;
			}
			case 1:
				for (unsigned i = 0; i < count + 1; ++i) {
					unsigned index = bank * 16 + bits.read(4); unsigned char color = V3_COLOR(index); V3_PIXEL(color);
				}
				break;
			case 2: bank = bits.read(4); break;
			}
		}
	} else if (codec == 4) {
		unsigned num = *src++; const unsigned char *local = src; src += num;
		for (;;) {
			unsigned char color = *src++;
			if (color < num) { V3_PIXEL(V3_COLOR(local[color])); }
			else {
				unsigned run = color - num + 1; unsigned char index = *src++; color = V3_COLOR(index);
				do { V3_PIXEL(color); } while (--run);
			}
		}
	} else if (codec == 7) {
		unsigned char color = *src++, inc = 1; V3StripBits bits(src);
		for (;;) {
			V3_PIXEL(V3_COLOR(color));
			unsigned i = 0; while (i < 3 && bits.read(1)) ++i;
			if (i == 1) { inc = -inc; color -= inc; }
			else if (i == 2) color -= inc;
			else if (i == 3) { color = bits.read(8); inc = 1; }
		}
	}
#undef V3_PIXEL
#undef V3_COLOR
}
}
#endif
