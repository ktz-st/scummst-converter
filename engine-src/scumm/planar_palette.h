// Palette maintenance for preconverted v3/v4 FE/FF strips.
// The bitmap itself uses the same MOVEP-ready layout as the v5/v6 converter.
#ifndef SCUMM_PLANAR_PALETTE_H
#define SCUMM_PLANAR_PALETTE_H

namespace Scumm {
// src points just past FE/FF. The preceding three bytes hold height (LE16)
// and flags (bit 0: apply the v3 room-index map). Palette metadata follows
// the bitmap and, for FF, its four-byte-padded transparency mask:
// LE16 color count, then [index, reserved, LE16 row count, cached fill (4),
// (row, 8-pixel coverage mask)*row count]. Row numbers are limited to 0..254.
// Resource memory is writable. Cached colors are compared, not tied to a
// global epoch, so reloading rooms/inventory/savegames cannot stale the cache.
static inline void refreshPlanarPalette(byte *src, bool transparent,
                                       const byte *roomMap, const uint32 *fills,
                                       const uint32 *repeats) {
	const unsigned height = READ_LE_UINT16(src - 4);
	byte *entry = src + height * 4 + (transparent ? ((height + 3) & ~3) : 0);
	unsigned colors = READ_LE_UINT16(entry);
	entry += 2;
	while (colors--) {
		const byte index = (src[-2] & 1) ? roomMap[entry[0]] : entry[0];
		const unsigned count = READ_LE_UINT16(entry + 2);
		const uint32 fill = READ_BE_UINT32(fills + index);
		const uint32 delta = fill ^ READ_BE_UINT32(entry + 4);
		if (delta) {
			WRITE_BE_UINT32(entry + 4, fill);
			const byte *row = entry + 8;
			for (unsigned i = 0; i < count; ++i, row += 2) {
				byte *pixels = src + (unsigned(row[0]) << 2);
				const uint32 coverage = repeats[row[1]];
				WRITE_BE_UINT32(pixels, READ_BE_UINT32(pixels) ^ (delta & coverage));
			}
		}
		entry += 8 + count * 2;
	}
}
}
#endif
