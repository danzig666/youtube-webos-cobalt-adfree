#ifndef STARBOARD_WEBOS_ARM_WEBOS_FIRMWARE_AAC_H_
#define STARBOARD_WEBOS_ARM_WEBOS_FIRMWARE_AAC_H_
#include <cstdint>
#include <memory>
#include <vector>
namespace starboard { namespace shared { namespace webos {
struct FirmwareAudioFrame {
  int channels;
  int sample_rate;
  int64_t timestamp;
  std::vector<float> samples;
};
// Private FFmpeg ABI implementation; no FFmpeg types escape this interface.
class FirmwareAac {
 public:
  FirmwareAac();
  ~FirmwareAac();
  bool valid() const;
  bool Decode(const uint8_t* data, int size, int64_t timestamp,
              std::vector<FirmwareAudioFrame>* output);
  bool Drain(std::vector<FirmwareAudioFrame>* output);
 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
}}}
#endif
