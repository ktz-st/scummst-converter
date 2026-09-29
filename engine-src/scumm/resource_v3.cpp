/* ScummVM - Scumm Interpreter
 * Copyright (C) 2001-2004 The ScummVM project
 *
 * SCUMM v3/v4 resource directory support, restored from ScummVM 0.6.0
 * and trimmed to the non-old-bundle format used by Loom VGA CD.
 */

#include "stdafx.h"
#include "scumm/scumm.h"
#include "scumm/intern.h"
#include "scumm/resource.h"

namespace Scumm {

void ScummEngine_v3::readIndexFile() {
	uint16 blocktype;
	uint32 itemsize;

	debugC(DEBUG_GENERAL, "ScummEngine_v3::readIndexFile()");
	closeRoom();
	openRoom(0);

	// Converted v4 indexes retain their original six-byte directory blocks,
	// preceded by the standard ScummST resource-version marker.
	fileReadDword(); // _ST_
	uint32 markerSize = _fileHandle.readUint32BE();
	_resourceVersion = _fileHandle.readUint16BE();
	_fileHandle.readUint16BE();
	_fileHandle.seek(markerSize, SEEK_SET);
	uint32 indexStart = _fileHandle.pos();

	// First pass: determine allocation sizes from the v3/v4 directory.
	while (!_fileHandle.eof()) {
		itemsize = _fileHandle.readUint32LE();
		blocktype = _fileHandle.readUint16LE();
		if (_fileHandle.ioFailed())
			break;

		switch (blocktype) {
		case 0x4E52: /* RN */ _fileHandle.readUint16LE(); break;
		case 0x5230: /* 0R */ _numRooms = _fileHandle.readUint16LE(); break;
		case 0x5330: /* 0S */ _numScripts = _fileHandle.readUint16LE(); break;
		case 0x4E30: /* 0N */ _numSounds = _fileHandle.readUint16LE(); break;
		case 0x4330: /* 0C */ _numCostumes = _fileHandle.readUint16LE(); break;
		case 0x4F30: /* 0O */ _numGlobalObjects = _fileHandle.readUint16LE(); break;
		}
		_fileHandle.seek(itemsize - 8, SEEK_CUR);
	}

	_fileHandle.clearIOFailed();
	_fileHandle.seek(indexStart, SEEK_SET);
	readMAXS();

	_palManipCounter = 0;
	_palManipPalette = 0;
	_palManipIntermediatePal = 0;

	// Second pass: populate the resource directories and global objects.
	while (true) {
		itemsize = _fileHandle.readUint32LE();
		if (_fileHandle.ioFailed())
			break;
		blocktype = _fileHandle.readUint16LE();

		switch (blocktype) {
		case 0x4E52: /* RN */
			_fileHandle.seek(itemsize - 6, SEEK_CUR);
			break;
		case 0x5230: /* 0R */
			readResTypeList(rtRoom, MKID('ROOM'), "room");
			break;
		case 0x5330: /* 0S */
			readResTypeList(rtScript, MKID('SCRP'), "script");
			break;
		case 0x4E30: /* 0N */
			readResTypeList(rtSound, MKID('SOUN'), "sound");
			break;
		case 0x4330: /* 0C */
			readResTypeList(rtCostume, MKID('COST'), "costume");
			break;
		case 0x4F30: /* 0O */
			readGlobalObjects();
			break;
		default:
			error("Bad ID %c%c found in v3/v4 directory!", blocktype & 0xFF, blocktype >> 8);
			return;
		}
	}
	closeRoom();
}

void ScummEngine_v3::loadCharset(int no) {
	uint32 size;
	memset(_charsetData, 0, sizeof(_charsetData));
	checkRange(4, 0, no, "Loading illegal charset %d");
	closeRoom();

	File file;
	char name[20];
	sprintf(name, "%02d.LFL", 99 - no);
	file.open(name, getGameDataPath());
	if (!file.isOpen())
		error("loadCharset(%d): Missing charset file %s", no, name);

	size = file.readUint16LE();
	file.read(createResource(rtCharset, no, size), size);
	file.close();
}

void ScummEngine_v3::readMAXS() {
	_numVariables = 800;
	_numBitVariables = 4096;
	_numLocalObjects = 200;
	_numArray = 50;
	_numVerbs = 100;
	_numNewNames = 0;
	_objectRoomTable = 0;
	_numCharsets = 9;
	_numInventory = 80;
	_numGlobalScripts = 200;
	_numFlObject = 50;
	allocateArrays();
	_dynamicRoomOffsets = true;
}

void ScummEngine_v3::readGlobalObjects() {
	int num = _fileHandle.readUint16LE();
	assert(num == _numGlobalObjects);
	for (int i = 0; i != num; ++i) {
		uint32 bits = _fileHandle.readByte();
		bits |= _fileHandle.readByte() << 8;
		bits |= _fileHandle.readByte() << 16;
		_classData[i] = bits;
		byte value = _fileHandle.readByte();
		_objectOwnerTable[i] = value & OF_OWNER_MASK;
		_objectStateTable[i] = value >> OF_STATE_SHL;
	}
}

} // namespace Scumm
