#!/usr/bin/env python3
"""Run the production Cobalt AAC wrapper with controlled decoder and job boundaries."""
import os, subprocess, tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as t:
 d=Path(t)
 def put(n,s):
  p=d/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s)
 put('starboard/shared/starboard/player/filter/audio_decoder_internal.h',r'''
#pragma once
#include <memory>
#include <vector>
#include <functional>
#include <string>
#include <cstdint>
template<class T> using scoped_refptr=std::shared_ptr<T>;
constexpr int kSbMediaAudioSampleTypeFloat32=0,kSbMediaAudioFrameStorageTypeInterleaved=0,kSbPlayerErrorDecode=1;
namespace starboard { namespace shared { namespace starboard { namespace player { namespace filter {
struct DecodedAudio {
 std::vector<uint8_t> bytes;int64_t pts=0;
 DecodedAudio()=default;
 DecodedAudio(int,int,int,int64_t t,size_t s):bytes(s),pts(t){}
 uint8_t* buffer(){return bytes.data();}size_t size()const{return bytes.size();}
};
struct InputBuffer {
 uint8_t b=1;int64_t pts;
 const uint8_t* data()const{return &b;}int size()const{return 1;}int64_t timestamp()const{return pts;}
};
class AudioDecoder {
public:
 using DecodedAudio=filter::DecodedAudio;using InputBuffer=filter::InputBuffer;
 using InputBuffers=std::vector<scoped_refptr<InputBuffer>>;
 using OutputCB=std::function<void()>;using ConsumedCB=std::function<void()>;
 using ErrorCB=std::function<void(int,const std::string&)>;
 virtual ~AudioDecoder()=default;
 virtual void Initialize(const OutputCB&,const ErrorCB&)=0;
 virtual void Decode(const InputBuffers&,const ConsumedCB&)=0;
 virtual void WriteEndOfStream()=0;
 virtual scoped_refptr<DecodedAudio> Read(int*)=0;
 virtual void Reset()=0;
};
}}}}}
''')
 put('starboard/shared/starboard/player/job_queue.h',r'''
#pragma once
#include <deque>
#include <memory>
#include <functional>
namespace starboard { namespace shared { namespace starboard { namespace player {
inline std::deque<std::function<void()>>& Jobs(){static std::deque<std::function<void()>> q;return q;}
inline void Run(){int n=0;while(!Jobs().empty()){auto f=Jobs().front();Jobs().pop_front();f();if(++n>10000)std::abort();}}
struct JobQueue {struct JobOwner {
 std::shared_ptr<int> generation=std::make_shared<int>(0);
 ~JobOwner(){CancelPendingJobs();}
 void CancelPendingJobs(){generation=std::make_shared<int>(0);}
 void Schedule(std::function<void()> f){std::weak_ptr<int> g=generation;Jobs().push_back([g,f]{if(!g.expired())f();});}
};};
}}}}
''')
 put('starboard/common/log.h','#pragma once\n#include <sstream>\n#define SB_LOG(v) std::ostringstream()\n')
 put('starboard/webos/arm/webos_media_diagnostics.h',r'''
#pragma once
namespace starboard { namespace shared { namespace webos {
enum class MediaCodec{kAac};enum class AudioDecoderBackend{kFirmwareFfmpeg};
inline void RecordAudioDecoderSelection(MediaCodec,AudioDecoderBackend){}
inline void RecordAudioDecoderFailure(MediaCodec,int,bool,AudioDecoderBackend){}
}}}
''')
 put('starboard/shared/libfdkaac/fdk_aac_audio_decoder.h',r'''
#pragma once
#include <queue>
#include "starboard/shared/starboard/player/filter/audio_decoder_internal.h"
#include "starboard/shared/starboard/player/job_queue.h"
namespace starboard { namespace shared { namespace libfdkaac {
class FdkAacAudioDecoder:public shared::starboard::player::filter::AudioDecoder,
 private shared::starboard::player::JobQueue::JobOwner {
 OutputCB out;ErrorCB error;std::queue<scoped_refptr<DecodedAudio>> q;
 public:
 void Initialize(const OutputCB& o,const ErrorCB& e)override{out=o;error=e;}
 void Decode(const InputBuffers& in,const ConsumedCB& c)override{
  if(in.size()!=1)std::abort();q.push(std::make_shared<DecodedAudio>(2,0,0,in[0]->timestamp(),8));Schedule(out);Schedule(c);
 }
 void WriteEndOfStream()override{q.push(std::make_shared<DecodedAudio>());Schedule(out);}
 scoped_refptr<DecodedAudio> Read(int* rate)override{*rate=48000;auto a=q.front();q.pop();return a;}
 void Reset()override{CancelPendingJobs();q={};}
};
}}}
''')
 inc=d/'starboard/webos/arm'
 for n in ['webos_firmware_aac.h','webos_aac_audio_decoder.h']:
  (inc/n).symlink_to(ROOT/'cobalt-platform/webos/arm'/n)
 put('test.cc',r'''
#include <cassert>
#include <cstdlib>
#include "starboard/webos/arm/webos_aac_audio_decoder.h"
using namespace starboard::shared::webos;
using starboard::shared::starboard::player::Run;
int mode=1,calls=0;
namespace starboard { namespace shared { namespace webos {
struct FirmwareAac::Impl {};
FirmwareAac::FirmwareAac(){if(mode)impl_.reset(new Impl);calls=0;}
FirmwareAac::~FirmwareAac()=default;bool FirmwareAac::valid()const{return !!impl_;}
bool FirmwareAac::Decode(const uint8_t*,int,int64_t pts,std::vector<FirmwareAudioFrame>* out){
 ++calls;if(mode==2)return false;if(mode==3)return true;if(mode==4 && calls==2)return false;
 out->push_back({2,48000,pts,{0.1f,0.2f}});return true;
}
bool FirmwareAac::Drain(std::vector<FirmwareAudioFrame>*){return true;}
}}}
int main(){
 for(int m:{0,1,2,3}){
  mode=m;WebOsAacAudioDecoder decoder;int consumed=0,errors=0;std::vector<int64_t> pts;
  decoder.Initialize([&]{int rate=0;auto a=decoder.Read(&rate);assert(a && rate==48000);if(a->size())pts.push_back(a->pts);},[&](int,const std::string&){++errors;});
  const int count=m==3?32:3;
  for(int i=0;i<count;++i){auto a=std::make_shared<WebOsAacAudioDecoder::InputBuffer>();a->pts=1000+i;decoder.Decode({a},[&]{++consumed;});Run();}
  assert(consumed==count && !errors && pts.size()==size_t(count));
  for(int i=0;i<count;++i)assert(pts[i]==1000+i);
  decoder.WriteEndOfStream();Run();
  decoder.Reset();auto a=std::make_shared<WebOsAacAudioDecoder::InputBuffer>();a->pts=9000000;
  decoder.Decode({a},[&]{++consumed;});decoder.Reset();Run();assert(consumed==count);
 }
 mode=4;WebOsAacAudioDecoder decoder;int errors=0,outputs=0;
 decoder.Initialize([&]{int r;decoder.Read(&r);++outputs;},[&](int,const std::string&){++errors;});
 auto a=std::make_shared<WebOsAacAudioDecoder::InputBuffer>();a->pts=0;
 decoder.Decode({a},[]{});Run();decoder.Decode({a},[]{});Run();assert(outputs==1 && errors==1);
 setenv("YTAF_AAC_DECODER","fdk",1);mode=1;WebOsAacAudioDecoder forced;int count=0;
 forced.Initialize([&]{int r;forced.Read(&r);++count;},[](int,const std::string&){assert(false);});
 forced.Decode({a},[]{});Run();assert(count==1 && calls==2);
}
''')
 subprocess.run([os.environ.get('CXX','c++'),'-std=c++14','-Wall','-Wextra','-Werror','-Wno-misleading-indentation','-fsanitize=undefined','-fno-sanitize-recover=all','-I'+str(d),str(d/'test.cc'),str(ROOT/'cobalt-platform/webos/arm/webos_aac_audio_decoder.cc'),'-o',str(d/'test')],check=True)
 subprocess.run([str(d/'test')],check=True)
print('AAC wrapper: firmware/default, unavailable/failed/buffered-startup fallback, timestamp replay, EOS, reset cancellation, late errors and forced FDK passed')
