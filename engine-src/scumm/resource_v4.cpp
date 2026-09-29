/* ScummVM - Scumm Interpreter
 * Copyright (C) 2001-2004 The ScummVM project
 *
 * SCUMM v4 external charset loader, restored from ScummVM 0.6.0.
 */

#include "stdafx.h"
#include "scumm/scumm.h"
#include "scumm/intern.h"

namespace Scumm {

void ScummEngine_v4::loadCharset(int no) {
	uint32 size;
	memset(_charsetData, 0, sizeof(_charsetData));
	checkRange(4, 0, no, "Loading illegal charset %d");
	closeRoom();

	char name[20];
	sprintf(name, "%03d.LFL", 900 + no);
	File file;
	if (!file.open(name, getGameDataPath()))
		error("loadCharset(%d): Missing charset file %s", no, name);
	size = file.readUint32LE() + 11;
	file.read(createResource(rtCharset, no, size), size);
	file.close();
}

} // namespace Scumm
