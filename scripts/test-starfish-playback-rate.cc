#include <cassert>
#include <iostream>
#include <limits>
#include <vector>
#include "starfish_playback_rate.h"
using namespace starboard::shared::webos;
int main() {
  double normalized = -1;
  for (const auto support : {PlaybackRateSupport::kOneXOnly,
                            PlaybackRateSupport::kCommonFractional,
                            PlaybackRateSupport::kFullRange}) {
    for (double invalid : {-1.0, 0.01, 2.01,
         std::numeric_limits<double>::infinity(),
         std::numeric_limits<double>::quiet_NaN()})
      assert(!NormalizePlaybackRate(invalid, support, &normalized));
    assert(NormalizePlaybackRate(0, support, &normalized) && normalized == 0);
    assert(NormalizePlaybackRate(1, support, &normalized) && normalized == 1);
    assert(!NormalizePlaybackRate(1, support, nullptr));
  }
  assert(!NormalizePlaybackRate(1.25, PlaybackRateSupport::kOneXOnly, &normalized));
  assert(!NormalizePlaybackRate(1.234, PlaybackRateSupport::kCommonFractional, &normalized));
  assert(NormalizePlaybackRate(1.2500001, PlaybackRateSupport::kCommonFractional, &normalized));
  assert(normalized == 1.25);
  assert(NormalizePlaybackRate(0.1, PlaybackRateSupport::kFullRange, &normalized));
  StarfishPlaybackRate state;
  std::vector<double> calls;
  const auto apply = [&](double rate) { calls.push_back(rate); return true; };
  using Result = StarfishPlaybackRate::ApplyResult;
  for (double rate : {0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0}) {
    assert(state.Request(rate, PlaybackRateSupport::kCommonFractional));
    assert(state.Apply(apply) == Result::kApplied);
    const auto generation = state.rate_change_generation();
    const auto count = calls.size();
    for (int i = 0; i < 100; ++i) {
      assert(state.Request(rate, PlaybackRateSupport::kCommonFractional));
      assert(state.Apply(apply) == Result::kUnchanged);
    }
    assert(state.rate_change_generation() == generation && calls.size() == count);
  }
  assert(state.Request(0, PlaybackRateSupport::kCommonFractional));
  assert(state.Apply(apply) == Result::kUnchanged);
  assert(state.applied_rate() == 2); // Pause retains the native rate.
  state.NativeReset();
  assert(state.Request(1.25, PlaybackRateSupport::kCommonFractional));
  calls.clear();
  assert(state.Apply([&](double rate) { calls.push_back(rate); return rate == 1; }) ==
         Result::kRecoveredOneX);
  assert((calls == std::vector<double>{1.25, 1}));
  assert(state.requested_rate() == 1 && state.applied_rate() == 1);
  assert(state.Apply(apply) == Result::kUnchanged);
  assert(state.Request(1.5, PlaybackRateSupport::kCommonFractional));
  assert(state.Apply([](double) { return false; }) == Result::kFailed);
  assert(state.applied_rate() == -1 && state.last_successful_rate() == 1);
  state.FrameProgress(1234567);
  assert(state.last_frame_progress() == 1234567);
  std::cout << "Starfish playback-rate normalization, idempotence and recovery passed\n";
}
