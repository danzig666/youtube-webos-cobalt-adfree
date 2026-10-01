#include <cassert>
#include <iostream>
#include <limits>
#include "starfish_audio_session.h"
using starboard::shared::webos::AudioSessionPlan;

int main() {
  AudioSessionPlan plan;
  int64_t ns = -1;
  assert(plan.ToNativeNanoseconds(0, &ns) && ns == 0);
  plan.epoch_us = 6500;
  assert(plan.ToNativeNanoseconds(-6500, &ns) && ns == 0);
  assert(plan.ToNativeNanoseconds(0, &ns) && ns == 6500000);
  assert(!plan.ToNativeNanoseconds(-6501, &ns));
  assert(!plan.ToNativeNanoseconds(0, nullptr));
  const auto limit = std::numeric_limits<int64_t>::max() / 1000;
  assert(plan.ToNativeNanoseconds(limit - 6500, &ns));
  assert(ns == limit * 1000);
  assert(!plan.ToNativeNanoseconds(limit - 6499, &ns));
  assert(!plan.ToNativeNanoseconds(std::numeric_limits<int64_t>::min(), &ns));
  plan.epoch_us = -1;
  assert(!plan.ToNativeNanoseconds(0, &ns));
  plan.epoch_us = limit + 1;
  assert(!plan.ToNativeNanoseconds(0, &ns));
  std::cout << "Generic audio session epoch bounds passed\n";
}
