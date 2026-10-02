#include <cassert>
#include <iostream>
#include <limits>
#include "webos_scroll_input.h"
using starboard::shared::webos::ResolveWebOsWheelDelta;
int main() {
  auto up = ResolveWebOsWheelDelta(0, 1, false);
  auto down = ResolveWebOsWheelDelta(0, -1, false);
  assert(up.y == -1 && down.y == 1);
  auto flipped = ResolveWebOsWheelDelta(2, -3, true);
  assert(flipped.x == -2 && flipped.y == -3);
  auto precise = ResolveWebOsWheelDelta(0.25f, -0.5f, false);
  assert(precise.x == 0.25f && precise.y == 0.5f);
  auto invalid = ResolveWebOsWheelDelta(0, std::numeric_limits<float>::quiet_NaN(), false);
  assert(invalid.x == 0 && invalid.y == 0);
  auto extremes = ResolveWebOsWheelDelta(0, -2147483648.0f, false);
  assert(extremes.y > 0);
  std::cout << "SDL wheel direction, fractional deltas and invalid input passed\n";
}
