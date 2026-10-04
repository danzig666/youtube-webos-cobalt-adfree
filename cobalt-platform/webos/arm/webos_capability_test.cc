#include "starboard/webos/arm/webos_capability_test.h"
#include "starboard/webos/arm/webos_capability_process.h"
#include "starboard/webos/arm/webos_build_metadata.h"
#include <cstdio>
#include <cstdint>
#include <dlfcn.h>
#include <mutex>
#include <thread>
namespace starboard { namespace shared { namespace webos {
namespace {
struct TestState { std::mutex mutex; bool running = false; std::string report = "{\"state\":\"idle\"}"; };
TestState& State() { static auto* state = new TestState; return *state; }
std::string Quote(const std::string& input) {
  std::string value = "\"";
  for (unsigned char ch : input) {
    if (ch == '\\' || ch == '"') { value += '\\'; value += ch; }
    else if (ch < 32) { char escape[7]; std::snprintf(escape, sizeof(escape), "\\u%04x", ch); value += escape; }
    else value += ch;
  }
  return value + "\"";
}
std::string Result(const CapabilityProcessResult& result) {
  return "{\"status\":" + Quote(result.status) + ",\"body\":" + Quote(result.output) + "}";
}
CapabilityProcessResult Query(const char* uri, const char* parameters) {
  const char* executable = "/usr/bin/luna-send-pub";
  if (access(executable, X_OK) != 0) return {"unavailable", ""};
  const char* args[] = {executable, "-a", YTAF_APP_ID, "-n", "1", uri, parameters, nullptr};
  return RunCapabilityProcess(const_cast<char* const*>(args));
}
}
bool StartWebOsCapabilityTest() {
  auto& state = State(); std::lock_guard<std::mutex> lock(state.mutex);
  if (state.running) return false;
  state.running = true; state.report = "{\"state\":\"running\"}";
  // Only fixed, documented queries under the app's own identity. Never load a player.
  std::thread([] {
    const auto config = Query("luna://com.webos.service.config/getConfigs",
      "{\"configNames\":[\"tv.hw.panelResolution\",\"tv.hw.displayType\",\"tv.model.modelname\",\"tv.model.supportHDR\",\"tv.config.supportDolbyHDRContents\",\"tv.model.supportTemp8K\",\"tv.model.mainboardMaker\",\"tv.nyx.firmwareVersion\",\"tv.nyx.platformVersion\"]}");
    const auto system = Query("luna://com.webos.service.tv.systemproperty/getSystemInfo",
      "{\"keys\":[\"modelName\",\"firmwareVersion\",\"sdkVersion\",\"UHD\",\"OLED\"]}");
    const char* args[] = {"/proc/self/exe", "--ytaf-capability-probe", nullptr};
    const auto decoder = RunCapabilityProcess(const_cast<char* const*>(args));
    auto& state = State(); std::lock_guard<std::mutex> lock(state.mutex);
    state.report = "{\"state\":\"done\",\"config\":" + Result(config) + ",\"system\":" + Result(system) + ",\"decoder\":" + Result(decoder) + "}";
    state.running = false;
  }).detach();
  return true;
}
std::string GetWebOsCapabilityTestReport() {
  auto& state = State(); std::lock_guard<std::mutex> lock(state.mutex); return state.report;
}
int RunWebOsCapabilityProbe() {
  // Exec in a separate process: optional vendor code cannot hang/crash the app.
  void* library = dlopen("libplayerAPIs.so.1", RTLD_LAZY | RTLD_LOCAL);
  if (!library) library = dlopen("libplayerAPIs.so", RTLD_LAZY | RTLD_LOCAL);
  if (!library) { std::puts("decoder=library-unavailable"); return 0; }
  using QueryResolution = bool (*)(std::string, int32_t*, int32_t*, int32_t*);
  const auto query = reinterpret_cast<QueryResolution>(dlsym(library,
    "_ZN3smp4util21getMaxVideoResolutionENSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEEPiS7_S7_"));
  if (!query) { std::puts("decoder=query-unavailable"); dlclose(library); return 0; }
  for (const char* codec : {"H264", "VP9", "AV1"}) {
    int32_t width = 0, height = 0, fps = 0;
    if (query(codec, &width, &height, &fps) && width > 0 && width <= 32768 && height > 0 && height <= 32768 && fps > 0 && fps <= 1000)
      std::printf("%s=%d,%d,%d\n", codec, width, height, fps);
    else std::printf("%s=unknown\n", codec);
  }
  dlclose(library); return 0;
}
}}}
