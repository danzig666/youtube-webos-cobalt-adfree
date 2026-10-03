#include "starfish_playback_rate.h"
#include <cmath>
#include <atomic>
#include <cstdlib>
#include <cstring>
#include <initializer_list>
namespace starboard {
namespace shared {
namespace webos {
namespace {
std::atomic<bool> user_playback_rates(false);
std::atomic<uint32_t> rate_reset_generation(0);
}
PlaybackRateSupport GetPlaybackRateSupport() {
  static const PlaybackRateSupport environment_support = [] {
    const char* value = std::getenv("YTAF_PLAYBACK_RATES");
    if (value && std::strcmp(value, "common") == 0)
      return PlaybackRateSupport::kCommonFractional;
    if (value && std::strcmp(value, "full-range") == 0)
      return PlaybackRateSupport::kFullRange;
    return PlaybackRateSupport::kOneXOnly;
  }();
  static const bool has_override = std::getenv("YTAF_PLAYBACK_RATES") != nullptr;
  if (has_override) return environment_support;
  return user_playback_rates.load() ? PlaybackRateSupport::kCommonFractional
                                   : PlaybackRateSupport::kOneXOnly;
}
bool EnableUserPlaybackRates() {
  user_playback_rates.store(true);
  return GetPlaybackRateSupport() != PlaybackRateSupport::kOneXOnly;
}
bool ResetUserPlaybackRate(bool paused) {
  // Pack pause intent and sequence into one atomic value, so the worker cannot
  // combine an old request with the pause state of a later request.
  uint32_t old = rate_reset_generation.load();
  while (!rate_reset_generation.compare_exchange_weak(
      old, ((old + 2) & ~uint32_t(1)) | uint32_t(paused))) {}
  return true;
}
uint32_t PlaybackRateResetGeneration() { return rate_reset_generation.load(); }
bool NormalizePlaybackRate(double rate, PlaybackRateSupport support,
                           double* normalized) {
  if (!normalized || !std::isfinite(rate) || rate < 0 || rate > 2) return false;
  if (rate == 0 || rate == 1) { *normalized = rate; return true; }
  if (support == PlaybackRateSupport::kOneXOnly) return false;
  if (support == PlaybackRateSupport::kCommonFractional) {
    for (double common : {0.5, 0.75, 1.25, 1.5, 1.75, 2.0}) {
      if (std::fabs(rate - common) <= 0.000001) {
        *normalized = common;
        return true;
      }
    }
    return false;
  }
  if (rate < 0.1) return false;
  // Explicit developer override only. Bound before converting/rounding.
  *normalized = std::round(rate * 1000000) / 1000000;
  return true;
}
bool StarfishPlaybackRate::Request(double rate, PlaybackRateSupport support) {
  double normalized;
  if (!NormalizePlaybackRate(rate, support, &normalized)) return false;
  if (normalized == requested_rate_) return true;
  if (rate_change_generation_ == std::numeric_limits<uint64_t>::max()) return false;
  ++rate_change_generation_;
  requested_rate_ = normalized;
  return true;
}
}  // namespace webos
}  // namespace shared
}  // namespace starboard
