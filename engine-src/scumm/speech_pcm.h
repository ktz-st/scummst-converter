// Indexed, offline-resampled talkie speech bank. GPL-2.0-or-later.
#ifndef SCUMM_SPEECH_PCM_H
#define SCUMM_SPEECH_PCM_H
#include "common/file.h"
#include "sound/audiostream.h"
#include "sound/mixer.h"
class SpeechPCM {
public:
	struct Entry { uint32 key, offset, length, markers; };
	enum { kRate = 12516 };
	SpeechPCM(const char *directory,const char *game):_entries(0),_count(0),_ready(false){
		char name[20];sprintf(name,"%s.IDX",game);File index;
		if(!index.open(name,directory)||index.readUint32BE()!=0x53504331||index.readUint32LE()!=1||index.readUint32LE()!=kRate)return;
		_count=index.readUint32LE();uint32 bytes=index.readUint32LE();
		if(!_count||_count>20000||index.size()!=20+_count*16)return;
		_entries=new Entry[_count];if(!_entries)return;uint32 previous=0;
		for(unsigned i=0;i<_count;++i){Entry&e=_entries[i];e.key=index.readUint32LE();e.offset=index.readUint32LE();e.length=index.readUint32LE();e.markers=index.readUint32LE();
			if((i&&e.key<=previous)||!e.length||e.markers>=64||e.offset>bytes||e.markers*2>bytes-e.offset||e.length>bytes-e.offset-e.markers*2)return;previous=e.key;}
		sprintf(name,"%s.PCM",game);if(!_pcm.open(name,directory)||_pcm.size()!=bytes)return;_ready=true;
	}
	~SpeechPCM(){delete[]_entries;}
	bool ready()const{return _ready;}
	bool load(uint32 key,unsigned expected,uint16*markers,unsigned capacity,bool audio,AudioStream*&stream){
		stream=0;const Entry*e=find(key);if(!e||e->markers!=expected||e->markers>=capacity)return false;
		_pcm.seek(e->offset);for(unsigned i=0;i<e->markers;++i)markers[i]=_pcm.readUint16BE();markers[e->markers]=0xffff;
		if(!audio)return true;byte*data=(byte*)malloc(e->length);if(!data||_pcm.read(data,e->length)!=e->length){free(data);return false;}
		stream=makeLinearInputStream(kRate,SoundMixer::FLAG_AUTOFREE|SoundMixer::FLAG_UNSIGNED,data,e->length,0,0);return stream!=0;
	}
private:
	const Entry*find(uint32 key)const{unsigned lo=0,hi=_count;while(lo<hi){unsigned mid=lo+(hi-lo)/2;if(_entries[mid].key<key)lo=mid+1;else hi=mid;}return lo<_count&&_entries[lo].key==key?&_entries[lo]:0;}
	Entry*_entries;uint32 _count;bool _ready;File _pcm;
};
#endif
