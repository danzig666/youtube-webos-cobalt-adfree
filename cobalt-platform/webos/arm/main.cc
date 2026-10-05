#include <time.h>

#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <memory>
#include <thread>
#include <vector>

#include <unistd.h>

#include "starboard/webos/arm/webos_capability_test.h"
#include "starboard/webos/arm/webos_direct_log.h"
#include "starboard/webos/arm/webos_startup_timing.h"
#include "starboard/webos/arm/webos_build_metadata.h"
#include "starboard/configuration.h"
#include "starboard/shared/signal/crash_signals.h"
#include "starboard/shared/signal/debug_signals.h"
#include "starboard/shared/signal/suspend_signals.h"
#include "starboard/shared/starboard/link_receiver.h"
#include "starboard/webos/arm/application_sdl.h"

extern "C" SB_EXPORT_PLATFORM int main(int argc, char** argv) {
  if (argc == 2 && std::strcmp(argv[1], "--ytaf-capability-probe") == 0)
    return starboard::shared::webos::RunWebOsCapabilityProbe();

  if (argc == 2 && std::strcmp(argv[1], "--ytaf-lg-config-probe") == 0)
    return starboard::shared::webos::RunWebOsLgCapabilityProbe(true);
  if (argc == 2 && std::strcmp(argv[1], "--ytaf-lg-system-probe") == 0)
    return starboard::shared::webos::RunWebOsLgCapabilityProbe(false);

  using starboard::shared::webos::RecordStartupStage;
  using starboard::shared::webos::StartupStage;
  RecordStartupStage(StartupStage::kProcessEntry);

  // webOS exposes its system PulseAudio server here.  XDG_RUNTIME_DIR points
  // at the compositor runtime owned by root, so libpulse cannot discover the
  // socket automatically and would otherwise fall back to the incompatible
  // raw ALSA device.
  setenv("PULSE_SERVER", "unix:/var/run/pulse/native", 1);

  // Upstream PR #98 removes pipe backpressure. Rotate whole segments so raw
  // SbLogRaw/write(2) callers cannot race an in-place copy and truncation.
  const std::string log_path = std::strcmp(YTAF_APP_ID, "youtube.leanback.v4") == 0
      ? "/tmp/cobalt-starterless.log"
      : std::string("/tmp/cobalt-starterless-") + YTAF_APP_ID + ".log";
  auto log = std::make_shared<starboard::shared::webos::WebOsDirectLog>(log_path);
  if (log->Initialize()) {
    std::setvbuf(stdout, nullptr, _IOLBF, 0);
    // SbLogRaw bypasses FILE buffering, so do not promise buffering its writes.
    std::thread([log]() {
      while (true) {
        sleep(1);
        std::fflush(stdout);
        std::fflush(stderr);
        log->RotateIfNeeded();
      }
    }).detach();
  }
  RecordStartupStage(StartupStage::kLoggingReady);
  std::fprintf(stderr, "\n=== Cobalt starterless process started ===\n");

  tzset();
  starboard::shared::signal::InstallCrashSignalHandlers();
  starboard::shared::signal::InstallDebugSignalHandlers();
  starboard::shared::signal::InstallSuspendSignalHandlers();

  starboard::shared::webos::ApplicationSdl application;
  std::vector<char*> cobalt_argv;
  cobalt_argv.push_back(argv[0]);
  bool preload = false;
  for (int i = 1; i < argc; ++i) {
    if (argv[i] && argv[i][0] == '{' &&
        std::strstr(argv[i], "\"@system_native_app\"") != nullptr) {
      if (std::strstr(argv[i], "\"preload\":\"semi-full\"") != nullptr ||
          std::strstr(argv[i], "\"event\":\"preload\"") != nullptr) {
        preload = true;
      }
      continue;
    }
    cobalt_argv.push_back(argv[i]);
  }
  char preload_switch[] = "--preload";
  if (preload) {
    cobalt_argv.push_back(preload_switch);
    std::fprintf(stderr, "Translating webOS hidden preload launch.\n");
  }
  int result = 0;
  {
    starboard::shared::starboard::LinkReceiver receiver(&application);
    result = application.Run(static_cast<int>(cobalt_argv.size()),
                             cobalt_argv.data());
  }

  starboard::shared::signal::UninstallSuspendSignalHandlers();
  starboard::shared::signal::UninstallDebugSignalHandlers();
  starboard::shared::signal::UninstallCrashSignalHandlers();
  return result;
}
