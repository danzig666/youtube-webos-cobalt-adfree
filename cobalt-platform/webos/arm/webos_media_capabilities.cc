#include "webos_media_capabilities.h"

#include <cstdlib>
#include <cstring>

#include "starboard/configuration_constants.h"

namespace starboard {
namespace shared {
namespace webos {

CapabilityTier ParseVideoCapabilityTier(const char* value) {
  if (value && std::strcmp(value, "uhd") == 0) return CapabilityTier::kKnownUhd;
  if (value && std::strcmp(value, "uhd-hdr") == 0)
    return CapabilityTier::kKnownUhdHdr;
  // No reliable device probe has been established. Missing/invalid input is
  // safe; a version/model/library string alone never enables codecs or HDR.
  return CapabilityTier::kSafe;
}

const char* VideoCapabilityTierName(CapabilityTier tier) {
  switch (tier) {
    case CapabilityTier::kKnownUhd: return "uhd";
    case CapabilityTier::kKnownUhdHdr: return "uhd-hdr";
    default: return "safe";
  }
}

WebOsMediaCapabilities MediaCapabilitiesForTier(CapabilityTier tier) {
  const bool uhd = tier == CapabilityTier::kKnownUhd ||
                   tier == CapabilityTier::kKnownUhdHdr;
  const bool hdr = tier == CapabilityTier::kKnownUhdHdr;
  return {uhd ? tier : CapabilityTier::kSafe,
      {true, 1920, 1080, 60, false, false, 8},
      {uhd, uhd ? 3840 : 0, uhd ? 2160 : 0, uhd ? 60 : 0, hdr, hdr, hdr ? 12u : 8u},
      {uhd, uhd ? 3840 : 0, uhd ? 2160 : 0, uhd ? 60 : 0, hdr, hdr, hdr ? 12u : 8u}};
}

const WebOsMediaCapabilities& GetWebOsMediaCapabilities() {
  static const auto caps = MediaCapabilitiesForTier(
      ParseVideoCapabilityTier(std::getenv("YTAF_VIDEO_CAPS")));
  return caps;
}

const WebOsVideoCapability& VideoCapabilityForCodec(
    const WebOsMediaCapabilities& caps, SbMediaVideoCodec codec) {
  static const WebOsVideoCapability unsupported{};
  switch (codec) {
    case kSbMediaVideoCodecH264: return caps.h264;
    case kSbMediaVideoCodecVp9: return caps.vp9;
    case kSbMediaVideoCodecAv1: return caps.av1;
    default: return unsupported;
  }
}

bool WebOsIsVideoSupported(const WebOsMediaCapabilities& caps,
                          SbMediaVideoCodec codec, int width, int height,
                          int64_t bitrate, int fps,
                          const SbMediaColorMetadata& color) {
  const auto& video = VideoCapabilityForCodec(caps, codec);
  if (!video.supported || width < 0 || height < 0 || fps < 0 || bitrate < 0 ||
      width > video.max_width || height > video.max_height ||
      fps > video.max_fps || bitrate > kSbMediaMaxVideoBitrateInBitsPerSecond ||
      color.bits_per_channel > video.max_bit_depth) return false;
  // Match Cobalt's SDR definition. Zero dimensions/rate/bitrate are query
  // wildcards; unspecified color identifiers are explicit Starboard enums.
  const bool sdr = color.bits_per_channel == 8 &&
      (color.primaries == kSbMediaPrimaryIdBt709 ||
       color.primaries == kSbMediaPrimaryIdUnspecified ||
       color.primaries == kSbMediaPrimaryIdSmpte170M) &&
      (color.transfer == kSbMediaTransferIdBt709 ||
       color.transfer == kSbMediaTransferIdUnspecified ||
       color.transfer == kSbMediaTransferIdSmpte170M) &&
      (color.matrix == kSbMediaMatrixIdBt709 ||
       color.matrix == kSbMediaMatrixIdUnspecified ||
       color.matrix == kSbMediaMatrixIdSmpte170M);
  if (sdr) return true;
  if (color.bits_per_channel != 10 && color.bits_per_channel != 12) return false;
  return (color.transfer == kSbMediaTransferIdSmpteSt2084 && video.hdr10) ||
         (color.transfer == kSbMediaTransferIdAribStdB67 && video.hlg);
}

bool WebOsIsVideoSupported(SbMediaVideoCodec codec, int width, int height,
                          int64_t bitrate, int fps,
                          const SbMediaColorMetadata& color) {
  return WebOsIsVideoSupported(GetWebOsMediaCapabilities(), codec, width, height,
                              bitrate, fps, color);
}

}  // namespace webos
}  // namespace shared
}  // namespace starboard
