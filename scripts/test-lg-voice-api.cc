#include "lg_voice_api.h"
#include <cassert>
#include <cstring>
#include <dlfcn.h>
int main(int argc, char** argv) {
  // Merely linking this adapter does not load the service libraries.
  assert(!dlopen("libluna-service2.so.3", RTLD_NOLOAD | RTLD_NOW));
  auto& api = starboard::shared::webos::VoiceApi();
  if (argc == 2 && std::strcmp(argv[1], "--unavailable") == 0) {
    assert(!api.ready); return 0;
  }
  assert(api.ready);
  LSError error{};
  assert(api.LSErrorInit_fn(&error));
  assert(std::strcmp(api.LSMessageGetPayload_fn(nullptr), "{}") == 0);
}
