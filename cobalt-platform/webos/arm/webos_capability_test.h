#ifndef STARBOARD_WEBOS_ARM_WEBOS_CAPABILITY_TEST_H_
#define STARBOARD_WEBOS_ARM_WEBOS_CAPABILITY_TEST_H_
#include <string>
namespace starboard { namespace shared { namespace webos {
bool StartWebOsCapabilityTest();
std::string GetWebOsCapabilityTestReport();
int RunWebOsCapabilityProbe();
int RunWebOsLgCapabilityProbe(bool config);
}}}
#endif
