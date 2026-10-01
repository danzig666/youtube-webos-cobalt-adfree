#ifndef STARBOARD_WEBOS_ARM_WEBOS_MEDIA_CAPABILITIES_H_
#define STARBOARD_WEBOS_ARM_WEBOS_MEDIA_CAPABILITIES_H_

#include <cstdint>
#include "starboard/media.h"

namespace starboard {
namespace shared {
namespace webos {

enum class CapabilityTier { kSafe, kKnownUhd, kKnownUhdHdr };
CapabilityTier ParseVideoCapabilityTier(const char* override_value);
const char* VideoCapabilityTierName(CapabilityTier tier);

struct WebOsVideoCapability {
  bool supported;
  int max_width;
  int max_height;
  int max_fps;
  bool hdr10;
  bool hlg;
  unsigned max_bit_depth;
};

struct WebOsMediaCapabilities {
  CapabilityTier tier;
  WebOsVideoCapability h264;
  WebOsVideoCapability vp9;
  WebOsVideoCapability av1;
};

WebOsMediaCapabilities MediaCapabilitiesForTier(CapabilityTier tier);
const WebOsVideoCapability& VideoCapabilityForCodec(
    const WebOsMediaCapabilities& caps, SbMediaVideoCodec codec);
const WebOsMediaCapabilities& GetWebOsMediaCapabilities();
bool WebOsIsVideoSupported(const WebOsMediaCapabilities& caps,
                          SbMediaVideoCodec codec, int width, int height,
                          int64_t bitrate, int fps,
                          const SbMediaColorMetadata& color);
bool WebOsIsVideoSupported(SbMediaVideoCodec codec, int width, int height,
                          int64_t bitrate, int fps,
                          const SbMediaColorMetadata& color);

}  // namespace webos
}  // namespace shared
}  // namespace starboard
#endif
