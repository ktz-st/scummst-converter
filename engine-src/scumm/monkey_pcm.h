// Monkey1 CD + talkie PCM. Signed files, three buffered lanes, no callback I/O.
// GPL-2.0-or-later. Index format is defined by tools/prepare_monkey_pcm.py.
#ifndef SCUMM_MONKEY_PCM_H
#define SCUMM_MONKEY_PCM_H
#include "sound/audiostream.h"
#include "common/file.h"
#ifdef __ATARI__
extern "C" void indy3_mix3_offline(byte *, const byte *, const byte *, const byte *, unsigned long);
#endif

class MonkeyPCMStream : public AudioStream {
public:
	enum { kRate=12516, kCapacity=32768, kMask=kCapacity-1, kStateWords=9 };
	static uint32 word(const byte *p) { return (uint32)p[0]|(uint32)p[1]<<8|(uint32)p[2]<<16|(uint32)p[3]<<24; }
	static void barrier() { __asm__ volatile ("" : : : "memory"); }
	class Lane {
	public:
		File file;
		File *input;
		byte ring[kCapacity];
		volatile uint16 read, write;
		volatile bool enabled, finished;
		uint32 key, offset, length, pos, plays, sourcePos, sourcePlays, underruns;
		bool failed, opened;
		uint32 fileSize; // Immutable PCM bank; never seek to EOF per index entry.
		Lane() : input(&file),read(0),write(0),enabled(false),finished(true),key(0),offset(0),length(0),pos(0),plays(0),sourcePos(0),sourcePlays(0),underruns(0),failed(false),opened(false),fileSize(0) {}
		bool active() const { return enabled && !(finished && read==write); }
		void stop() { enabled=false; barrier(); key=0; read=write=0; finished=true; }
		bool start(uint32 id,uint32 off,uint32 len,uint32 repeat,uint32 position=0,uint32 alternateSize=0) {
			stop(); failed=false;
			uint32 size=input==&file?fileSize:alternateSize;
			if(!input->isOpen() || !len || off>size || len>size-off || position>=len)return false;
			key=id;offset=off;length=len;pos=sourcePos=position;plays=sourcePlays=repeat;finished=false;
			input->clearIOFailed();input->seek(off+position);
			if(input->ioFailed()||input->pos()!=off+position){failed=finished=true;return false;}
			service();barrier();enabled=!failed;return enabled;
		}
		void service() {
			// Single main-thread producer. The IRQ consumes only published bytes.
			for(int chunks=0;chunks<4&&!finished;++chunks){
				unsigned w=write,free=(read-w-1)&kMask;
				uint32 left=length-sourcePos;
				if(!free || (free<8192&&free<left))break;
				unsigned n=free;if(n>8192)n=8192;if(n>left)n=left;if(n>kCapacity-w)n=kCapacity-w;
				unsigned got=input->read(ring+w,n);
				if(input->ioFailed() || got!=n){failed=finished=true;break;}
				// Offset binary only, no gain: retain every source amplitude bit.
				for(unsigned i=0;i<n;++i)ring[w+i]^=128;
				sourcePos+=n;barrier();write=(w+n)&kMask;
				if(sourcePos==length){
					if(sourcePlays==1){finished=true;break;}
					if(sourcePlays)--sourcePlays;
					sourcePos=0;input->seek(offset);
					if(input->ioFailed()||input->pos()!=offset)failed=finished=true;
				}
			}
		}
		void render(byte *dst,unsigned count) {
			memset(dst,128,count);
			if(!enabled)return;
			unsigned done=0;
			while(done<count){
				unsigned r=read,available=(write-r)&kMask;if(!available)break;
				unsigned n=count-done;if(n>available)n=available;if(n>kCapacity-r)n=kCapacity-r;
				memcpy(dst+done,ring+r,n);barrier();read=(r+n)&kMask;done+=n;pos+=n;
				while(pos>=length&&plays!=1){pos-=length;if(plays)--plays;}
			}
			if(done<count&&!finished)++underruns;
		}
	};
	MonkeyPCMStream(const char *directory) : _index(0),_ready(false),_sounds(0),_voices(0),_markers(0) {
		for(int i=0;i<768;++i){int value=i-384;_clip[i]=(byte)(value < -128 ? -128 : value>127 ? 127 : value);}
		File index;byte head[32];
		if(!index.open("M1PCM.IDX",directory)||index.read(head,32)!=32||memcmp(head,"M1PC",4)||word(head+4)!=1||word(head+8)!=kRate||word(head+24)||word(head+28))return;
		_sounds=word(head+12);_voices=word(head+16);_markers=word(head+20);
		if(!_sounds||_sounds>1024||!_voices||_voices>20000||_markers>_voices*63)return;
		uint32 size=_sounds*24+_voices*20+_markers*2;
		if(index.size()!=size+32)return;
		_index=new byte[size];if(!_index||index.read(_index,size)!=size)return;
		const char *names[3]={"M1MUSIC.PCM","M1VOICE.PCM","M1SFX.PCM"};
		for(int i=0;i<3;++i) {
			_lane[i].opened=_lane[i].file.open(names[i],directory);
			if(_lane[i].opened)_lane[i].fileSize=_lane[i].file.size();
		}
		_voiceSfx.open("M1VOICE.PCM",directory); // Independent cursor for SOU mode 1.
		for(unsigned i=0;i<_sounds;++i){
			const byte *e=sound(i);unsigned kind=word(e);
			if(kind>3)return;
			// Resource 70 is an intentional empty SBL sound. It replaces/stops
			// the SFX lane but has no samples to play.
			if(kind==2&&!word(e+8))return;
			if((kind==1||kind==2)&&!validExtent(_lane[kind==2?0:2],word(e+4),word(e+8)))return;
		}
		uint32 previous=0;
		for(unsigned i=0;i<_voices;++i){
			const byte *e=voice(i);uint32 key=word(e),marker=word(e+12),count=word(e+16);
			if((i&&key<=previous)||key>=0x7fffffff||!word(e+8)||count>=64||marker>_markers||count>_markers-marker||!validExtent(_lane[1],word(e+4),word(e+8)))return;
			previous=key;
		}
		_ready=true;
	}
	~MonkeyPCMStream(){delete[] _index;}
	bool ready()const{return _ready;}
	int kind(int id)const{return _ready&&id>0&&(unsigned)id<_sounds?word(sound(id)):0;}
	bool playSound(int id) {
		int k=kind(id);if(!k)return false;
		if(k==3){_lane[0].stop();return true;}
		Lane &lane=_lane[k==2?0:2];
		if(k==2&&lane.key==(uint32)id&&lane.active())return true;
		lane.stop();lane.input=&lane.file;
		const byte *e=sound(id);lane.start(id,word(e+4),word(e+8),word(e+12));return true;
	}
	bool playVoice(uint32 key,int lane=1,uint32 position=0) {
		if(lane!=1&&lane!=2)return false;
		const byte *e=findVoice(key);if(!e){_lane[lane].stop();return false;}
		_lane[lane].stop();_lane[lane].input=lane==1?&_lane[1].file:&_voiceSfx;
		return _lane[lane].start(0x80000000|(key+1),word(e+4),word(e+8),1,position,_lane[1].fileSize);
	}
	bool sync(uint32 key,uint16 *times,unsigned capacity)const {
		const byte *e=findVoice(key);if(!e)return false;
		unsigned n=word(e+16);if(n>=capacity)return false;
		const byte *p=_index+_sounds*24+_voices*20+word(e+12)*2;
		for(unsigned i=0;i<n;++i)times[i]=p[i*2]|(uint16)p[i*2+1]<<8;
		times[n]=0xffff;return true;
	}
	bool active(int lane)const{return _ready&&_lane[lane].active();}
	uint32 key(int lane)const{return _lane[lane].key;}
	uint32 position(int lane)const{return _lane[lane].pos;}
	uint32 underruns()const{return _lane[0].underruns+_lane[1].underruns+_lane[2].underruns;}
	void stopLane(int lane){_lane[lane].stop();}
	void stopSound(int id){for(int i=0;i<3;i+=2)if(!id||_lane[i].key==(uint32)id)_lane[i].stop();if(!id)_lane[1].stop();}
	void service(){if(_ready)for(int i=0;i<3;++i)if(_lane[i].enabled)_lane[i].service();}
	int readBuffer(uint8 *out,int count){
		for(int off=0;off<count;off+=1024){
			unsigned n=count-off;if(n>1024)n=1024;
			for(int i=0;i<3;++i)_lane[i].render((byte*)_scratch[i],n);
#ifdef __ATARI__
			memcpy(out+off,_scratch[0],n);
			indy3_mix3_offline(out+off,(byte*)_scratch[1],(byte*)_scratch[2],_clip,n);
#else
			for(unsigned i=0;i<n;++i)out[off+i]=_clip[((byte*)_scratch[0])[i]+((byte*)_scratch[1])[i]+((byte*)_scratch[2])[i]];
#endif
		}
		return count;
	}
	int readBufferConv(uint8 *out,int count,uint32 step){if(step==256)return readBuffer(out,count);memset(out,0,count);return count;}
	bool endOfData()const{return false;}
	bool endOfStream()const{return false;}
	int getRate()const{return kRate;}
	void snapshot(uint32 *state)const{
		for(int i=0;i<3;++i){*state++=active(i)?_lane[i].key:0;*state++=_lane[i].pos;*state++=_lane[i].plays;}
	}
	void restore(const uint32 *state){
		stopSound(0);
		for(int i=0;i<3;++i,state+=3){
			if(!state[0])continue;
			if(i && (state[0]&0x80000000)){playVoice((state[0]&0x7fffffff)-1,i,state[1]);continue;}
			if(i==1)continue;
			int k=kind(state[0]);if(k!=(i==0?2:1))continue;
			_lane[i].input=&_lane[i].file;
			const byte *e=sound(state[0]);_lane[i].start(state[0],word(e+4),word(e+8),state[2],state[1]);
		}
	}
private:
	static bool validExtent(Lane &lane,uint32 offset,uint32 length){return !lane.opened||(offset<=lane.fileSize&&length<=lane.fileSize-offset);}
	const byte *sound(unsigned id)const{return _index+id*24;}
	const byte *voice(unsigned id)const{return _index+_sounds*24+id*20;}
	const byte *findVoice(uint32 key)const{
		if(!_ready)return 0;unsigned lo=0,hi=_voices;
		while(lo<hi){unsigned mid=lo+(hi-lo)/2;uint32 v=word(voice(mid));if(v<key)lo=mid+1;else hi=mid;}
		return lo<_voices&&word(voice(lo))==key?voice(lo):0;
	}
	byte *_index;bool _ready;uint32 _sounds,_voices,_markers;
	Lane _lane[3];File _voiceSfx;byte _clip[768];uint32 _scratch[3][256];
};
#endif
