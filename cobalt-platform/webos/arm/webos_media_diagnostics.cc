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
MediaSnapshot snapshot;
uint64_t next_session = 0;
unsigned routine_lines = 0, error_lines = 0;
unsigned capability_lines = 0;
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
    case MediaEventType::kSourceOpen: return "mse_source_open";
    case MediaEventType::kSourceClosed: return "mse_source_closed";
    case MediaEventType::kSourceEnded: return "mse_source_ended";
    case MediaEventType::kAppend: return "mse_append";
    case MediaEventType::kAppendComplete: return "mse_append_complete";
    case MediaEventType::kSourceAbort: return "mse_abort";
    case MediaEventType::kTimestampOffset: return "mse_timestamp_offset";
    case MediaEventType::kSourceRemove: return "mse_remove";
    case MediaEventType::kAppendRejected: return "mse_append_rejected";
    case MediaEventType::kSourceBufferRejected: return "mse_source_buffer_rejected";
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
    case WebOsPlayerError::kMediaSourceAppendFailed: return "MediaSourceAppendFailed";
    case WebOsPlayerError::kMediaSourceConfigFailed: return "MediaSourceConfigFailed";
  }
  return "Unknown";
}
std::string FormatMediaEvent(const MediaEvent& e) {
  char line[512];
  const int length = std::snprintf(line, sizeof(line),
      "[YTAF media] session=%llu generation=%llu source=%llu sequence=%llu input_bytes=%llu monotonic_us=%lld event=%s type=%s codec=%s size=%dx%d bits=%u pts_us=%lld queue_packets=%llu queue_bytes=%llu requested_rate=%.6g applied_rate=%.6g accepted=%d error=%s\n",
      static_cast<unsigned long long>(e.session), static_cast<unsigned long long>(e.generation),
      static_cast<unsigned long long>(e.source), static_cast<unsigned long long>(e.sequence), static_cast<unsigned long long>(e.input_bytes),
      static_cast<long long>(e.monotonic_us), EventName(e.event),
      e.stream == MediaStream::kAudio ? "audio" : e.stream == MediaStream::kVideo ? "video" : "none",
      CodecName(e.codec), e.width, e.height, e.bits, static_cast<long long>(e.pts_us),
      static_cast<unsigned long long>(e.queued_packets), static_cast<unsigned long long>(e.queued_bytes),
      e.requested_rate, e.applied_rate, e.accepted, PlayerErrorName(e.error));
  if (length >= static_cast<int>(sizeof(line))) line[sizeof(line) - 2] = '\n';
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
  if (event.session > 0 && event.session == snapshot.session &&
      event.generation >= snapshot.generation &&
      (event.event == MediaEventType::kUnload || event.event == MediaEventType::kNativeEos))
    snapshot.active = false;
  ring.Record(event); // Keep recent evidence after stderr's process budget ends.
  if (event.event == MediaEventType::kVideoCapability ||
      event.event == MediaEventType::kAudioCapability) {
    // YouTube may query capabilities repeatedly before creating a player.
    // Preserve at least 80 routine lines for actual playback boundaries.
    if (capability_lines >= 16) return;
    ++capability_lines;
  }
  const bool essential = event.error != WebOsPlayerError::kNone ||
      event.event == MediaEventType::kUnload || event.event == MediaEventType::kNativeEos;
  unsigned& count = essential ? error_lines : routine_lines;
  if (count >= (essential ? 32u : 96u)) return;
  ++count;
  const auto line = FormatMediaEvent(event);
  std::fputs(line.c_str(), stderr);
}
void UpdateMediaSnapshot(const MediaSnapshot& next) {
  std::lock_guard<std::mutex> guard(mutex);
  if (next.session < snapshot.session ||
      (next.session == snapshot.session && next.generation < snapshot.generation)) return;
  snapshot = next;
}
std::string CopyMediaSnapshotReport() {
  std::lock_guard<std::mutex> guard(mutex);
  char text[1024];
  std::snprintf(text, sizeof(text),
      "Current player: %s%s\nSession: %llu generation: %llu\nVideo: %s %dx%d %u-bit %s\nAudio: %s %d Hz %d channels\nPlayback rate: requested %.6gx applied %.6gx\nVideo queue: %llu packets / %llu bytes\nAudio queue: %llu packets / %llu bytes\n",
      snapshot.session == 0 ? "unavailable" : snapshot.shared ? "Shared Starfish" : "Legacy Starfish",
      snapshot.session && !snapshot.active ? " (inactive)" : "",
      static_cast<unsigned long long>(snapshot.session), static_cast<unsigned long long>(snapshot.generation),
      CodecName(snapshot.video), snapshot.width, snapshot.height, snapshot.bits,
      snapshot.hdr == 0 ? "SDR" : snapshot.hdr == 1 ? "HDR10" : snapshot.hdr == 2 ? "HLG" : "unknown HDR",
      CodecName(snapshot.audio), snapshot.sample_rate, snapshot.channels,
      snapshot.requested_rate, snapshot.applied_rate,
      static_cast<unsigned long long>(snapshot.video_packets), static_cast<unsigned long long>(snapshot.video_bytes),
      static_cast<unsigned long long>(snapshot.audio_packets), static_cast<unsigned long long>(snapshot.audio_bytes));
  return text;
}
std::string CopyMediaDiagnosticEvents() {
  std::lock_guard<std::mutex> guard(mutex);
  return ring.Report();
}
}  // namespace webos
}  // namespace shared
}  // namespace starboard
