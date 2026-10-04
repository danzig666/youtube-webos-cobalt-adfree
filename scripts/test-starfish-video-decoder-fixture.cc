// Fake only external boundaries; the runner injects actual production methods.
#include <algorithm>
#include <atomic>
#include <cassert>
#include <cmath>
#include <cstdarg>
#include <cstdint>
#include <cstdlib>
#include <cstdio>
#include <functional>
#include <inttypes.h>
#include <iostream>
#include <limits>
#include <memory>
#include <sstream>
#include <string>
#include <thread>
#include <vector>
#include "starfish_playback_rate.h"
#include "webos_build_metadata.h"
#include "webos_media_diagnostics.h"
using namespace starboard::shared::webos;
using SbTime = int64_t;
constexpr int kSbTimeMillisecond = 1000, kSbTimeSecond = 1000000;
constexpr int kSbMediaTransferIdSmpteSt2084 = 16, kSbMediaTransferIdAribStdB67 = 18;
constexpr int kNeedMoreInput = 1, kBufferFull = 2;
enum { PF_EVENT_TYPE_STR_STATE_UPDATE__UNLOADCOMPLETED, PF_EVENT_TYPE_FRAMEREADY,
  PF_EVENT_TYPE_STR_STATE_UPDATE__LOADCOMPLETED, PF_EVENT_TYPE_INT_NEED_DATA,
  PF_EVENT_TYPE_STR_STATE_UPDATE__ENDOFSTREAM, PF_EVENT_TYPE_INT_ERROR, PF_EVENT_TYPE_STR_ERROR };
#define SB_DCHECK(value) assert(value)
#define SB_LOG(level) std::ostringstream()
template<class T> using scoped_refptr = std::shared_ptr<T>;
struct SbMediaColorMetadata { unsigned bits_per_channel = 8; int transfer = 1; };
struct SbMediaVideoSampleInfo {
  int frame_width = 1920, frame_height = 1080;
  SbMediaColorMetadata color_metadata;
  const char* max_video_capabilities = nullptr;
};
struct InputBuffer {
  SbMediaVideoSampleInfo info;
  SbTime pts = 0;
  const SbMediaVideoSampleInfo& video_sample_info() const { return info; }
  SbTime timestamp() const { return pts; }
  const void* data() const { return this; }
  int size() const { return 10; }
};
struct VideoFrame {
  bool eos = false;
  explicit VideoFrame(SbTime = 0) {}
  static scoped_refptr<VideoFrame> CreateEOSFrame() {
    auto frame = std::make_shared<VideoFrame>(); frame->eos = true; return frame;
  }
};
struct Thread { bool BelongsToCurrentThread() const { return true; }
  template<class F> void Schedule(F, int = 0) {}
  template<class F> void ScheduleAndWait(F job) { job(); } };
struct ApplicationSdl {
  static ApplicationSdl* Get() { static ApplicationSdl app; return &app; }
  void SetVideoResolution(int, int) {}
  void ConfigureFullscreenVideo() {}
  const std::string& GetExportedWindowId() const { static const std::string id = "window"; return id; }
};
struct Api {
  int feeds = 0, rates = 0, plays = 0;
  bool loaded = false, reject_rate = false, flush_ok = true, push_eos_ok = true;
  std::function<void()> on_eos;
  bool pushEOS() { if (on_eos) on_eos(); return push_eos_ok; }
  void notifyForeground() {}
  template<class F> bool Load(const char* payload, F, void*) {
    assert(std::string(payload).find(std::string("\"appId\":\"") + YTAF_APP_ID + "\"") != std::string::npos);
    return true;
  }
  std::string Feed(const char*) { ++feeds; return "Ok"; }
  bool Play() { ++plays; return true; }
  bool Pause() { return true; }
  bool Stop() { return true; }
  bool Unload() { return true; }
  bool flush() { return flush_ok; }
  bool setTimeToDecode(const char*) { return true; }
  bool SetPlayRate(const char*) { ++rates; return loaded && !reject_rate; }
};
using StarfishMediaAPIs = Api;
struct Mutex { void Acquire() {} void Release() {} };
struct Condition { bool WaitTimed(int) { return true; } };
struct AdaptiveVideoCapabilities { int width = 1920, height = 1080, frame_rate = 60; };
using SbMediaVideoCodec = int;
struct Caps { int max_width = 1920, max_height = 1080; };
int GetWebOsMediaCapabilities() { return 0; }
Caps VideoCapabilityForCodec(int, int) { return {}; }
namespace starboard { namespace shared { namespace starboard { namespace media {
class MimeType {
 public:
  explicit MimeType(const std::string& text) : text_(text) {}
  bool is_valid() const { return true; }
  int GetParamIntValue(const char*, int fallback) const { return fallback; }
  float GetParamFloatValue(const char*, int) const { return std::stof(text_.substr(text_.find('=') + 1)); }
 private:
  std::string text_;
};
}}}}
AdaptiveVideoCapabilities GetAdaptiveVideoCapabilities(int, const SbMediaVideoSampleInfo&);
const char* CodecName(int) { return "H264"; }
MediaCodec DiagnosticVideoCodec(int) { return MediaCodec::kH264; }
bool WebOsIsVideoSupported(int, int w, int h, int, int, const SbMediaColorMetadata& color) {
  return w <= 1920 && h <= 1080 && color.bits_per_channel == 8;
}
std::string FormatString(const char* format, ...) {
  char buffer[4096]; va_list args; va_start(args, format);
  std::vsnprintf(buffer, sizeof(buffer), format, args); va_end(args); return buffer;
}
namespace starboard { namespace shared { namespace webos {
void RecordMediaEvent(MediaEvent) {}
void UpdateMediaPresentation(uint64_t, uint64_t, int64_t, uint64_t) {}
}}}
struct StarfishVideoDecoder {
  INITIALIZE_RESULT InitializePipeline(const SbMediaVideoSampleInfo&);
  void FeedBuffer(const scoped_refptr<InputBuffer>&);
  void ApplyPlaybackStateOnDecoderThread();
  void EnsurePlayingOnDecoderThread(const char*, bool);
  void OnLoadCompletedOnDecoderThread();
  void HandlePlayerEvent(int, int64_t, const char*);
  void WriteEndOfStreamOnDecoderThread();
  void SignalUnloadCompleted() {}
  void Reset();
  void ResetOnDecoderThread();
  bool BelongsToCurrentThread() const { return true; }
  void CancelPendingJobs() {}
  void ApplyHdrInfo(const SbMediaColorMetadata&) {}
  void PublishSnapshotOnDecoderThread() const {}
  void RecordDiagnostic(MediaEventType, SbTime = 0, WebOsPlayerError = WebOsPlayerError::kNone, bool = true) const {}
  void ReportError(const std::string&) { ++errors; }
  static void PlayerCallback(int, int64_t, const char*, void*) {}
  void RetryPendingBuffer() {}
  template<class F> void Schedule(F job) { job(); }
  Thread thread; Thread* decoder_thread_ = &thread;
  std::unique_ptr<Api> media_api_{new Api};
  Api& api = *media_api_;
  Mutex pipeline_state_mutex_; Condition pipeline_state_condition_;
  bool stream_ended_ = false;
  std::atomic<bool> eos_output_{false};
  std::atomic<bool> first_frame_presented_{false}, reset_in_progress_{false}, unload_completed_{false};
  std::string last_hdr_payload_;
  int codec_ = 1, errors = 0, video_width_ = 0, video_height_ = 0;
  uint64_t diagnostic_session_id_ = 1;
  std::atomic<unsigned> diagnostic_generation_{1};
  unsigned diagnostic_bits_ = 0;
  int diagnostic_hdr_ = 0;
  bool pipeline_loaded_ = false, play_issued_ = false, pause_issued_ = false;
  bool startup_play_accepted_ = false, rate_failed_ = false;
  bool first_input_logged_ = false, first_feed_logged_ = false;
  std::atomic<bool> shutting_down_{false}, pause_requested_{false}, preroll_frame_sent_{false}, load_completed_{false};
  std::atomic<SbTime> diagnostic_presentation_us_{-1};
  std::atomic<uint32_t> diagnostic_presented_frames_{0};
  std::atomic<SbTime> seek_to_time_{0};
  std::atomic<int> playback_rate_millionths_{1000000};
  StarfishPlaybackRate playback_rate_state_;
  scoped_refptr<InputBuffer> pending_buffer_;
  std::function<void(int, scoped_refptr<VideoFrame>)> decoder_status_cb_ = [](int, scoped_refptr<VideoFrame>) {};
};
// INSERT_REAL_METHODS
int main(int argc, char** argv) {
  assert(argc == 2);
  const std::string scenario = argv[1];
  StarfishVideoDecoder decoder;
  auto packet = std::make_shared<InputBuffer>();
  if (scenario == "configuration") {
    decoder.api.loaded = true;
    decoder.FeedBuffer(packet);
    assert(decoder.api.feeds == 1);
    packet->info.frame_width = 3840;
    decoder.FeedBuffer(packet);
    assert(decoder.errors == 1 && decoder.api.feeds == 1);
    packet->info.frame_width = 1920; packet->info.color_metadata.bits_per_channel = 10;
    decoder.FeedBuffer(packet);
    assert(decoder.errors == 2 && decoder.api.feeds == 1);
  } else if (scenario == "timestamp") {
    decoder.api.loaded = true;
    for (SbTime pts : {SbTime(-1), std::numeric_limits<SbTime>::max()}) {
      packet->pts = pts;
      decoder.FeedBuffer(packet);
    }
    assert(decoder.errors == 2 && decoder.api.feeds == 0);
  } else if (scenario == "rate_startup") {
    decoder.FeedBuffer(packet); // Load accepted, completion deferred; rate API rejects early calls.
    assert(decoder.api.feeds == 1 && decoder.api.plays > 0);
    assert(decoder.errors == 0 && decoder.api.rates == 0);
    decoder.api.loaded = true; decoder.load_completed_.store(true);
    decoder.OnLoadCompletedOnDecoderThread();
    assert(decoder.errors == 0 && decoder.api.rates == 1);
    decoder.ApplyPlaybackStateOnDecoderThread();
    assert(decoder.api.rates == 1);
    decoder.playback_rate_state_.NativeReset(); // Retained flush is still loaded.
    decoder.ApplyPlaybackStateOnDecoderThread();
    assert(decoder.errors == 0 && decoder.api.rates == 2);
    decoder.playback_rate_state_.NativeReset(); decoder.api.reject_rate = true;
    decoder.ApplyPlaybackStateOnDecoderThread();
    assert(decoder.errors == 1 && decoder.rate_failed_);
  } else if (scenario == "seek") {
    decoder.FeedBuffer(packet);
    decoder.api.loaded = true; decoder.load_completed_.store(true);
    decoder.OnLoadCompletedOnDecoderThread();
    decoder.seek_to_time_.store(1000000);
    decoder.Reset();
    assert(decoder.load_completed_.load()); // flush keeps the loaded native pipeline.
    decoder.ApplyPlaybackStateOnDecoderThread();
    assert(decoder.errors == 0 && decoder.api.rates == 2);
    decoder.seek_to_time_.store(std::numeric_limits<SbTime>::max());
    decoder.Reset();
    assert(decoder.errors == 1 && !decoder.reset_in_progress_.load());
    decoder.seek_to_time_.store(0); decoder.api.flush_ok = false;
    decoder.Reset();
    assert(!decoder.pipeline_loaded_ && !decoder.load_completed_.load());
    StarfishVideoDecoder fresh;
    fresh.seek_to_time_.store(std::numeric_limits<SbTime>::max());
    fresh.FeedBuffer(packet);
    assert(fresh.errors == 1 && fresh.api.feeds == 0);
  } else if (scenario == "frame_rate") {
    packet->info.max_video_capabilities = "video/webm; framerate=1e30";
    assert(GetAdaptiveVideoCapabilities(1, packet->info).frame_rate == 60);
  } else if (scenario == "eos") {
    std::atomic<int> outputs{0};
    decoder.decoder_status_cb_ = [&](int, scoped_refptr<VideoFrame> frame) {
      if (frame && frame->eos) ++outputs;
    };
    decoder.pipeline_loaded_ = true;
    decoder.api.push_eos_ok = false;
    decoder.api.on_eos = [&] {
      decoder.HandlePlayerEvent(PF_EVENT_TYPE_STR_STATE_UPDATE__ENDOFSTREAM, 0, nullptr);
    };
    // A callback can arrive before the native call returns failure. Both paths
    // must agree that EOS has already been delivered.
    decoder.WriteEndOfStreamOnDecoderThread();
    assert(outputs == 1);
    decoder.Reset();
    outputs = 0;
    std::vector<std::thread> callbacks;
    for (int i = 0; i < 16; ++i) callbacks.emplace_back([&] {
      decoder.HandlePlayerEvent(PF_EVENT_TYPE_STR_STATE_UPDATE__ENDOFSTREAM, 0, nullptr);
    });
    for (auto& callback : callbacks) callback.join();
    assert(outputs == 1);
  } else { return 2; }
}
