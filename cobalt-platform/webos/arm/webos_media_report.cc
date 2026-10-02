#include "webos_media_report.h"
#include "webos_media_diagnostics.h"
#include "webos_media_capabilities.h"
#include "webos_build_metadata.h"
#include "starfish_playback_rate.h"
#include "shared_av_experiment.h"
#include <cmath>
#include <cstdio>
#include <fstream>
namespace starboard { namespace shared { namespace webos {
namespace {
// Do not report arbitrary release file contents, device IDs or environment values.
std::string WebOsVersion() {
  std::ifstream input("/etc/webos-release");
  std::string line;
  for (int n = 0; n < 32 && std::getline(input, line); ++n) {
    const std::string key = "WEBOS_VERSION=";
    if (line.compare(0, key.size(), key) != 0) continue;
    std::string value = line.substr(key.size());
    if (value.size() > 32) return "unknown";
    if (value.size() >= 2 && value.front() == '"' && value.back() == '"')
      value = value.substr(1, value.size() - 2);
    if (value.empty() || value.find_first_not_of("0123456789.-") != std::string::npos) return "unknown";
    return value;
  }
  return "unknown";
}

}
std::string CopyWebOsMediaReport() {
  const auto& caps = GetWebOsMediaCapabilities();
  std::string report = "YouTube Cobalt AdFree " YTAF_APP_VERSION "\nSource SHA: " YTAF_SOURCE_SHA
      "\nCobalt: 23.lts.6\nStarboard API: 13\nArchitecture: ARMv7 softfp (kernel may be aarch64)\nwebOS: " + WebOsVersion() +
      "\nVideo capability policy: " + VideoCapabilityTierName(caps.tier) + "\n";
  const WebOsVideoCapability* codecs[] = {&caps.h264, &caps.vp9, &caps.av1};
  const char* names[] = {"H264", "VP9", "AV1"};
  for (int i = 0; i < 3; ++i) {
    char line[160]; const auto& cap = *codecs[i];
    std::snprintf(line, sizeof(line), "%s: %s %dx%d @ %d fps depth=%u HDR10=%d HLG=%d\n",
        names[i], cap.supported ? "enabled" : "disabled", cap.max_width, cap.max_height,
        cap.max_fps, cap.max_bit_depth, cap.hdr10, cap.hlg);
    report += line;
  }
  report += "Shared A/V policy: " + std::to_string(SharedAvBackendMode()) + "\n";
  const auto rate = GetPlaybackRateSupport();
  report += std::string("Rate policy: ") + (rate == PlaybackRateSupport::kOneXOnly ? "1x only" :
      rate == PlaybackRateSupport::kCommonFractional ? "common fractional" : "explicit full range") + "\n";
  report += CopyMediaSnapshotReport();
  report += "Recent playback events (maximum 100):\n";
  report += CopyMediaDiagnosticEvents();
  return report;
}
void TraceMediaSource(uint32_t source, uint32_t sequence, uint32_t type,
                      uint32_t stream, uint32_t bytes, double offset) {
  if (source == 0 || stream > 2 || !std::isfinite(offset) || std::abs(offset) > 9e9) return;
  const MediaEventType events[] = {MediaEventType::kSourceOpen, MediaEventType::kSourceClosed,
      MediaEventType::kSourceEnded, MediaEventType::kAppend, MediaEventType::kAppendComplete,
      MediaEventType::kSourceAbort, MediaEventType::kTimestampOffset, MediaEventType::kSourceRemove};
  if (type >= sizeof(events) / sizeof(events[0])) return;
  MediaEvent event;
  event.source = source; event.sequence = sequence; event.event = events[type];
  event.stream = stream == 1 ? MediaStream::kAudio : stream == 2 ? MediaStream::kVideo : MediaStream::kNone;
  event.input_bytes = bytes; event.pts_us = static_cast<int64_t>(offset * 1e6);
  event.accepted = true;
  RecordMediaEvent(event);
}
}}}
