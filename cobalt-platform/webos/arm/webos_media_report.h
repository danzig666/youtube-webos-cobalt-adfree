#ifndef STARBOARD_WEBOS_ARM_WEBOS_MEDIA_REPORT_H_
#define STARBOARD_WEBOS_ARM_WEBOS_MEDIA_REPORT_H_
#include <cstdint>
#include <string>
namespace starboard { namespace shared { namespace webos {
std::string CopyWebOsMediaReport();
void RequestMediaReportCopy();
int MediaReportCopyStatus(); // 0 idle, 1 pending, 2 copied, 3 unavailable/failed.
void TraceMediaSource(uint32_t source, uint32_t sequence, uint32_t event,
                      uint32_t stream, uint32_t bytes, double offset_seconds);
}}}
#endif
