#ifndef STARBOARD_WEBOS_ARM_WEBOS_MEDIA_DIAGNOSTICS_BRIDGE_H_
#define STARBOARD_WEBOS_ARM_WEBOS_MEDIA_DIAGNOSTICS_BRIDGE_H_
#include "starboard/media.h"
#include "webos_media_diagnostics.h"
namespace starboard {
namespace shared {
namespace webos {
inline MediaCodec DiagnosticVideoCodec(SbMediaVideoCodec codec) {
  switch (codec) {
    case kSbMediaVideoCodecH264: return MediaCodec::kH264;
    case kSbMediaVideoCodecVp9: return MediaCodec::kVp9;
    case kSbMediaVideoCodecAv1: return MediaCodec::kAv1;
    default: return MediaCodec::kUnknown;
  }
}
inline MediaCodec DiagnosticAudioCodec(SbMediaAudioCodec codec) {
  switch (codec) {
    case kSbMediaAudioCodecOpus: return MediaCodec::kOpus;
    case kSbMediaAudioCodecAac: return MediaCodec::kAac;
    case kSbMediaAudioCodecVorbis: return MediaCodec::kVorbis;
    default: return MediaCodec::kUnknown;
  }
}
}  // namespace webos
}  // namespace shared
}  // namespace starboard
#endif
