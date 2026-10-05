#ifndef STARBOARD_WEBOS_ARM_WEBOS_STARTUP_TIMING_H_
#define STARBOARD_WEBOS_ARM_WEBOS_STARTUP_TIMING_H_
#include <array>
#include <cstdint>
#include <string>
namespace starboard { namespace shared { namespace webos {
enum class StartupStage { kProcessEntry, kLoggingReady, kSdlReady, kGraphicsReady, kCount };
class StartupTimings {
 public:
  StartupTimings() { times_.fill(-1); }
  void Record(StartupStage stage, int64_t milliseconds) {
    const auto index = static_cast<size_t>(stage);
    if (index < times_.size() && milliseconds >= 0 && times_[index] < 0) times_[index] = milliseconds;
  }
  std::string Report() const;
 private:
  std::array<int64_t, static_cast<size_t>(StartupStage::kCount)> times_;
};
void RecordStartupStage(StartupStage stage);
std::string CopyStartupReport();
}}}
#endif
