#include <cassert>
#include <cmath>
#include <iostream>
#include <limits>
#include "webos_media_report.h"
#include "webos_media_diagnostics.h"
using namespace starboard::shared::webos;
int main() {
  const auto initial = CopyWebOsMediaReport();
  assert(initial.find("Cobalt: 23.lts.6") != std::string::npos);
  assert(initial.find("Starboard API: 13") != std::string::npos);
  assert(initial.find("Current player: unavailable") != std::string::npos);
  const auto before = CopyMediaDiagnosticEvents();
  TraceMediaSource(0, 1, 0, 0, 0, 0);
  TraceMediaSource(1, 1, 99, 0, 0, 0);
  TraceMediaSource(1, 1, 0, 3, 0, 0);
  TraceMediaSource(1, 1, 0, 0, 0, std::numeric_limits<double>::infinity());
  TraceMediaSource(1, 1, 0, 0, 0, std::numeric_limits<double>::quiet_NaN());
  TraceMediaSource(1, 1, 0, 0, 0, 1e12);
  assert(CopyMediaDiagnosticEvents() == before);
  TraceMediaSource(3, 12, 3, 1, 1024, -2.5);
  auto report = CopyWebOsMediaReport();
  assert(report.find("source=3 sequence=12") != std::string::npos);
  assert(report.find("event=mse_append type=audio") != std::string::npos);
  assert(report.find("pts_us=-2500000") != std::string::npos);
  for (int i = 0; i < 200; ++i) TraceMediaSource(3, i, 4, 1, 0, 0);
  report = CopyWebOsMediaReport();
  assert(report.size() < 65536);
  for (const char* secret : {"http:", "https:", "Cookie", "Authorization", "OAuth", "account"})
    assert(report.find(secret) == std::string::npos);
  std::cout << "Bounded complete playback report and numeric MSE validation passed\n";
}
