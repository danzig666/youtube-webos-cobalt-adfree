// The runner inserts the actual shared Owner::Step method, faking vendor boundaries.
#include <algorithm>
#include <atomic>
#include <cassert>
#include <cmath>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <memory>
#include <string>
#include <vector>
#include "starfish_playback_rate.h"
#include "webos_media_diagnostics.h"
using namespace starboard::shared::webos;
using SbTime=int64_t;
const int64_t kSecond=1000000;
SbTime clock_now=kSecond;
SbTime SbTimeGetMonotonicNow(){return clock_now;}
std::string FormatString(const char* format,...) {
 char out[1024];va_list args;va_start(args,format);
 std::vsnprintf(out,sizeof(out),format,args);va_end(args);return out;
}
using Stream=MediaStream;
namespace filter {struct VideoFrame {};}
template<class T>using scoped_refptr=std::shared_ptr<T>;
struct Mutex {};
struct Guard {explicit Guard(Mutex&) {}};
struct ApplicationSdl {
 static ApplicationSdl* Get(){static ApplicationSdl app;return &app;}
 void SetVideoPaused(bool){}
 template<class... Args>void HandleFrame(Args...){}
};
struct Api {
 std::vector<double> rates;int plays=0,pauses=0;bool reject=false;
 bool SetPlayRate(const char* payload) {
  double rate=0;assert(std::sscanf(payload,"{\"playRate\":%lf",&rate)==1);rates.push_back(rate);
  return !reject || rate==1;
 }
 bool Play(){plays++;return true;}
 bool Pause(){pauses++;return true;}
 bool setVolume(const char*){return true;}
 bool setHdrInfo(const char*){return true;}
 bool pushEOS(){return true;}
};
struct NativeSession {
 uint64_t generation=1;bool force_one_x=false;
 std::atomic<bool> failed{false},loaded{false},ended{false};
 std::atomic<int> error_type{0};std::atomic<int64_t> error_value{0},frame_ns{-1};
 bool audio_fed=false,video_fed=false,playing=false,was_loaded=false,hdr_auto_logged=false;
 double volume=1;std::string applied_hdr_payload;
 SbTime last_play_attempt=0,last_progress=kSecond,last_frame=-1;
 StarfishPlaybackRate playback_rate;
 struct {SbTime epoch_us=0;} plan;
 Api api_object;Api* api=&api_object;
};
struct State {
 uint64_t generation() const{return 1;}
 bool ended() const{return false;}
 bool ReadyToSubmitEos() const{return false;}
 void EosSubmitted(uint64_t){}
 bool NativeEnded(uint64_t){return true;}
};
namespace starboard {namespace shared {namespace webos {void RecordMediaEvent(MediaEvent){}}}}
struct Owner {
 Mutex mutex_;State state_;
 bool paused_=false,video_hdr_=false,ready_=false,playing_=false,have_frame_=false,bounds_dirty_=false;
 double rate_=1,volume_=1,diagnostic_applied_rate_=0;
 std::string hdr_payload_,error;
 uint64_t session_id_=9,diagnostic_presented_frames_=0;
 uint32_t rate_reset_generation_=PlaybackRateResetGeneration();
 SbTime current_=0,frame_time_=0,diagnostic_presentation_us_=-1;
 int z_=0,x_=0,y_=0,bounds_width_=0,bounds_height_=0,player_=0;
 void Step(NativeSession& session);
 void Feed(NativeSession& s,Stream stream){if(stream==Stream::kAudio)s.audio_fed=true;else s.video_fed=true;}
 bool Current(uint64_t g){return g==1;}
 void FailSession(NativeSession&,const std::string& text,WebOsPlayerError=WebOsPlayerError::kNone){error=text;}
 void FailLocked(const std::string& text){error=text;}
 void PublishSnapshotLocked(){}
 template<class... Args>void Record(Args...){}
 template<class... Args>void Trace(Args...){}
 template<class... Args>void TraceEssential(Args...){}
};
// INSERT_REAL_STEP
int main(){
 assert(EnableUserPlaybackRates());
 Owner owner;NativeSession session;owner.rate_=1.5;session.loaded=true;
 owner.Step(session);
 assert(session.api->plays==1 && session.api->rates.empty()); // Play ack alone is insufficient.
 session.frame_ns=0;clock_now+=10000;owner.Step(session);
 assert(session.api->rates.empty()); // First frame observed, apply on next iteration.
 clock_now+=10000;owner.Step(session);
 assert((session.api->rates==std::vector<double>{1.5}));
 for(int i=0;i<100;i++){clock_now+=10000;owner.Step(session);}
 assert(session.api->rates.size()==1); // No repeated firmware reconfiguration.
 owner.rate_=0;owner.paused_=true; // Buffering/preroll is not user pause.
 ResetUserPlaybackRate(false);clock_now+=10000;owner.Step(session);
 assert(owner.rate_==1 && session.api->rates.back()==1 && session.api->plays==2);
 assert(owner.error.empty()); // Forced reset works with no new frames/buffering.
 owner.paused_=true;owner.rate_=0;ResetUserPlaybackRate(true);clock_now+=10000;owner.Step(session);
 assert(owner.rate_==0 && session.api->rates.back()==1 && session.api->plays==2);
 assert(session.api->pauses==1 && owner.error.empty()); // Reset preserves explicit pause.
 Owner delayed;NativeSession loading;delayed.rate_=2;
 ResetUserPlaybackRate(false);delayed.Step(loading);assert(loading.force_one_x && loading.api->rates.empty());
 loading.loaded=true;delayed.Step(loading);assert((loading.api->rates==std::vector<double>{1}));
 Owner rejected;NativeSession active;rejected.rate_=.5;active.loaded=true;active.playing=true;active.last_frame=0;active.api->reject=true;
 rejected.Step(active);assert(rejected.rate_==1 && rejected.error.empty());
 assert((active.api->rates==std::vector<double>{.5,1}));
}
