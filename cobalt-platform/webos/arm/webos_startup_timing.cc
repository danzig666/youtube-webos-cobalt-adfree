#include "webos_startup_timing.h"
#include <chrono>
#include <mutex>
namespace starboard { namespace shared { namespace webos {
namespace {
std::mutex startup_mutex;
StartupTimings timings;
std::chrono::steady_clock::time_point started;
bool initialized = false;
}
std::string StartupTimings::Report() const {
  const char* labels[] = {"Process entry", "Logging ready", "SDL ready", "Graphics ready"};
  std::string report = "Native startup (milliseconds from process entry):\n";
  for (size_t i = 0; i < times_.size(); ++i)
    report += std::string(labels[i]) + ": " + (times_[i] < 0 ? "not reached" : std::to_string(times_[i]) + " ms") + "\n";
  return report;
}
void RecordStartupStage(StartupStage stage) {
  std::lock_guard<std::mutex> lock(startup_mutex);
  const auto now = std::chrono::steady_clock::now();
  if (!initialized) { started = now; initialized = true; }
  timings.Record(stage, std::chrono::duration_cast<std::chrono::milliseconds>(now - started).count());
}
std::string CopyStartupReport() {
  std::lock_guard<std::mutex> lock(startup_mutex);
  return timings.Report();
}
}}}
