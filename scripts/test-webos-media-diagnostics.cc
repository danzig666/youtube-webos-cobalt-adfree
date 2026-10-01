#include <cassert>
#include <iostream>
#include <thread>
#include <vector>
#include "webos_media_diagnostics.h"
using namespace starboard::shared::webos;
int main() {
  MediaEventRing ring;
  assert(ring.Report().empty());
  MediaEvent event;
  event.session = 8; event.generation = 3;
  event.event = MediaEventType::kFirstPacket;
  event.codec = MediaCodec::kVp9; event.stream = MediaStream::kVideo;
  event.width = 3840; event.height = 2160;
  for (int i = 0; i < 1000; ++i) { event.pts_us = i; ring.Record(event); }
  assert(ring.size() == 100);
  assert(ring.at(0).pts_us == 900 && ring.at(99).pts_us == 999);
  const auto report = ring.Report();
  assert(report.size() < 51200);
  assert(report.find("session=8 generation=3") != std::string::npos);
  assert(report.find("event=first_packet type=video codec=VP9 size=3840x2160") != std::string::npos);
  for (const char* secret : {"http:", "https:", "Cookie", "Authorization", "OAuth", "account"})
    assert(report.find(secret) == std::string::npos);
  event.error = WebOsPlayerError::kNativeRateFailed;
  assert(FormatMediaEvent(event).find("error=NativeRateFailed") != std::string::npos);
  std::vector<uint64_t> ids(16);
  std::vector<std::thread> threads;
  for (size_t i = 0; i < ids.size(); ++i)
    threads.emplace_back([&, i] { ids[i] = NextMediaSessionId(); });
  for (auto& thread : threads) thread.join();
  for (size_t i = 0; i < ids.size(); ++i) {
    assert(ids[i] > 0);
    for (size_t j = 0; j < i; ++j) assert(ids[i] != ids[j]);
  }
  std::cout << "Bounded typed media diagnostics and concurrent IDs passed\n";
}
