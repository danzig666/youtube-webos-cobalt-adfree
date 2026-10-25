#include "starboard/microphone.h"

#include <cstring>
#include <memory>
#include <mutex>

#include "starboard/common/log.h"
#include "starboard/webos/arm/lg_voice_capture.h"
#include "starboard/webos/arm/webos_microphone_report.h"

struct SbMicrophoneIdPrivate {};
struct SbMicrophonePrivate {
  explicit SbMicrophonePrivate(int size) : capture(size) {}
  ::starboard::shared::webos::LgVoiceCapture capture;
  bool error_reported = false;
};

namespace {
SbMicrophoneIdPrivate kRemote;
SbMicrophone g_microphone = kSbMicrophoneInvalid;
std::mutex g_microphone_mutex;
bool g_foreground = true;
using starboard::shared::webos::MicrophoneReportState;
using starboard::shared::webos::MicrophoneStatus;
}  // namespace

namespace starboard { namespace shared { namespace webos {
void SetMicrophoneForeground(bool foreground) {
  std::lock_guard<std::mutex> lock(g_microphone_mutex);
  g_foreground = foreground;
  if (!foreground && g_microphone) {
    g_microphone->capture.Close();
    if (MicrophoneReportState().load() != MicrophoneStatus::kUnavailable)
      MicrophoneReportState().store(MicrophoneStatus::kStopped);
  }
}
}}}

int SbMicrophoneGetAvailable(SbMicrophoneInfo* infos, int capacity) {
  if (infos && capacity > 0) {
    std::memset(infos, 0, sizeof(*infos));
    infos->id = &kRemote;
    infos->type = kSbMicrophoneUnknown;
    infos->max_sample_rate_hz = 16000;
    infos->min_read_size = 320;
    std::strcpy(infos->label, "LG Magic Remote");
  }
  return 1;
}

bool SbMicrophoneIsSampleRateSupported(SbMicrophoneId id, int rate) {
  return id == &kRemote && rate == 16000;
}

SbMicrophone SbMicrophoneCreate(SbMicrophoneId id, int rate, int size) {
  std::lock_guard<std::mutex> lock(g_microphone_mutex);
  if (g_microphone || !SbMicrophoneIsSampleRateSupported(id, rate) ||
      size < 320 || size > 4 * 1024 * 1024)
    return kSbMicrophoneInvalid;
  return g_microphone = new SbMicrophonePrivate(size);
}

bool SbMicrophoneOpen(SbMicrophone microphone) {
  std::lock_guard<std::mutex> lock(g_microphone_mutex);
  if (!microphone || microphone != g_microphone) return false;
  if (!g_foreground) return false;
  MicrophoneReportState().store(MicrophoneStatus::kOpening);
  bool opened = microphone->capture.Open();
  MicrophoneReportState().store(opened ? MicrophoneStatus::kRecording : MicrophoneStatus::kUnavailable);
  microphone->error_reported = false;
  if (!opened)
    SB_LOG(WARNING) << "LG microphone unavailable";
  return opened;
}

int SbMicrophoneRead(SbMicrophone microphone, void* data, int size) {
  std::lock_guard<std::mutex> lock(g_microphone_mutex);
  if (!microphone || microphone != g_microphone || size < 0) return -1;
  int read = microphone->capture.Read(data, size);
  if (read < 0) MicrophoneReportState().store(microphone->capture.Error().empty() ? MicrophoneStatus::kStopped : MicrophoneStatus::kUnavailable);
  if (read < 0 && !microphone->error_reported && !microphone->capture.Error().empty()) {
    microphone->error_reported = true;
    SB_LOG(WARNING) << "LG microphone capture failed";
  }
  return read;
}

bool SbMicrophoneClose(SbMicrophone microphone) {
  std::lock_guard<std::mutex> lock(g_microphone_mutex);
  if (!microphone || microphone != g_microphone) return false;
  microphone->capture.Close();
  if (MicrophoneReportState().load() != MicrophoneStatus::kUnavailable) MicrophoneReportState().store(MicrophoneStatus::kStopped);
  return true;
}

void SbMicrophoneDestroy(SbMicrophone microphone) {
  std::lock_guard<std::mutex> lock(g_microphone_mutex);
  if (!microphone || microphone != g_microphone) return;
  delete microphone;
  if (MicrophoneReportState().load() != MicrophoneStatus::kUnavailable) MicrophoneReportState().store(MicrophoneStatus::kStopped);
  g_microphone = kSbMicrophoneInvalid;
}
