#ifndef STARBOARD_WEBOS_ARM_STARFISH_PLAYBACK_RATE_H_
#define STARBOARD_WEBOS_ARM_STARFISH_PLAYBACK_RATE_H_
#include <cstdint>
#include <limits>
namespace starboard {
namespace shared {
namespace webos {
enum class PlaybackRateSupport { kOneXOnly, kCommonFractional, kFullRange };
PlaybackRateSupport GetPlaybackRateSupport();
// Explicit UI requests enable the common rates for this process. Environment
// policy remains authoritative, including an invalid override failing closed.
bool EnableUserPlaybackRates();
bool NormalizePlaybackRate(double requested, PlaybackRateSupport support,
                           double* normalized);

// Serialized native-session state. Pause (0) never sends SetPlayRate(0).
class StarfishPlaybackRate {
 public:
  enum class ApplyResult { kUnchanged, kApplied, kRecoveredOneX, kFailed };
  bool Request(double rate, PlaybackRateSupport support);
  void NativeReset() { applied_rate_ = -1; }
  void FrameProgress(int64_t now) { last_frame_progress_ = now; }
  double requested_rate() const { return requested_rate_; }
  double applied_rate() const { return applied_rate_; }
  double last_successful_rate() const { return last_successful_rate_; }
  int64_t last_frame_progress() const { return last_frame_progress_; }
  uint64_t rate_change_generation() const { return rate_change_generation_; }

  template <typename ApplyRate>
  ApplyResult Apply(ApplyRate apply) {
    if (requested_rate_ == 0 || requested_rate_ == applied_rate_)
      return ApplyResult::kUnchanged;
    const double attempted = requested_rate_;
    if (apply(attempted)) {
      applied_rate_ = last_successful_rate_ = attempted;
      return ApplyResult::kApplied;
    }
    // A rejected call can partially alter firmware state. Confirm 1x even if
    // the last successful rate was already 1x. The caller must report failure.
    applied_rate_ = -1;
    if (attempted != 1 && apply(1)) {
      requested_rate_ = applied_rate_ = last_successful_rate_ = 1;
      return ApplyResult::kRecoveredOneX;
    }
    return ApplyResult::kFailed;
  }
 private:
  double requested_rate_ = 1;
  double applied_rate_ = 1;
  double last_successful_rate_ = 1;
  int64_t last_frame_progress_ = 0;
  uint64_t rate_change_generation_ = 0;
};
}  // namespace webos
}  // namespace shared
}  // namespace starboard
#endif
