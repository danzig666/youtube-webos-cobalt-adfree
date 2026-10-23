#!/usr/bin/env python3
"""Exercise real Cobalt error callbacks with logging disabled as in Gold.

Callback scheduling, locks and decoders are host fixtures. The patched methods
are extracted from the pinned Cobalt checkout, not reimplemented in the test.
"""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent.parent
cobalt = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location('method_helper', root / 'scripts/test-external-video-seek.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
pipeline = (cobalt / 'cobalt/media/base/sbplayer_pipeline.cc').read_text()
audio = (cobalt / 'starboard/shared/starboard/player/filter/adaptive_audio_decoder_internal.cc').read_text()
fdk = (cobalt / 'starboard/shared/libfdkaac/fdk_aac_audio_decoder.cc').read_text()
methods = '\n'.join([
    helper.method(pipeline, 'void SbPlayerPipeline::CallSeekCB('),
    helper.method(pipeline, 'void SbPlayerPipeline::CallErrorCB('),
    helper.method(pipeline, 'void SbPlayerPipeline::OnDemuxerStreamRead('),
    helper.method(audio, 'void AdaptiveAudioDecoder::Initialize('),
    helper.method(audio, 'void AdaptiveAudioDecoder::InitializeAudioDecoder('),
    helper.method(fdk, 'bool FdkAacAudioDecoder::ReadFromFdkDecoder('),
])
fixture = r'''
#include <cassert>
#include <cstdio>
#include <functional>
#include <iostream>
#include <memory>
#include <string>
#include <utility>
#include <vector>
#include "webos_media_diagnostics_bridge.h"
struct Check{explicit Check(bool value){assert(value);}template<class T>Check& operator<<(const T&){return *this;}};
#define DCHECK(value) (Check(bool(value)))
#define DCHECK_NE(a,b) assert((a)!=(b))
#define SB_DCHECK(value) assert(value)
#define SB_HAS(value) 0
#define FROM_HERE 0
using namespace starboard::shared::webos;
using PipelineStatus=int;
namespace media {constexpr int PIPELINE_OK=0;}
namespace base {
struct AutoLock{explicit AutoLock(int&) {}};
template<class... T>int BindOnce(T...){return 0;}
}
template<class T>using scoped_refptr=std::shared_ptr<T>;
struct Timestamp{int64_t value;int64_t InMicroseconds()const{return value;}int64_t ToSbTime()const{return value;}};
struct DecoderBuffer {
  int size=64;int64_t pts=12000000;bool eos=false;
  bool end_of_stream()const{return eos;}
  int data_size()const{return size;}
  Timestamp timestamp()const{return {pts};}
};
struct DemuxerStream {
  enum Type{AUDIO,VIDEO};enum Status{kOk=0,kAborted,kConfigChanged};
  int requests=0;void Read(int,int){++requests;}
};
struct TaskRunner{bool BelongsToCurrentThread()const{return true;}void PostTask(int,int){}};
struct Bridge {
  int writes=0;std::vector<scoped_refptr<DecoderBuffer>> written;
  void WriteBuffers(DemuxerStream::Type,const std::vector<scoped_refptr<DecoderBuffer>>& buffers){++writes;written=buffers;}
};
struct SeekCB {
  std::function<void(int,bool,const std::string&)> callback;
  bool is_null()const{return !callback;}
  void Run(int status,bool initial,const std::string& message){callback(status,initial,message);}
};
struct PipelineErrorCB {
  std::function<void(int,const std::string&)> callback;
  bool is_null()const{return !callback;}
};
void ResetAndRunIfNotNull(PipelineErrorCB* cb,int status,const std::string& message) {
  auto callback=std::move(cb->callback);
  if(callback) callback(status,message);
}
struct Statistics {
  int calls=0;
  void OnError(int,const std::string&){++calls;}
  void OnAudioAU(const scoped_refptr<DecoderBuffer>&){}
  void OnVideoAU(const scoped_refptr<DecoderBuffer>&){}
};
struct SbPlayerPipeline {
  int lock_=0;bool is_initial_preroll_=true;
  PipelineDiagnostics webos_pipeline_diagnostics_;
  SeekCB seek_cb_;PipelineErrorCB error_cb_;Statistics playback_statistics_;
  std::unique_ptr<TaskRunner> task_runner_{new TaskRunner};
  std::unique_ptr<Bridge> player_bridge_{new Bridge};
  DemuxerStream audio_,video_;DemuxerStream *audio_stream_=&audio_,*video_stream_=&video_;
  int64_t timestamp_of_last_written_audio_=0;bool reading_=true;
  bool GetReadInProgress(DemuxerStream::Type)const{return reading_;}
  void SetReadInProgress(DemuxerStream::Type,bool reading){reading_=reading;}
  void UpdateDecoderConfig(DemuxerStream*){}
  std::string AppendStatisticsString(const std::string& message){return message+" [statistics]";}
  void CallSeekCB(PipelineStatus,const std::string&);
  void CallErrorCB(PipelineStatus,const std::string&);
  void OnDemuxerStreamRead(DemuxerStream::Type,int,DemuxerStream::Status,const std::vector<scoped_refptr<DecoderBuffer>>&);
};
enum SbPlayerError{kSbPlayerErrorDecode=0};
struct AudioInfo{SbMediaAudioCodec codec=kSbMediaAudioCodecAac;};
using SbMediaAudioSampleInfo=AudioInfo;
using AudioErrorCB=std::function<void(SbPlayerError,const std::string&)>;
struct FakeDecoder {
  AudioErrorCB error;
  void Initialize(const std::function<void()>&,const AudioErrorCB& cb){error=cb;}
};
struct AdaptiveAudioDecoder {
  using OutputCB=std::function<void()>;using ErrorCB=AudioErrorCB;
  OutputCB output_cb_;ErrorCB error_cb_;
  bool stream_ended_=false,output_format_checked_=false,resampler_=false,channel_mixer_=false;
  int drm_system_=0;AudioInfo input_audio_sample_info_;
  std::unique_ptr<FakeDecoder> audio_decoder_;
  std::function<std::unique_ptr<FakeDecoder>(const AudioInfo&,int)> audio_decoder_creator_;
  bool BelongsToCurrentThread()const{return true;}
  void OnDecoderOutput(){}
  void Initialize(const OutputCB&,const ErrorCB&);
  void InitializeAudioDecoder(const AudioInfo&);
};
using INT_PCM=int16_t;using AAC_DECODER_ERROR=int;
constexpr int AAC_DEC_OK=0,AACDEC_FLUSH=1;
int fdk_result=0;
int aacDecoder_DecodeFrame(void*,INT_PCM*,int,int){return fdk_result;}
std::string FormatString(const char* format,int code){char text[128];std::snprintf(text,sizeof(text),format,code);return text;}
struct FdkAacAudioDecoder {
  enum DecodeMode{kDecodeModeFlush,kDecodeModeDoNotFlush};
  void* decoder_=nullptr;uint8_t output_buffer_[32]{};bool has_stream_info_=false;
  int audio_data_to_discard_in_bytes_=0,decoded_audio_size_in_bytes_=16,outputs=0;
  static constexpr int kMaxOutputBufferSizeInBytes=32;
  AudioErrorCB error_cb_;
  void TryToUpdateStreamInfo(){has_stream_info_=true;}
  void TryToOutputDecodedAudio(const uint8_t*,int){++outputs;}
  bool ReadFromFdkDecoder(DecodeMode);
};
REAL_METHODS
int main(){
  assert(CopyMediaFailureReport().find("none")!=std::string::npos);
  // A successful seek must remain successful, with no diagnostic failure.
  SbPlayerPipeline pipeline;int seeks=0,errors=0;std::string last_message;
  pipeline.seek_cb_.callback=[&](int status,bool initial,const std::string& message){
    assert(status==0&&initial);assert(message==" [statistics]");++seeks;
  };
  pipeline.CallSeekCB(0,"");
  assert(seeks==1&&!pipeline.is_initial_preroll_);
  assert(CopyMediaFailureReport().find("none")!=std::string::npos);
  auto packet=std::make_shared<DecoderBuffer>();
  pipeline.OnDemuxerStreamRead(DemuxerStream::AUDIO,1,DemuxerStream::kOk,{packet});
  assert(pipeline.player_bridge_->writes==1&&pipeline.player_bridge_->written[0]==packet);
  assert(pipeline.timestamp_of_last_written_audio_==packet->pts&&!pipeline.reading_);
  assert(CopyMediaDiagnosticEvents().find("event=demuxer_read type=audio")!=std::string::npos);
  assert(CopyMediaDiagnosticEvents().find("input_bytes=64 ")!=std::string::npos);
  packet->eos=true;
  pipeline.OnDemuxerStreamRead(DemuxerStream::VIDEO,1,DemuxerStream::kOk,{packet});
  assert(pipeline.player_bridge_->writes==2&&pipeline.player_bridge_->written[0]==packet);
  assert(CopyMediaDiagnosticEvents().find("event=demuxer_eos type=video")!=std::string::npos);
  pipeline.reading_=true;
  pipeline.OnDemuxerStreamRead(DemuxerStream::VIDEO,1,DemuxerStream::kAborted,{});
  assert(pipeline.player_bridge_->writes==2&&!pipeline.reading_);
  pipeline.OnDemuxerStreamRead(DemuxerStream::VIDEO,1,DemuxerStream::kConfigChanged,{});
  assert(pipeline.video_.requests==1&&pipeline.player_bridge_->writes==2);
  assert(CopyMediaFailureReport().find("none")!=std::string::npos);
  const std::string secret="https://signed.invalid/playback?token=private-cookie";
  pipeline.error_cb_.callback=[&](int status,const std::string& message){
    assert(status==2);last_message=message;++errors;
  };
  pipeline.CallErrorCB(2,secret);
  assert(errors==1&&pipeline.playback_statistics_.calls==1);
  assert(last_message==secret+" [statistics]");
  assert(CopyMediaFailureReport().find("event=pipeline_error")!=std::string::npos);
  assert(CopyMediaFailureReport().find("code=2 ")!=std::string::npos);
  const auto first_failure=CopyMediaFailureReport();
  pipeline.CallErrorCB(3,"duplicate callback after the first error");
  assert(errors==1&&CopyMediaFailureReport()==first_failure);
  // Initial player creation can fail through SeekCB instead of ErrorCB.
  pipeline.seek_cb_.callback=[&](int status,bool initial,const std::string& message){
    assert(status==15&&!initial);assert(message==secret+" [statistics]");++seeks;
  };
  pipeline.CallSeekCB(15,secret);
  assert(seeks==2&&CopyMediaFailureReport().find("code=15 ")!=std::string::npos);
  // The lazy audio decoder can fail before any video is sent to Starfish.
  AdaptiveAudioDecoder audio;
  audio.Initialize([]{},[&](SbPlayerError error,const std::string& message){
    assert(error==kSbPlayerErrorDecode);last_message=message;++errors;
  });
  audio.audio_decoder_creator_=[](const AudioInfo&,int){return std::unique_ptr<FakeDecoder>();};
  audio.InitializeAudioDecoder({kSbMediaAudioCodecAac});
  assert(errors==2&&last_message=="Decoder adapter cannot create decoder.");
  assert(CopyMediaFailureReport().find("error=AudioDecoderUnavailable")!=std::string::npos);
  assert(CopyMediaFailureReport().find("type=audio codec=AAC")!=std::string::npos);
  audio.audio_decoder_creator_=[](const AudioInfo&,int){return std::unique_ptr<FakeDecoder>(new FakeDecoder);};
  audio.InitializeAudioDecoder({kSbMediaAudioCodecAac});
  assert(audio.audio_decoder_);
  audio.audio_decoder_->error(kSbPlayerErrorDecode,secret);
  assert(errors==3&&last_message==secret);
  assert(CopyMediaFailureReport().find("error=AudioDecodeFailed")!=std::string::npos);
  FdkAacAudioDecoder fdk;fdk.error_cb_=audio.error_cb_;fdk_result=4098;
  assert(!fdk.ReadFromFdkDecoder(FdkAacAudioDecoder::kDecodeModeDoNotFlush));
  assert(errors==4&&last_message=="aacDecoder_DecodeFrame() failed with result 4098.");
  assert(fdk.outputs==0);
  assert(CopyMediaFailureReport().find("code=4098 decoder=FDK-AAC")!=std::string::npos);
  fdk_result=AAC_DEC_OK;
  assert(fdk.ReadFromFdkDecoder(FdkAacAudioDecoder::kDecodeModeDoNotFlush));
  assert(errors==4&&fdk.outputs==1);
  AudioErrorCB late_error;
  {
    AdaptiveAudioDecoder temporary;
    temporary.Initialize([]{},[&](SbPlayerError error,const std::string& message){
      assert(error==kSbPlayerErrorDecode);last_message=message;++errors;
    });
    temporary.audio_decoder_creator_=[](const AudioInfo&,int){return std::unique_ptr<FakeDecoder>(new FakeDecoder);};
    temporary.InitializeAudioDecoder({kSbMediaAudioCodecAac});
    late_error=temporary.audio_decoder_->error;
    temporary.input_audio_sample_info_.codec=kSbMediaAudioCodecOpus;
  }
  late_error(kSbPlayerErrorDecode,secret);
  assert(errors==5&&last_message==secret);
  const auto failures=CopyMediaFailureReport();
  assert(failures.substr(failures.rfind("[YTAF media]")).find("codec=AAC")!=std::string::npos);
  for(const auto& report:{CopyMediaFailureReport(),CopyMediaDiagnosticEvents()})
    for(const char* private_text:{"https:","signed.invalid","token","private-cookie","statistics"})
      assert(report.find(private_text)==std::string::npos);
  std::cout<<"Gold pipeline/seek/audio failures survive without changing callbacks or exposing messages\n";
}
'''
with tempfile.TemporaryDirectory(prefix='ytaf-pipeline-errors-') as temp:
    temp = Path(temp)
    (temp / 'starboard').mkdir()
    (temp / 'starboard/media.h').write_text('''#pragma once
enum SbMediaVideoCodec{kSbMediaVideoCodecH264,kSbMediaVideoCodecVp9,kSbMediaVideoCodecAv1};
enum SbMediaAudioCodec{kSbMediaAudioCodecOpus,kSbMediaAudioCodecAac,kSbMediaAudioCodecVorbis};
''')
    cpp, binary = temp / 'test.cc', temp / 'test'
    cpp.write_text(fixture.replace('REAL_METHODS', methods))
    subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++14', '-Wall', '-Wextra', '-Werror',
                    '-DSTARBOARD_WEBOS', '-DCOBALT_BUILD_TYPE_GOLD', '-pthread',
                    '-fsanitize=undefined', '-fno-sanitize-recover=all',
                    '-I'+str(temp), '-I'+str(root / 'cobalt-platform/webos/arm'), str(cpp),
                    str(root / 'cobalt-platform/webos/arm/webos_media_diagnostics.cc'),
                    '-o', str(binary)], check=True)
    result = subprocess.run([str(binary)], text=True, capture_output=True, check=True)
    assert 'pipeline_error' in result.stderr and 'audio_decoder_error' in result.stderr
    assert 'signed.invalid' not in result.stderr and 'private-cookie' not in result.stderr
    print(result.stdout.strip())
