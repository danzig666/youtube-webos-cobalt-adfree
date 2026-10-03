#ifndef STARBOARD_WEBOS_ARM_WEBOS_MEDIA_DIAGNOSTICS_H_
#define STARBOARD_WEBOS_ARM_WEBOS_MEDIA_DIAGNOSTICS_H_
#include <array>
#include <cstddef>
#include <cstdint>
#include <string>
namespace starboard {
namespace shared {
namespace webos {
enum class WebOsPlayerError {
  kNone, kUnsupportedCodec, kUnsupportedResolution, kUnsupportedHdr,
  kNativeLoadFailed, kNativeFeedFailed, kNativeBufferStall, kNativeSeekFailed,
  kNativeRateFailed, kNativeUnloadTimeout, kInvalidTimestamp, kLifecycleFailure,
  kMediaSourceAppendFailed, kMediaSourceConfigFailed,
};
enum class MediaEventType {
  kVideoCapability, kAudioCapability, kFactory, kSelectedShared, kSelectedLegacy,
  kFirstPacket, kLoad, kLoadCompleted, kFirstFeed, kFirstFrame, kSeek,
  kResolutionChange, kInputEos, kPushEos, kNativeEos, kUnload, kRate, kError,
  kLifecycle, kDiscontinuity, kSourceOpen, kSourceClosed, kSourceEnded,
  kAppend, kAppendComplete, kSourceAbort, kTimestampOffset, kSourceRemove,
  kAppendRejected, kSourceBufferRejected,
};
enum class MediaStream { kNone, kAudio, kVideo };
enum class MediaCodec { kUnknown, kH264, kVp9, kAv1, kOpus, kAac, kVorbis };
// No free-form input fields: URLs, headers, cookies and user/account identifiers
// cannot be copied into the ring or report. Firmware callback strings stay out.
struct MediaEvent {
  uint64_t session = 0, generation = 0;
  int64_t monotonic_us = 0;
  uint64_t source = 0, sequence = 0, input_bytes = 0;
  MediaEventType event = MediaEventType::kError;
  MediaStream stream = MediaStream::kNone;
  MediaCodec codec = MediaCodec::kUnknown;
  int width = 0, height = 0;
  unsigned bits = 0;
  int64_t pts_us = 0;
  uint64_t queued_packets = 0, queued_bytes = 0;
  double requested_rate = 1, applied_rate = 1;
  bool accepted = false;
  WebOsPlayerError error = WebOsPlayerError::kNone;
};
const char* PlayerErrorName(WebOsPlayerError error);
std::string FormatMediaEvent(const MediaEvent& event);
class MediaEventRing {
 public:
  static constexpr size_t kCapacity = 100;
  void Record(const MediaEvent& event);
  size_t size() const { return count_; }
  const MediaEvent& at(size_t index) const;
  std::string Report() const;
 private:
  std::array<MediaEvent, kCapacity> events_{};
  size_t next_ = 0, count_ = 0;
};
uint64_t NextMediaSessionId();
void RecordMediaEvent(MediaEvent event);
std::string CopyMediaDiagnosticEvents();
// A separate snapshot survives ring eviction; updates reject older generations.
struct MediaSnapshot {
  uint64_t session = 0, generation = 0;
  bool shared = false, active = false;
  MediaCodec video = MediaCodec::kUnknown, audio = MediaCodec::kUnknown;
  int width = 0, height = 0, sample_rate = 0, channels = 0;
  unsigned bits = 0;
  int hdr = 0; // 0 SDR, 1 HDR10, 2 HLG, 3 unknown.
  uint64_t audio_packets = 0, audio_bytes = 0, video_packets = 0, video_bytes = 0;
  double requested_rate = 1, applied_rate = 1;
  // Actual FRAMEREADY presentation; a requested seek target is not a frame.
  int64_t presentation_us = -1;
  uint64_t presented_frames = 0;
};
void UpdateMediaSnapshot(const MediaSnapshot& snapshot);
void UpdateMediaPresentation(uint64_t session, uint64_t generation,
                             int64_t presentation_us, uint64_t frames);
std::string CopyMediaSnapshotReport();
}  // namespace webos
}  // namespace shared
}  // namespace starboard
#endif
