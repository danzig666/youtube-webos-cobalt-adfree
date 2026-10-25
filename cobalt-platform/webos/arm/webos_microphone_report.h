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
// Only static operation names and numeric codes enter these fields, never
// service messages, recordings, tickets or URLs.
inline std::atomic<const char*>& MicrophoneDetail() {
  static std::atomic<const char*> detail{"No capture requested"}; return detail;
}
inline std::atomic<int>& MicrophoneErrorCode() {
  static std::atomic<int> code{0}; return code;
}
inline std::atomic<unsigned>& MicrophoneAudioBytes() {
  static std::atomic<unsigned> bytes{0}; return bytes;
}
inline std::atomic<bool>& MicrophoneNonSilent() {
  static std::atomic<bool> value{false}; return value;
}
inline void SetMicrophoneDetail(const char* detail, int code = 0) {
  MicrophoneErrorCode().store(code >= -100000 && code <= 100000 ? code : -1);
  MicrophoneDetail().store(detail);
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
  const int code = MicrophoneErrorCode().load();
  return std::string("Magic Remote microphone: ") + status + "\nMicrophone detail: " +
      MicrophoneDetail().load() + (code ? " (code " + std::to_string(code) + ")" : "") +
      "\nMicrophone audio bytes: " + std::to_string(MicrophoneAudioBytes().load()) +
      "; non-silent: " + (MicrophoneNonSilent().load() ? "yes" : "no") + "\n";
}
}}}
#endif
