#include "starboard/webos/arm/webos_firmware_aac.h"
extern "C" {
#include "libavcodec/avcodec.h"
}
#include <cmath>
#include <cstring>
#include <dlfcn.h>
namespace starboard { namespace shared { namespace webos {
struct FirmwareAac::Impl {
  void* util = nullptr;
  void* codec = nullptr;
  AVCodecContext* context = nullptr;
  AVPacket* packet = nullptr;
  AVFrame* frame = nullptr;
  decltype(&avcodec_version) avcodec_version_fn = nullptr;
  decltype(&avcodec_find_decoder) avcodec_find_decoder_fn = nullptr;
  decltype(&avcodec_alloc_context3) avcodec_alloc_context3_fn = nullptr;
  decltype(&avcodec_open2) avcodec_open2_fn = nullptr;
  decltype(&avcodec_free_context) avcodec_free_context_fn = nullptr;
  decltype(&avcodec_send_packet) avcodec_send_packet_fn = nullptr;
  decltype(&avcodec_receive_frame) avcodec_receive_frame_fn = nullptr;
  decltype(&av_packet_alloc) av_packet_alloc_fn = nullptr;
  decltype(&av_packet_free) av_packet_free_fn = nullptr;
  decltype(&av_packet_unref) av_packet_unref_fn = nullptr;
  decltype(&av_new_packet) av_new_packet_fn = nullptr;
  decltype(&avutil_version) avutil_version_fn = nullptr;
  decltype(&av_frame_alloc) av_frame_alloc_fn = nullptr;
  decltype(&av_frame_free) av_frame_free_fn = nullptr;
  decltype(&av_frame_unref) av_frame_unref_fn = nullptr;
  ~Impl() {
    if (packet) av_packet_free_fn(&packet);
    if (frame) av_frame_free_fn(&frame);
    if (context) avcodec_free_context_fn(&context);
    if (codec) dlclose(codec);
    if (util) dlclose(util);
  }
  bool Open() {
    // Fixed firmware paths prevent accidentally selecting app-local libraries.
    util = dlopen("/usr/lib/libavutil.so.57", RTLD_NOW | RTLD_LOCAL);
    if (!util) return false;
    avutil_version_fn = reinterpret_cast<decltype(avutil_version_fn)>(dlsym(util, "avutil_version"));
    if (!avutil_version_fn) return false;
    av_frame_alloc_fn = reinterpret_cast<decltype(av_frame_alloc_fn)>(dlsym(util, "av_frame_alloc"));
    if (!av_frame_alloc_fn) return false;
    av_frame_free_fn = reinterpret_cast<decltype(av_frame_free_fn)>(dlsym(util, "av_frame_free"));
    if (!av_frame_free_fn) return false;
    av_frame_unref_fn = reinterpret_cast<decltype(av_frame_unref_fn)>(dlsym(util, "av_frame_unref"));
    if (!av_frame_unref_fn) return false;
    if ((avutil_version_fn() >> 16) != 57) return false;
    codec = dlopen("/usr/lib/libavcodec.so.59", RTLD_NOW | RTLD_LOCAL);
    if (!codec) return false;
    avcodec_version_fn = reinterpret_cast<decltype(avcodec_version_fn)>(dlsym(codec, "avcodec_version"));
    if (!avcodec_version_fn) return false;
    avcodec_find_decoder_fn = reinterpret_cast<decltype(avcodec_find_decoder_fn)>(dlsym(codec, "avcodec_find_decoder"));
    if (!avcodec_find_decoder_fn) return false;
    avcodec_alloc_context3_fn = reinterpret_cast<decltype(avcodec_alloc_context3_fn)>(dlsym(codec, "avcodec_alloc_context3"));
    if (!avcodec_alloc_context3_fn) return false;
    avcodec_open2_fn = reinterpret_cast<decltype(avcodec_open2_fn)>(dlsym(codec, "avcodec_open2"));
    if (!avcodec_open2_fn) return false;
    avcodec_free_context_fn = reinterpret_cast<decltype(avcodec_free_context_fn)>(dlsym(codec, "avcodec_free_context"));
    if (!avcodec_free_context_fn) return false;
    avcodec_send_packet_fn = reinterpret_cast<decltype(avcodec_send_packet_fn)>(dlsym(codec, "avcodec_send_packet"));
    if (!avcodec_send_packet_fn) return false;
    avcodec_receive_frame_fn = reinterpret_cast<decltype(avcodec_receive_frame_fn)>(dlsym(codec, "avcodec_receive_frame"));
    if (!avcodec_receive_frame_fn) return false;
    av_packet_alloc_fn = reinterpret_cast<decltype(av_packet_alloc_fn)>(dlsym(codec, "av_packet_alloc"));
    if (!av_packet_alloc_fn) return false;
    av_packet_free_fn = reinterpret_cast<decltype(av_packet_free_fn)>(dlsym(codec, "av_packet_free"));
    if (!av_packet_free_fn) return false;
    av_packet_unref_fn = reinterpret_cast<decltype(av_packet_unref_fn)>(dlsym(codec, "av_packet_unref"));
    if (!av_packet_unref_fn) return false;
    av_new_packet_fn = reinterpret_cast<decltype(av_new_packet_fn)>(dlsym(codec, "av_new_packet"));
    if (!av_new_packet_fn) return false;
    if ((avcodec_version_fn() >> 16) != 59) return false;
    const AVCodec* decoder = avcodec_find_decoder_fn(AV_CODEC_ID_AAC);
    if (!decoder) return false;
    context = avcodec_alloc_context3_fn(decoder);
    frame = av_frame_alloc_fn(); packet = av_packet_alloc_fn();
    if (!context || !frame || !packet) return false;
    context->pkt_timebase = AVRational{1, 1000000};
    context->thread_count = 1;
    return avcodec_open2_fn(context, decoder, nullptr) >= 0;
  }
  int Receive(std::vector<FirmwareAudioFrame>* output) {
    for (int attempt = 0; attempt < 64; ++attempt) {
      int status = avcodec_receive_frame_fn(context, frame);
      if (status < 0) return status;
      const int channels = frame->channels;
      const int count = frame->nb_samples;
      const bool floating = frame->format == AV_SAMPLE_FMT_FLT || frame->format == AV_SAMPLE_FMT_FLTP;
      const bool s32 = frame->format == AV_SAMPLE_FMT_S32 || frame->format == AV_SAMPLE_FMT_S32P;
      const bool s16 = frame->format == AV_SAMPLE_FMT_S16 || frame->format == AV_SAMPLE_FMT_S16P;
      const bool planar = frame->format == AV_SAMPLE_FMT_FLTP || frame->format == AV_SAMPLE_FMT_S32P || frame->format == AV_SAMPLE_FMT_S16P;
      const int bytes = s16 ? 2 : 4;
      if (channels < 1 || channels > 8 || count < 1 || count > 4096 ||
          frame->sample_rate < 8000 || frame->sample_rate > 192000 ||
          (!floating && !s32 && !s16) || !frame->extended_data ||
          frame->pts == AV_NOPTS_VALUE || frame->pts < 0 ||
          frame->linesize[0] < count * bytes * (planar ? 1 : channels)) return AVERROR_INVALIDDATA;
      FirmwareAudioFrame out{channels, frame->sample_rate, frame->pts, {}};
      out.samples.resize(count * channels);
      for (int ch = 0; ch < channels; ++ch) {
        const uint8_t* data = frame->extended_data[planar ? ch : 0];
        if (!data) return AVERROR_INVALIDDATA;
        for (int i = 0; i < count; ++i) {
          const auto* src = data + bytes * (planar ? i : i * channels + ch);
          float value;
          if (floating) std::memcpy(&value, src, 4);
          else if (s32) { int32_t v; std::memcpy(&v, src, 4); value = v / 2147483648.0f; }
          else { int16_t v; std::memcpy(&v, src, 2); value = v / 32768.0f; }
          if (!std::isfinite(value)) return AVERROR_INVALIDDATA;
          out.samples[i * channels + ch] = value;
        }
      }
      output->push_back(std::move(out));
      av_frame_unref_fn(frame);
    }
    return AVERROR_INVALIDDATA;
  }
  bool Send(const uint8_t* data, int size, int64_t timestamp,
            std::vector<FirmwareAudioFrame>* output) {
    if (data) {
      if (size <= 0 || size > 1024 * 1024 || timestamp < 0 ||
          av_new_packet_fn(packet, size) < 0) return false;
      std::memcpy(packet->data, data, size);
      packet->pts = timestamp; packet->dts = timestamp;
    }
    int status = avcodec_send_packet_fn(context, data ? packet : nullptr);
    if (status == AVERROR(EAGAIN)) {
      if (Receive(output) != AVERROR(EAGAIN)) { av_packet_unref_fn(packet); return false; }
      status = avcodec_send_packet_fn(context, data ? packet : nullptr);
    }
    av_packet_unref_fn(packet);
    if (status < 0) return false;
    status = Receive(output);
    return status == (data ? AVERROR(EAGAIN) : AVERROR_EOF);
  }
};
FirmwareAac::FirmwareAac() : impl_(new Impl) {
  if (!impl_->Open()) impl_.reset();
}
FirmwareAac::~FirmwareAac() = default;
bool FirmwareAac::valid() const { return !!impl_; }
bool FirmwareAac::Decode(const uint8_t* data, int size, int64_t timestamp,
                         std::vector<FirmwareAudioFrame>* output) {
  return valid() && data && impl_->Send(data, size, timestamp, output);
}
bool FirmwareAac::Drain(std::vector<FirmwareAudioFrame>* output) {
  return valid() && impl_->Send(nullptr, 0, 0, output);
}
}}}
