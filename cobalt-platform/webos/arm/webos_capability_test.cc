#include "starboard/webos/arm/webos_capability_test.h"
#include "starboard/webos/arm/webos_capability_process.h"
#include "starboard/webos/arm/webos_build_metadata.h"
#include <cstdio>
#include <cstdint>
#include <dlfcn.h>
#include <mutex>
#include <thread>
#include <chrono>
#include <cstring>
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
const char* ConfigUri() { return "luna://com.webos.service.config/getConfigs"; }
const char* SystemUri() { return "luna://com.webos.service.tv.systemproperty/getSystemInfo"; }
const char* ConfigParameters() {
  return "{\"configNames\":[\"tv.hw.panelResolution\",\"tv.hw.displayType\",\"tv.model.modelname\",\"tv.model.supportHDR\",\"tv.config.supportDolbyHDRContents\",\"tv.model.supportTemp8K\",\"tv.model.mainboardMaker\",\"tv.nyx.firmwareVersion\",\"tv.nyx.platformVersion\"]}";
}
const char* SystemParameters() {
  return "{\"keys\":[\"modelName\",\"firmwareVersion\",\"sdkVersion\",\"UHD\",\"OLED\"]}";
}
struct LunaQueryResult { CapabilityProcessResult process; const char* backend; };
LunaQueryResult Query(bool config) {
  const char* probe_args[] = {"/proc/self/exe", config ? "--ytaf-lg-config-probe" : "--ytaf-lg-system-probe", nullptr};
  const auto direct = RunCapabilityProcess(const_cast<char* const*>(probe_args));
  // Only missing ABI/library support permits the CLI fallback. Never change
  // identities or retry a denied request using a more privileged interface.
  if (direct.status != "ok" || direct.output != "YTAF_LUNA_API_UNAVAILABLE\n") return {direct, "ls2"};
  const char* executable = "/usr/bin/luna-send-pub";
  if (access(executable, X_OK) != 0) return {{"unavailable", ""}, "cli"};
  const char* args[] = {executable, "-a", YTAF_APP_ID, "-n", "1", config ? ConfigUri() : SystemUri(), config ? ConfigParameters() : SystemParameters(), nullptr};
  return {RunCapabilityProcess(const_cast<char* const*>(args)), "cli"};
}
std::string Result(const LunaQueryResult& result) {
  std::string value = Result(result.process); value.pop_back();
  return value + ",\"backend\":" + Quote(result.backend) + "}";
}
// C ABI declarations/layout verified against SDK luna-service2/lunaservice.h.
// Resolve optional symbols rather than adding mandatory LS2/GLib dependencies.
struct LunaError {
  int error_code; char* message; const char* file; int line;
  const char* func; void* padding; unsigned long magic;
};
struct LunaReply {
  const char* (*payload)(void*); std::string body; bool received = false; bool too_large = false;
};
bool OnLunaReply(void*, void* message, void* context) {
  auto& reply = *static_cast<LunaReply*>(context);
  const char* payload = reply.payload(message);
  const size_t length = payload ? strnlen(payload, 4097) : 0;
  reply.too_large = length > 4096;
  if (payload && !reply.too_large) reply.body.assign(payload, length);
  reply.received = true; return true;
}
std::string LunaFailure(const char* stage, const char* reason, int code = 0) {
  return "{\"ytafLuna\":{\"stage\":" + Quote(stage) + ",\"reason\":" + Quote(reason) + ",\"code\":" + std::to_string(code) + "}}";
}

}
bool StartWebOsCapabilityTest() {
  auto& state = State(); std::lock_guard<std::mutex> lock(state.mutex);
  if (state.running) return false;
  state.running = true; state.report = "{\"state\":\"running\"}";
  // Only fixed, documented queries under the app's own identity. Never load a player.
  std::thread([] {
    const auto config = Query(true);
    const auto system = Query(false);
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
int RunWebOsLgCapabilityProbe(bool config) {
  void* luna = dlopen("libluna-service2.so.3", RTLD_LAZY | RTLD_LOCAL);
  if (!luna) luna = dlopen("libluna-service2.so", RTLD_LAZY | RTLD_LOCAL);
  void* glib = dlopen("libglib-2.0.so.0", RTLD_LAZY | RTLD_LOCAL);
  if (!luna || !glib) { std::puts("YTAF_LUNA_API_UNAVAILABLE"); return 0; }
  const auto error_init = reinterpret_cast<bool (*)(LunaError*)>(dlsym(luna,"LSErrorInit"));
  const auto error_free = reinterpret_cast<void (*)(LunaError*)>(dlsym(luna,"LSErrorFree"));
  // Legacy TV firmware exposes the explicit public-bus registration API.
  // Its declaration is in Open webOS include/public/luna-service2/lunaservice.h.
  const auto register_public = reinterpret_cast<bool (*)(const char*,void**,bool,LunaError*)>(dlsym(luna,"LSRegisterPubPriv"));
  const auto register_app = reinterpret_cast<bool (*)(const char*,const char*,void**,LunaError*)>(dlsym(luna,"LSRegisterApplicationService"));
  const auto unregister = reinterpret_cast<bool (*)(void*,LunaError*)>(dlsym(luna,"LSUnregister"));
  const auto attach = reinterpret_cast<bool (*)(void*,void*,LunaError*)>(dlsym(luna,"LSGmainContextAttach"));
  const auto call = reinterpret_cast<bool (*)(void*,const char*,const char*,bool (*)(void*,void*,void*),void*,unsigned long*,LunaError*)>(dlsym(luna,"LSCallOneReply"));
  const auto payload = reinterpret_cast<const char* (*)(void*)>(dlsym(luna,"LSMessageGetPayload"));
  const auto context_new = reinterpret_cast<void* (*)()>(dlsym(glib,"g_main_context_new"));
  const auto context_unref = reinterpret_cast<void (*)(void*)>(dlsym(glib,"g_main_context_unref"));
  const auto iterate = reinterpret_cast<int (*)(void*,int)>(dlsym(glib,"g_main_context_iteration"));
  if (!error_init || !error_free || (!register_public && !register_app) || !unregister || !attach || !call || !payload || !context_new || !context_unref || !iterate) {
    std::puts("YTAF_LUNA_API_UNAVAILABLE"); return 0;
  }
  LunaError error{}; void* handle = nullptr; void* context = context_new();
  LunaReply reply{payload, "", false, false}; std::string report;
  error_init(&error);
  if (!context) report = LunaFailure("initialize", "failed");
  else if (!(register_public ? register_public(nullptr, &handle, true, &error) : register_app(nullptr, YTAF_APP_ID, &handle, &error)))
    report = LunaFailure("register", (error.error_code == -1027 || error.error_code == -1031 || error.error_code == -1032) ? "permission-denied" : "failed", error.error_code);
  else if (!attach(handle, context, &error)) report = LunaFailure("attach", "failed", error.error_code);
  else {
    unsigned long token = 0;
    // Forwarding applicationID via LSCallFromApplication requires a privileged
    // proxy (-1031 on C3). Use the registered client’s ordinary identity.
    if (!call(handle, config ? ConfigUri() : SystemUri(), config ? ConfigParameters() : SystemParameters(), OnLunaReply, &reply, &token, &error))
      report = LunaFailure("call", (error.error_code == -1027 || error.error_code == -1031 || error.error_code == -1032) ? "permission-denied" : "failed", error.error_code);
    else {
      const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(2000);
      while (!reply.received && std::chrono::steady_clock::now() < deadline) { iterate(context, 0); usleep(10000); }
      if (!reply.received) report = LunaFailure("reply", "timeout");
      else if (reply.too_large) report = LunaFailure("reply", "output-limit");
      else report = "{\"ytafLuna\":{\"stage\":\"reply\"},\"payload\":" + Quote(reply.body) + "}";
    }
  }
  error_free(&error); error_init(&error);
  if (handle) unregister(handle, &error);
  error_free(&error); if (context) context_unref(context);
  // Retain library handles until this isolated process exits; LS2 may use GLib
  // callbacks during its own teardown. No vendor library runs in the app thread.
  std::puts(report.c_str()); return 0;
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
