#ifndef STARBOARD_WEBOS_ARM_WEBOS_LIFECYCLE_H_
#define STARBOARD_WEBOS_ARM_WEBOS_LIFECYCLE_H_
namespace starboard {
namespace shared {
namespace webos {
enum class WebOsLifecycleState {
  kStarting, kForeground, kBackground, kSuspended, kResuming, kStopping,
};
enum class WebOsLifecycleEvent {
  kWillBackground, kDidBackground, kWillForeground, kDidForeground,
  kSuspend, kStop,
};
struct LifecycleActions {
  bool blur = false, conceal = false, reveal = false, focus = false, stop = false;
  bool empty() const { return !blur && !conceal && !reveal && !focus && !stop; }
};
// Owner/event-loop thread only. Cobalt's existing transition callbacks own
// media/graphics preparation and restoration; no new firmware API is assumed.
class WebOsLifecycle {
 public:
  LifecycleActions OnLifecycleEvent(WebOsLifecycleEvent event);
  WebOsLifecycleState state() const { return state_; }
 private:
  WebOsLifecycleState state_ = WebOsLifecycleState::kStarting;
  bool concealed_ = false;
};
}  // namespace webos
}  // namespace shared
}  // namespace starboard
#endif
