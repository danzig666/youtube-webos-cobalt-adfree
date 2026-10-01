#include "webos_media_diagnostics.h"
#include <chrono>
#include <cstdio>
#include <limits>
#include <mutex>
namespace starboard {
namespace shared {
namespace webos {
namespace {
std::mutex mutex;
MediaEventRing ring;
uint64_t next_session = 0;
unsigned routine_lines = 0, error_lines = 0;
const char* EventName(MediaEventType event) {
  switch (event) {
    case MediaEventType::kVideoCapability: return "video_capability";
    case MediaEventType::kAudioCapability: return "audio_capability";
    case MediaEventType::kFactory: return "factory";
    case MediaEventType::kSelectedShared: return "selected_shared";
    case MediaEventType::kSelectedLegacy: return "selected_legacy";
    case MediaEventType::kFirstPacket: return "first_packet";
    case MediaEventType::kLoad: return "load";
    case MediaEventType::kLoadCompleted: return "load_completed";
    case MediaEventType::kFirstFeed: return "first_feed";
    case MediaEventType::kFirstFrame: return "first_frame";
    case MediaEventType::kSeek: return "seek";
    case MediaEventType::kResolutionChange: return "resolution_change";
    case MediaEventType::kInputEos: return "input_eos";
    case MediaEventType::kPushEos: return "push_eos";
    case MediaEventType::kNativeEos: return "native_eos";
    case MediaEventType::kUnload: return "unload";
    case MediaEventType::kRate: return "rate";
    case MediaEventType::kError: return "error";
    case MediaEventType::kLifecycle: return "lifecycle";
    case MediaEventType::kDiscontinuity: return "timestamp_discontinuity";
  }
  return "unknown";
}
const char* CodecName(MediaCodec codec) {
  switch (codec) {
    case MediaCodec::kH264: return "H264";
    case MediaCodec::kVp9: return "VP9";
    case MediaCodec::kAv1: return "AV1";
    case MediaCodec::kOpus: return "Opus";
    case MediaCodec::kAac: return "AAC";
    case MediaCodec::kVorbis: return "Vorbis";
    default: return "unknown";
  }
}
}  // namespace
const char* PlayerErrorName(WebOsPlayerError error) {
  switch (error) {
    case WebOsPlayerError::kNone: return "None";
    case WebOsPlayerError::kUnsupportedCodec: return "UnsupportedCodec";
    case WebOsPlayerError::kUnsupportedResolution: return "UnsupportedResolution";
    case WebOsPlayerError::kUnsupportedHdr: return "UnsupportedHdr";
    case WebOsPlayerError::kNativeLoadFailed: return "NativeLoadFailed";
    case WebOsPlayerError::kNativeFeedFailed: return "NativeFeedFailed";
    case WebOsPlayerError::kNativeBufferStall: return "NativeBufferStall";
    case WebOsPlayerError::kNativeSeekFailed: return "NativeSeekFailed";
    case WebOsPlayerError::kNativeRateFailed: return "NativeRateFailed";
    case WebOsPlayerError::kNativeUnloadTimeout: return "NativeUnloadTimeout";
    case WebOsPlayerError::kInvalidTimestamp: return "InvalidTimestamp";
    case WebOsPlayerError::kLifecycleFailure: return "LifecycleFailure";
  }
  return "Unknown";
}
std::string FormatMediaEvent(const MediaEvent& e) {
  char line[512];
  std::snprintf(line, sizeof(line),
      "[YTAF media] session=%llu generation=%llu monotonic_us=%lld event=%s type=%s codec=%s size=%dx%d bits=%u pts_us=%lld queue_packets=%llu queue_bytes=%llu requested_rate=%.6g applied_rate=%.6g accepted=%d error=%s\n",
      static_cast<unsigned long long>(e.session), static_cast<unsigned long long>(e.generation),
      static_cast<long long>(e.monotonic_us), EventName(e.event),
      e.stream == MediaStream::kAudio ? "audio" : e.stream == MediaStream::kVideo ? "video" : "none",
      CodecName(e.codec), e.width, e.height, e.bits, static_cast<long long>(e.pts_us),
      static_cast<unsigned long long>(e.queued_packets), static_cast<unsigned long long>(e.queued_bytes),
      e.requested_rate, e.applied_rate, e.accepted, PlayerErrorName(e.error));
  return line;
}
void MediaEventRing::Record(const MediaEvent& event) {
  events_[next_] = event;
  next_ = (next_ + 1) % kCapacity;
  if (count_ < kCapacity) ++count_;
}
const MediaEvent& MediaEventRing::at(size_t index) const {
  return events_[(next_ + kCapacity - count_ + index) % kCapacity];
}
std::string MediaEventRing::Report() const {
  std::string report;
  for (size_t i = 0; i < count_; ++i) report += FormatMediaEvent(at(i));
  return report;
}
uint64_t NextMediaSessionId() {
  std::lock_guard<std::mutex> guard(mutex);
  if (next_session == std::numeric_limits<uint64_t>::max()) return 0;
  return ++next_session;
}
void RecordMediaEvent(MediaEvent event) {
  if (event.monotonic_us == 0)
    event.monotonic_us = std::chrono::duration_cast<std::chrono::microseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count();
  std::lock_guard<std::mutex> guard(mutex);
  ring.Record(event); // Keep recent evidence after stderr's process budget ends.
  const bool essential = event.error != WebOsPlayerError::kNone ||
      event.event == MediaEventType::kUnload || event.event == MediaEventType::kNativeEos;
  unsigned& count = essential ? error_lines : routine_lines;
  if (count >= (essential ? 32u : 96u)) return;
  ++count;
  const auto line = FormatMediaEvent(event);
  std::fputs(line.c_str(), stderr);
}
std::string CopyMediaDiagnosticEvents() {
  std::lock_guard<std::mutex> guard(mutex);
  return ring.Report();
}
}  // namespace webos
}  // namespace shared
}  // namespace starboard
