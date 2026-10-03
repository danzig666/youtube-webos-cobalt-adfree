#include <cassert>
#include <iostream>
#include <thread>
#include <vector>
#include "webos_media_diagnostics.h"
using namespace starboard::shared::webos;
int main(int argc, char**) {
  if (argc > 1) {
    MediaEvent event;
    for (auto type : {MediaEventType::kVideoCapability,
                      MediaEventType::kFirstFrame, MediaEventType::kError}) {
      event.event = type;
      if (type == MediaEventType::kError) event.error = WebOsPlayerError::kNativeRateFailed;
      for (int i = 0; i < 1000; ++i) {
        event.pts_us = i;
        RecordMediaEvent(event);
      }
    }
    std::cout << CopyMediaDiagnosticEvents();
    return 0;
  }
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
  event.session = event.generation = event.source = event.sequence = event.input_bytes = UINT64_MAX;
  event.monotonic_us = event.pts_us = INT64_MIN;
  event.queued_packets = event.queued_bytes = UINT64_MAX;
  event.width = event.height = INT32_MIN; event.bits = UINT32_MAX;
  const auto extreme = FormatMediaEvent(event);
  assert(extreme.size() < 512 && extreme.back() == '\n');
  MediaSnapshot snapshot;
  snapshot.session = 100; snapshot.generation = 7; snapshot.shared = true; snapshot.active = true;
  snapshot.video = MediaCodec::kAv1; snapshot.audio = MediaCodec::kOpus;
  snapshot.width = 3840; snapshot.height = 2160; snapshot.bits = 10; snapshot.hdr = 1;
  snapshot.sample_rate = 48000; snapshot.channels = 2; snapshot.video_packets = 12;
  snapshot.applied_rate = 1.25;
  snapshot.presentation_us = 90000000; snapshot.presented_frames = 100;
  UpdateMediaSnapshot(snapshot);
  auto summary = CopyMediaSnapshotReport();
  assert(summary.find("AV1 3840x2160 10-bit HDR10") != std::string::npos);
  assert(summary.find("applied 1.25x") != std::string::npos);
  MediaEvent terminal; terminal.session = 99; terminal.generation = 100;
  terminal.event = MediaEventType::kUnload; RecordMediaEvent(terminal);
  assert(CopyMediaSnapshotReport() == summary);
  UpdateMediaPresentation(100, 7, 91250000, 175);
  assert(CopyMediaSnapshotReport().find("Native presentation: 91.25 seconds") != std::string::npos);
  assert(CopyMediaSnapshotReport().find("Presented frames: 175") != std::string::npos);
  UpdateMediaPresentation(99, 7, 0, 0); UpdateMediaPresentation(100, 6, 0, 0);
  assert(CopyMediaSnapshotReport().find("Native presentation: 91.25 seconds") != std::string::npos);
  summary = CopyMediaSnapshotReport();
  snapshot.generation = 6; snapshot.width = 0; UpdateMediaSnapshot(snapshot);
  assert(CopyMediaSnapshotReport() == summary);
  snapshot.session = 99; snapshot.generation = 100; UpdateMediaSnapshot(snapshot);
  assert(CopyMediaSnapshotReport() == summary);
  snapshot.session = 101; snapshot.generation = 1; snapshot.active = false; UpdateMediaSnapshot(snapshot);
  assert(CopyMediaSnapshotReport().find("inactive") != std::string::npos);
  terminal.session = 101; terminal.generation = 1; terminal.event = MediaEventType::kNativeEos;
  RecordMediaEvent(terminal);
  snapshot.active = true; UpdateMediaSnapshot(snapshot); // Late same-generation rate/queue update.
  assert(CopyMediaSnapshotReport().find("inactive") != std::string::npos);
  snapshot.generation = 2; UpdateMediaSnapshot(snapshot); // A real reset can play again.
  assert(CopyMediaSnapshotReport().find("inactive") == std::string::npos);
  std::cout << "Bounded typed media diagnostics and concurrent IDs passed\n";
}
