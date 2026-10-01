#include <cassert>
#include <cstdlib>
#include <iostream>
#include <limits>
#include "starboard/configuration_constants.h"
#include "webos_media_capabilities.h"
using namespace starboard::shared::webos;

SbMediaColorMetadata Color(unsigned bits = 8,
                          SbMediaTransferId transfer = kSbMediaTransferIdBt709) {
  SbMediaColorMetadata color{};
  color.bits_per_channel = bits;
  color.primaries = kSbMediaPrimaryIdBt709;
  color.transfer = transfer;
  color.matrix = kSbMediaMatrixIdBt709;
  return color;
}

int main() {
  assert(ParseVideoCapabilityTier(nullptr) == CapabilityTier::kSafe);
  for (const char* invalid : {"", "safe", "UHD", "uhd ", "uhd-hdr\n", "unknown"})
    assert(ParseVideoCapabilityTier(invalid) == CapabilityTier::kSafe);
  assert(ParseVideoCapabilityTier("uhd") == CapabilityTier::kKnownUhd);
  assert(ParseVideoCapabilityTier("uhd-hdr") == CapabilityTier::kKnownUhdHdr);
  for (const auto tier : {CapabilityTier::kSafe, CapabilityTier::kKnownUhd,
                          CapabilityTier::kKnownUhdHdr}) {
    const auto caps = MediaCapabilitiesForTier(tier);
    const bool uhd = tier != CapabilityTier::kSafe;
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
              const bool uhd_codec = codec == kSbMediaVideoCodecVp9 ||
                                     codec == kSbMediaVideoCodecAv1;
              const bool expected = (avc || (uhd && uhd_codec)) &&
                  width >= 0 && height >= 0 && fps >= 0 && bitrate >= 0 &&
                  width <= (avc ? 1920 : 3840) &&
                  height <= (avc ? 1080 : 2160) && fps <= 60 &&
                  bitrate <= kSbMediaMaxVideoBitrateInBitsPerSecond;
              assert(WebOsIsVideoSupported(caps, codec, width, height, bitrate,
                                          fps, Color()) == expected);
            }
      for (const auto transfer : {kSbMediaTransferIdSmpteSt2084,
                                   kSbMediaTransferIdAribStdB67}) {
        const bool hdr = tier == CapabilityTier::kKnownUhdHdr &&
            (codec == kSbMediaVideoCodecVp9 || codec == kSbMediaVideoCodecAv1);
        assert(WebOsIsVideoSupported(caps, codec, 0, 0, 0, 0,
                                    Color(10, transfer)) == hdr);
        assert(WebOsIsVideoSupported(caps, codec, 0, 0, 0, 0,
                                    Color(12, transfer)) == hdr);
        assert(!WebOsIsVideoSupported(caps, codec, 0, 0, 0, 0, Color(8, transfer)));
        assert(!WebOsIsVideoSupported(caps, codec, 0, 0, 0, 0, Color(16, transfer)));
      }
      assert(!WebOsIsVideoSupported(caps, codec, 0, 0, 0, 0, Color(0)));
      auto unknown = Color(10, kSbMediaTransferIdUnspecified);
      assert(!WebOsIsVideoSupported(caps, codec, 0, 0, 0, 0, unknown));
    }
  }
  assert(::setenv("YTAF_VIDEO_CAPS", "uhd", 1) == 0);
  assert(GetWebOsMediaCapabilities().tier == CapabilityTier::kKnownUhd);
  assert(::setenv("YTAF_VIDEO_CAPS", "uhd-hdr", 1) == 0);
  assert(GetWebOsMediaCapabilities().tier == CapabilityTier::kKnownUhd);
  assert(::unsetenv("YTAF_VIDEO_CAPS") == 0);
  std::cout << "webOS conservative capability profiles and process latch passed\n";
}
