#ifndef STARBOARD_WEBOS_ARM_WEBOS_SCROLL_INPUT_H_
#define STARBOARD_WEBOS_ARM_WEBOS_SCROLL_INPUT_H_
#include <cmath>
namespace starboard {
namespace shared {
namespace webos {
struct WebOsWheelDelta { float x; float y; };
inline WebOsWheelDelta ResolveWebOsWheelDelta(float x, float y, bool flipped) {
  if (!std::isfinite(x) || !std::isfinite(y)) return {0, 0};
  // SDL: positive Y means up; DOM/Starboard desktop wheel: positive Y is down.
  const float direction = flipped ? -1.0f : 1.0f;
  return {x * direction, -y * direction};
}
}  // namespace webos
}  // namespace shared
}  // namespace starboard
#endif  // STARBOARD_WEBOS_ARM_WEBOS_SCROLL_INPUT_H_
