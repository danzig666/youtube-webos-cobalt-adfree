#include "starboard/webos/arm/webos_media_capabilities.h"

#include "starboard/configuration_constants.h"

namespace starboard {
namespace shared {
namespace webos {

const WebOsMediaCapabilities& GetWebOsMediaCapabilities() {
  static const WebOsMediaCapabilities caps = {
      {true, 1920, 1080, 60, false, false, 8},
      {true, 3840, 2160, 60, true, true, 12},
      {true, 3840, 2160, 60, true, true, 12}};
  return caps;
}

bool WebOsIsVideoSupported(SbMediaVideoCodec codec, int width, int height,
                          int64_t bitrate, int fps,
                          const SbMediaColorMetadata& /*color*/) {
  // Cobalt's existing color and decode-to-texture gates still run before this
  // call. Preserve all current query semantics, including zero/unconstrained
  // dimensions, until the separate conservative-profile change.
  const auto& caps = GetWebOsMediaCapabilities();
  const WebOsVideoCapability* video = nullptr;
  switch (codec) {
    case kSbMediaVideoCodecH264: video = &caps.h264; break;
    case kSbMediaVideoCodecVp9: video = &caps.vp9; break;
    case kSbMediaVideoCodecAv1: video = &caps.av1; break;
    default: return false;
  }
  return video->supported && width <= video->max_width &&
         height <= video->max_height && fps <= video->max_fps &&
         bitrate <= kSbMediaMaxVideoBitrateInBitsPerSecond;
}

}  // namespace webos
}  // namespace shared
}  // namespace starboard
