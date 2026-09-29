#ifndef SCUMM_ZAK_CD_H
#define SCUMM_ZAK_CD_H

namespace Scumm {

// TOC of the supported 1990 JP/EN FM-Towns CD, in whole seconds (75 frames/s).
// Query 1 addresses physical track 2: track 1 contains data. Use disc lengths,
// not the lengths of the extracted PCM cues, which can omit track boundaries.
// Original script 9 checks a random entry 1..10 before clearing the demo bit.
static inline int zakCDTrackLength(int command) {
	static const unsigned short seconds[] = {
		40, 248, 245, 105, 85, 243, 161, 187, 245, 265,
		71, 73, 32, 157, 117, 191, 245, 249, 153, 257, 141, 36, 270
	};
	return command >= 1 && command <= 23 ? seconds[command - 1] : 0;
}

} // namespace Scumm

#endif
