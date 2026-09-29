// First-pass AdLib -> YM2149 tone envelope. This is NOT an OPL emulator:
// operator ratios and FM feedback are not rendered. Indy3 SFX pitch/level
// modulation is applied per voice by stchip_adlib_sfx.h.
// Notes and timing are supplied unchanged by the original AD sequence converter.
// The ST chip sequencer is called from VBL (50 Hz in PAL); attack/release are bounded
// PSG approximations, not the nonlinear, key-scaled OPL envelope timings.
#ifndef STCHIP_ADLIB_H
#define STCHIP_ADLIB_H
template<class Inst>
static void makeYmAdlibInstrument(Inst &out, const byte *data) {
	memset(&out, 0, sizeof(out));
	out.flags = Inst::FLG_SQUARE;
	out.sustain = 255; // note-off comes from the sequence, not a short fixed preset
	// iMUSE stores complemented attack/decay and sustain/release registers.
	const unsigned attack = ((~data[7]) >> 4) & 15;
	const unsigned release = (~data[8]) & 15;
	out.decay = 1 << (release >> 1); // 1..128 in the backend's 8-bit volume units
	typename Inst::Seq &vol = out.seq[Inst::SEQ_VOL];
	const unsigned steps = attack >= 12 ? 1 : attack >= 8 ? 2 : 4;
	vol.length = steps;
	vol.repeat = steps - 1;
	for (unsigned i = 0; i < steps; ++i) vol.data[i] = (15 * (i + 1)) / steps;
}
#endif
