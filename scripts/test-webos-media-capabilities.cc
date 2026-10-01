#include <cassert>
#include <cstdlib>
#include <iostream>
#include <limits>

#include "starboard/configuration_constants.h"
#include "webos_media_capabilities.h"

using namespace starboard::shared::webos;

int main() {
  const SbMediaColorMetadata color{};
  // Exhaustive boundary comparison against the pre-refactor dimension policy.
  for (const auto codec : {kSbMediaVideoCodecH264, kSbMediaVideoCodecVp9,
                          kSbMediaVideoCodecAv1, kSbMediaVideoCodecH265,
                          kSbMediaVideoCodecVp8, kSbMediaVideoCodecNone}) {
    for (int width : {-1, 0, 1920, 1921, 3840, 3841})
      for (int height : {-1, 0, 1080, 1081, 2160, 2161})
        for (int fps : {-1, 0, 30, 60, 61})
          for (int64_t bitrate : {int64_t(-1), int64_t(0),
              int64_t(kSbMediaMaxVideoBitrateInBitsPerSecond),
              int64_t(kSbMediaMaxVideoBitrateInBitsPerSecond) + 1,
              std::numeric_limits<int64_t>::max()}) {
            const bool avc = codec == kSbMediaVideoCodecH264;
            const bool uhd = codec == kSbMediaVideoCodecVp9 ||
                             codec == kSbMediaVideoCodecAv1;
            const bool expected = (avc || uhd) &&
                width <= (avc ? 1920 : 3840) &&
                height <= (avc ? 1080 : 2160) && fps <= 60 &&
                bitrate <= kSbMediaMaxVideoBitrateInBitsPerSecond;
            assert(WebOsIsVideoSupported(codec, width, height, bitrate, fps,
                                        color) == expected);
          }
  }
  std::cout << "webOS capability baseline boundary comparison passed\n";
}
