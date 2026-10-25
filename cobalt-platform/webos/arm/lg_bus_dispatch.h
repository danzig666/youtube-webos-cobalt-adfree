#ifndef STARBOARD_WEBOS_ARM_LG_BUS_DISPATCH_H_
#define STARBOARD_WEBOS_ARM_LG_BUS_DISPATCH_H_

#include <glib.h>
#include <chrono>
#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <utility>

namespace starboard { namespace shared { namespace webos {
// LS2 calls are nonblocking, but its shared dispatcher may be stopped. Cancel
// work which has not begun before returning, so no queued task retains a stack
// reference after the caller times out. An executing LS2 call finishes first.
inline bool InvokeVoiceBus(GMainContext* context, std::function<void()> function) {
  if (!context) return false;
  struct Task {
    std::mutex mutex;
    std::condition_variable cv;
    std::function<void()> function;
    bool done = false;
    bool cancelled = false;
  };
  auto task = std::make_shared<Task>();
  task->function = std::move(function);
  auto* retained = new std::shared_ptr<Task>(task);
  GSource* source = g_idle_source_new();
  g_source_set_callback(source, [](gpointer opaque) -> gboolean {
    auto task = *static_cast<std::shared_ptr<Task>*>(opaque);
    std::lock_guard<std::mutex> lock(task->mutex);
    if (!task->cancelled) { task->function(); task->done = true; }
    task->cv.notify_one();
    return G_SOURCE_REMOVE;
  }, retained, [](gpointer opaque) {
    delete static_cast<std::shared_ptr<Task>*>(opaque);
  });
  g_source_attach(source, context);
  bool done;
  {
    std::unique_lock<std::mutex> lock(task->mutex);
    done = task->cv.wait_for(lock, std::chrono::milliseconds(400), [&] { return task->done; });
    if (!done) { task->cancelled = true; task->function = {}; }
  }
  g_source_destroy(source);
  g_source_unref(source);
  return done;
}

// Cleanup owns its callback state until the shared dispatcher resumes. Never
// destroy subscribed LS2 userdata merely because its dispatcher is unavailable.
inline void QueueVoiceBusCleanup(GMainContext* context, std::function<void()> function) {
  auto* retained = new std::function<void()>(std::move(function));
  GSource* source = g_idle_source_new();
  g_source_set_callback(source, [](gpointer opaque) -> gboolean {
    (*static_cast<std::function<void()>*>(opaque))();
    return G_SOURCE_REMOVE;
  }, retained, [](gpointer opaque) { delete static_cast<std::function<void()>*>(opaque); });
  g_source_attach(source, context);
  g_source_unref(source);
}
}}}
#endif
