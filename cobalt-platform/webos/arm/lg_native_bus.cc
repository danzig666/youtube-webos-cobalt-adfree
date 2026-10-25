#include "starboard/webos/arm/lg_native_bus.h"
#include "starboard/webos/arm/webos_microphone_report.h"

#include <dlfcn.h>

namespace starboard {
namespace shared {
namespace webos {
LSHandle* LgNativeAppBus(bool public_only) {
  // Keep the library loaded: its singleton owns the bus and dispatch thread.
  static void* library = dlopen("libhelpers.so.2", RTLD_NOW | RTLD_LOCAL);
  if (!library) { SetMicrophoneDetail("LG helper library unavailable"); return nullptr; }
  using Instance = void* (*)();
  using Handle = LSHandle* (*)(void*);
  auto instance = reinterpret_cast<Instance>(
      dlsym(library, "_ZN18HLunaServiceBridge8instanceEv"));
  auto handle = reinterpret_cast<Handle>(
      dlsym(library, "_ZN18HLunaServiceBridge13PrivateHandleEv"));
  auto public_handle = reinterpret_cast<Handle>(
      dlsym(library, "_ZN18HLunaServiceBridge12PublicHandleEv"));
  if (!instance || (!handle && !public_handle)) {
    SetMicrophoneDetail("LG helper connection ABI unavailable"); return nullptr;
  }
  void* bridge = instance();
  if (!bridge) { SetMicrophoneDetail("LG helper instance unavailable"); return nullptr; }
  // SDK-backed fallback: some firmware supplies only the public app handle.
  LSHandle* bus = !public_only && handle ? handle(bridge) : nullptr;
  if (!bus && public_handle) bus = public_handle(bridge);
  if (!bus) SetMicrophoneDetail("LG helper has no private or public app connection");
  return bus;
}
}  // namespace webos
}  // namespace shared
}  // namespace starboard
