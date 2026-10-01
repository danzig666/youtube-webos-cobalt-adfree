#include <cassert>
#include <iostream>
#include "webos_lifecycle.h"
using namespace starboard::shared::webos;
int main() {
  using Event = WebOsLifecycleEvent;
  using State = WebOsLifecycleState;
  WebOsLifecycle lifecycle;
  assert(lifecycle.state() == State::kStarting);
  assert(lifecycle.OnLifecycleEvent(Event::kWillForeground).reveal);
  assert(lifecycle.OnLifecycleEvent(Event::kWillForeground).empty());
  assert(lifecycle.OnLifecycleEvent(Event::kDidForeground).focus);
  assert(lifecycle.state() == State::kForeground);
  for (int cycle = 0; cycle < 100; ++cycle) {
    assert(lifecycle.OnLifecycleEvent(Event::kDidForeground).empty());
    assert(lifecycle.OnLifecycleEvent(Event::kWillBackground).blur);
    for (int i = 0; i < 3; ++i)
      assert(lifecycle.OnLifecycleEvent(Event::kWillBackground).empty());
    assert(lifecycle.OnLifecycleEvent(Event::kDidBackground).conceal);
    assert(lifecycle.OnLifecycleEvent(Event::kDidBackground).empty());
    assert(lifecycle.OnLifecycleEvent(Event::kSuspend).empty());
    assert(lifecycle.state() == State::kSuspended);
    assert(lifecycle.OnLifecycleEvent(Event::kSuspend).empty());
    assert(lifecycle.OnLifecycleEvent(Event::kWillForeground).reveal);
    assert(lifecycle.state() == State::kResuming);
    assert(lifecycle.OnLifecycleEvent(Event::kWillForeground).empty());
    assert(lifecycle.OnLifecycleEvent(Event::kDidForeground).focus);
  }
  assert(lifecycle.OnLifecycleEvent(Event::kStop).stop);
  for (auto event : {Event::kStop, Event::kWillForeground, Event::kDidForeground,
                    Event::kSuspend, Event::kDidBackground})
    assert(lifecycle.OnLifecycleEvent(event).empty());
  WebOsLifecycle missing_will;
  auto actions = missing_will.OnLifecycleEvent(Event::kDidForeground);
  assert(actions.reveal && actions.focus);
  actions = missing_will.OnLifecycleEvent(Event::kDidBackground);
  assert(actions.blur && actions.conceal);
  assert(missing_will.OnLifecycleEvent(Event::kDidBackground).empty());
  assert(missing_will.OnLifecycleEvent(Event::kDidForeground).focus);
  std::cout << "webOS lifecycle duplicate, skipped-event and resume transitions passed\n";
}
