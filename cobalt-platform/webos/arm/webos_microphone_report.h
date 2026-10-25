#ifndef STARBOARD_WEBOS_ARM_WEBOS_MICROPHONE_REPORT_H_
#define STARBOARD_WEBOS_ARM_WEBOS_MICROPHONE_REPORT_H_
#include <string>
#include <atomic>
namespace starboard { namespace shared { namespace webos {
void SetMicrophoneForeground(bool foreground);
enum class MicrophoneStatus { kNotStarted, kOpening, kRecording, kUnavailable, kStopped };
inline std::atomic<MicrophoneStatus>& MicrophoneReportState() {
  static std::atomic<MicrophoneStatus> state{MicrophoneStatus::kNotStarted};
  return state;
}
inline std::string CopyMicrophoneReport() {
  const char* status = "Not started";
  switch (MicrophoneReportState().load()) {
    case MicrophoneStatus::kNotStarted: break;
    case MicrophoneStatus::kOpening: status = "Opening"; break;
    case MicrophoneStatus::kRecording: status = "Recording"; break;
    case MicrophoneStatus::kUnavailable: status = "Unavailable"; break;
    case MicrophoneStatus::kStopped: status = "Stopped"; break;
  }
  return std::string("Magic Remote microphone: ") + status + "\n";
}
}}}
#endif
