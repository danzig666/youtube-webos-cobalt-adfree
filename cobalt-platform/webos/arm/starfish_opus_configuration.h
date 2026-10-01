#ifndef STARBOARD_WEBOS_ARM_STARFISH_OPUS_CONFIGURATION_H_
#define STARBOARD_WEBOS_ARM_STARFISH_OPUS_CONFIGURATION_H_

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstring>
#include <limits>
#include "starfish_audio_session.h"

namespace starboard {
namespace shared {
namespace webos {
struct StarfishOpusConfig {
  std::array<uint8_t, 19> header{};

  unsigned pre_skip_samples() const {
    return header[10] | (static_cast<unsigned>(header[11]) << 8);
  }

  // Initial scope: version 1, mono/stereo mapping family 0, 48 kHz output.
  // OpusHead's input-rate hint need not equal the output sample rate.
  static bool Parse(const void* bytes, size_t size, unsigned channels,
                    unsigned output_rate, StarfishOpusConfig* result) {
    if (!bytes || !result || size != 19 || output_rate != 48000 ||
        channels < 1 || channels > 2) return false;
    const auto* data = static_cast<const uint8_t*>(bytes);
    if (std::memcmp(data, "OpusHead", 8) || data[8] != 1 ||
        data[9] != channels || data[18] != 0) return false;
    std::copy(data, data + size, result->header.begin());
    return true;
  }
};

struct StarfishOpusSessionPlan : AudioSessionPlan {
  StarfishOpusConfig config;
  unsigned discard_samples = 0;


};

// first_decoded_audio_us MUST describe the first decoded sample before discard,
// in the video's presentation timeline. It is NOT necessarily InputBuffer PTS:
// the bridge must resolve container codec delay first. Do not subtract OpusHead
// pre-skip twice. Both streams keep the same epoch, including after seeks.
// The caller supplies the actual first packets, never fixture-specific timing.
inline bool PlanStarfishOpusSession(
    const StarfishOpusConfig& config, int64_t first_decoded_audio_us,
    int64_t first_video_us, int64_t target_us, bool starts_at_stream_origin,
    StarfishOpusSessionPlan* result) {
  StarfishOpusConfig checked;
  if (!result || !StarfishOpusConfig::Parse(config.header.data(),
          config.header.size(), config.header[9], 48000, &checked)) return false;
  const int64_t limit = std::numeric_limits<int64_t>::max() / 1000;
  if (first_decoded_audio_us < -limit || first_decoded_audio_us > limit ||
      first_video_us < -limit || first_video_us > limit ||
      target_us < 0 || target_us > limit ||
      first_decoded_audio_us > target_us) return false;

  const int64_t gap_us = target_us - first_decoded_audio_us;
  // The fresh decoder's pre-skip field is only 16 bits. No wrapping and no
  // silent truncation of missing seek pre-roll. Near-origin seeks may use the
  // original beginning instead, but must still honor the original pre-skip.
  if (gap_us > 1365333 || (!starts_at_stream_origin && gap_us < 80000))
    return false;
  // Cobalt timestamps have microsecond precision; round to the nearest sample
  // instead of requiring every timestamp to represent an exact 48 kHz sample.
  const auto discard = static_cast<unsigned>((gap_us * 48 + 500) / 1000);
  if (discard > 65535 ||
      (starts_at_stream_origin && discard < checked.pre_skip_samples()))
    return false;

  StarfishOpusSessionPlan plan;
  plan.config = checked;
  plan.epoch_us = -std::min<int64_t>(0,
      std::min(first_decoded_audio_us, first_video_us));
  int64_t native_ns;
  if (!plan.ToNativeNanoseconds(target_us, &native_ns)) return false;
  plan.target_native_us = native_ns / 1000;
  if (!plan.ToNativeNanoseconds(first_video_us, &native_ns) ||
      !plan.ToNativeNanoseconds(first_decoded_audio_us, &native_ns)) return false;
  plan.discard_samples = discard;
  plan.config.header[10] = discard & 255;
  plan.config.header[11] = (discard >> 8) & 255;
  *result = plan;
  return true;
}

}  // namespace webos
}  // namespace shared
}  // namespace starboard
#endif
