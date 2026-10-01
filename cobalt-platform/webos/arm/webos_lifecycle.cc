#include "webos_lifecycle.h"
namespace starboard {
namespace shared {
namespace webos {
LifecycleActions WebOsLifecycle::OnLifecycleEvent(WebOsLifecycleEvent event) {
  LifecycleActions actions;
  if (state_ == WebOsLifecycleState::kStopping) return actions;
  switch (event) {
    case WebOsLifecycleEvent::kStop:
      state_ = WebOsLifecycleState::kStopping;
      actions.stop = true;
      break;
    case WebOsLifecycleEvent::kWillBackground:
    case WebOsLifecycleEvent::kDidBackground:
    case WebOsLifecycleEvent::kSuspend:
      if (state_ != WebOsLifecycleState::kBackground &&
          state_ != WebOsLifecycleState::kSuspended) {
        actions.blur = true;
        state_ = WebOsLifecycleState::kBackground;
      }
      if (event != WebOsLifecycleEvent::kWillBackground && !concealed_) {
        actions.conceal = true;
        concealed_ = true;
      }
      if (event == WebOsLifecycleEvent::kSuspend)
        state_ = WebOsLifecycleState::kSuspended;
      break;
    case WebOsLifecycleEvent::kWillForeground:
    case WebOsLifecycleEvent::kDidForeground:
      if (state_ == WebOsLifecycleState::kForeground) break;
      if (state_ != WebOsLifecycleState::kResuming) {
        actions.reveal = true;
        concealed_ = false;
        state_ = WebOsLifecycleState::kResuming;
      }
      if (event == WebOsLifecycleEvent::kDidForeground) {
        actions.focus = true;
        state_ = WebOsLifecycleState::kForeground;
      }
      break;
  }
  return actions;
}
}  // namespace webos
}  // namespace shared
}  // namespace starboard
