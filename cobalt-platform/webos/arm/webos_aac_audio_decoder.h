#ifndef STARBOARD_WEBOS_ARM_WEBOS_AAC_AUDIO_DECODER_H_
#define STARBOARD_WEBOS_ARM_WEBOS_AAC_AUDIO_DECODER_H_
#include <memory>
#include <queue>
#include "starboard/shared/starboard/player/filter/audio_decoder_internal.h"
#include "starboard/shared/starboard/player/job_queue.h"
#include "starboard/webos/arm/webos_firmware_aac.h"
namespace starboard { namespace shared { namespace webos {
class WebOsAacAudioDecoder : public shared::starboard::player::filter::AudioDecoder,
                            private shared::starboard::player::JobQueue::JobOwner {
 public:
  WebOsAacAudioDecoder();
  ~WebOsAacAudioDecoder() override;
  void Initialize(const OutputCB&, const ErrorCB&) override;
  void Decode(const InputBuffers&, const ConsumedCB&) override;
  void WriteEndOfStream() override;
  scoped_refptr<DecodedAudio> Read(int*) override;
  void Reset() override;
 private:
  void SelectDecoder();
  bool SelectFallback();
  void ReplayFallback(const ConsumedCB&);
  InputBuffers startup_inputs_;
  size_t replay_index_ = 0;
  bool produced_output_ = false;
  void Output(const std::vector<FirmwareAudioFrame>&);
  OutputCB output_cb_;
  ErrorCB error_cb_;
  std::unique_ptr<FirmwareAac> firmware_;
  std::unique_ptr<AudioDecoder> fallback_;
  std::queue<std::pair<scoped_refptr<DecodedAudio>, int>> output_;
  bool ended_ = false;
  bool unavailable_ = false;
  int sample_rate_ = 48000;
};
}}}
#endif
