#ifndef STARBOARD_WEBOS_ARM_STARFISH_AUDIO_SESSION_H_
#define STARBOARD_WEBOS_ARM_STARFISH_AUDIO_SESSION_H_
#include <cstdint>
#include <limits>
namespace starboard {
namespace shared {
namespace webos {
// Only proven codec implementations belong in this enum.
enum class StarfishAudioCodec { kOpus };
// Both streams share a presentation epoch and target, independent of codec.
struct AudioSessionPlan {
  int64_t epoch_us = 0;
  int64_t target_native_us = 0;
  bool ToNativeNanoseconds(int64_t presentation_us, int64_t* native_ns) const {
    // Feed uses nanoseconds. Bound before adding/multiplying, including a
    // packet from before the session's chosen epoch (which must be rejected).
    const int64_t limit = std::numeric_limits<int64_t>::max() / 1000;
    if (!native_ns || epoch_us < 0 || epoch_us > limit ||
        presentation_us < -epoch_us || presentation_us > limit - epoch_us)
      return false;
    *native_ns = (presentation_us + epoch_us) * 1000;
    return true;
  }
};
}  // namespace webos
}  // namespace shared
}  // namespace starboard
#endif
