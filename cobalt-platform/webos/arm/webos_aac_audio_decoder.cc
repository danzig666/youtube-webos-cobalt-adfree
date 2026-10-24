#include "starboard/webos/arm/webos_aac_audio_decoder.h"
#include <cstdlib>
#include <cstring>
#include "starboard/common/log.h"
#include "starboard/shared/libfdkaac/fdk_aac_audio_decoder.h"
#include "starboard/webos/arm/webos_media_diagnostics.h"
namespace starboard { namespace shared { namespace webos {
WebOsAacAudioDecoder::WebOsAacAudioDecoder() = default;
WebOsAacAudioDecoder::~WebOsAacAudioDecoder() { CancelPendingJobs(); }
void WebOsAacAudioDecoder::SelectFallback() {
  firmware_.reset();
  fallback_.reset(new shared::libfdkaac::FdkAacAudioDecoder);
  fallback_->Initialize(output_cb_, error_cb_);
  SB_LOG(INFO) << "YTAF AAC decoder: bundled FDK fallback";
}
void WebOsAacAudioDecoder::SelectDecoder() {
  const char* override = std::getenv("YTAF_AAC_DECODER");
  if (override && !std::strcmp(override, "fdk")) { SelectFallback(); return; }
  firmware_.reset(new FirmwareAac);
  if (!firmware_->valid()) { SelectFallback(); return; }
  RecordAudioDecoderSelection(MediaCodec::kAac, AudioDecoderBackend::kFirmwareFfmpeg);
  SB_LOG(INFO) << "YTAF AAC decoder: firmware FFmpeg 59";
}
void WebOsAacAudioDecoder::Initialize(const OutputCB& output, const ErrorCB& error) {
  output_cb_ = output; error_cb_ = error;
  SelectDecoder();
}
void WebOsAacAudioDecoder::Output(const std::vector<FirmwareAudioFrame>& frames) {
  for (const auto& frame : frames) {
    sample_rate_ = frame.sample_rate;
    scoped_refptr<DecodedAudio> audio(new DecodedAudio(
        frame.channels, kSbMediaAudioSampleTypeFloat32,
        kSbMediaAudioFrameStorageTypeInterleaved, frame.timestamp,
        frame.samples.size() * sizeof(float)));
    std::memcpy(audio->buffer(), frame.samples.data(), audio->size());
    output_.push({audio, frame.sample_rate});
    Schedule(output_cb_);
  }
}
void WebOsAacAudioDecoder::Decode(const InputBuffers& inputs, const ConsumedCB& consumed) {
  if (ended_) return;
  if (fallback_) { fallback_->Decode(inputs, consumed); return; }
  if (!produced_output_) startup_inputs_.insert(startup_inputs_.end(), inputs.begin(), inputs.end());
  for (const auto& input : inputs) {
    std::vector<FirmwareAudioFrame> frames;
    if (!firmware_->Decode(input->data(), input->size(), input->timestamp(), &frames)) {
      RecordAudioDecoderFailure(MediaCodec::kAac, 0, false, AudioDecoderBackend::kFirmwareFfmpeg);
      if (!produced_output_) {
        SelectFallback(); ReplayFallback(consumed); return;
      }
      Schedule(std::bind(error_cb_, kSbPlayerErrorDecode,
                        "Firmware FFmpeg AAC decode failed; YTAF_AAC_DECODER=fdk selects bundled decoder"));
      return;
    }
    if (!frames.empty()) { produced_output_ = true; startup_inputs_.clear(); }
    Output(frames);
  }
  if (!produced_output_ && startup_inputs_.size() >= 32) {
    SelectFallback(); ReplayFallback(consumed); return;
  }
  Schedule(consumed);
}
void WebOsAacAudioDecoder::ReplayFallback(const ConsumedCB& consumed) {
  if (replay_index_ == startup_inputs_.size()) {
    startup_inputs_.clear(); replay_index_ = 0; Schedule(consumed); return;
  }
  InputBuffers one{startup_inputs_[replay_index_++]};
  fallback_->Decode(one, std::bind(&WebOsAacAudioDecoder::ReplayFallback, this, consumed));
}
void WebOsAacAudioDecoder::WriteEndOfStream() {
  if (ended_) return;
  ended_ = true;
  if (fallback_) { fallback_->WriteEndOfStream(); return; }
  std::vector<FirmwareAudioFrame> frames;
  if (!firmware_->Drain(&frames)) {
    Schedule(std::bind(error_cb_, kSbPlayerErrorDecode, "Firmware FFmpeg AAC drain failed"));
    return;
  }
  Output(frames);
  output_.push({scoped_refptr<DecodedAudio>(new DecodedAudio), sample_rate_});
  Schedule(output_cb_);
}
scoped_refptr<WebOsAacAudioDecoder::DecodedAudio> WebOsAacAudioDecoder::Read(int* rate) {
  if (fallback_) return fallback_->Read(rate);
  if (output_.empty()) return nullptr;
  auto result = output_.front(); output_.pop(); *rate = result.second;
  return result.first;
}
void WebOsAacAudioDecoder::Reset() {
  CancelPendingJobs();
  output_ = decltype(output_)(); ended_ = false;
  startup_inputs_.clear(); replay_index_ = 0; produced_output_ = false;
  // Recreate the decoder to discard delayed PCM and timestamps on seek.
  fallback_.reset(); firmware_.reset(); SelectDecoder();
}
}}}
