// Zak FM-Towns 320x200 inventory adaptation, following ScummVM's trim mode.
// Only the verified English script 20 is accepted. Original files stay intact.
#ifndef SCUMM_ZAK_INVENTORY_H
#define SCUMM_ZAK_INVENTORY_H
namespace Scumm {
static inline bool patchZakInventory(byte *data, uint32 size) {
	if (size != 291) return false;
	uint32 hash = 2166136261u;
	for (uint32 i = 0; i < size; ++i) hash = (hash ^ data[i]) * 16777619u;
	if (hash != 0xc47cb6d2u) return false;
	// Five inventory page-size operands: 10 -> 6, no bytecode size change.
	static const uint16 offsets[] = {26, 38, 45, 131, 243};
	for (uint32 i = 0; i < sizeof(offsets) / sizeof(offsets[0]); ++i)
		data[offsets[i]] = 6;
	return true;
}
}
#endif
