#ifndef STARBOARD_WEBOS_ARM_WEBOS_AAC_PROBE_H_
#define STARBOARD_WEBOS_ARM_WEBOS_AAC_PROBE_H_
#include <string>
namespace starboard { namespace shared { namespace webos {
std::string GetFirmwareAacProbeReport();
int RunFirmwareAacProbe(const char* candidate);
}}}
#endif
