#include <cstring>
#include <luna-service2/lunaservice.h>
extern "C" {
bool LSErrorInit(LSError* error) { std::memset(error, 0, sizeof(*error)); return true; }
void LSErrorFree(LSError*) {}
bool LSCall(LSHandle*, const char*, const char*, LSFilterFunc, void*, LSMessageToken*, LSError*) { return false; }
bool LSCallOneReply(LSHandle*, const char*, const char*, LSFilterFunc, void*, LSMessageToken*, LSError*) { return false; }
bool LSCallCancel(LSHandle*, LSMessageToken, LSError*) { return true; }
const char* LSMessageGetPayload(LSMessage*) { return "{}"; }
GMainContext* LSGmainGetContext(LSHandle*, LSError*) { return nullptr; }
}
