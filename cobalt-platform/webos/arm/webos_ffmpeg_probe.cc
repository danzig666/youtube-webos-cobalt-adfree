#include "starboard/webos/arm/webos_ffmpeg_probe.h"
#include "starboard/webos/arm/webos_aac_probe_fixture.h"
extern "C" {
#include "libavcodec/avcodec.h"
}
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <dlfcn.h>
#include <limits.h>
#include <string>
#include <sys/resource.h>

namespace starboard { namespace shared { namespace webos {
namespace {
std::string Clean(const char* text) {
  std::string result;
  if (text) for (size_t i = 0; text[i] && i < 240; ++i) {
    const unsigned char ch = text[i];
    result += ch >= 32 && ch < 127 ? ch : '?';
  }
  return result;
}
bool FirmwareSymbol(void* symbol, const char* label) {
  Dl_info info{}; char path[PATH_MAX], executable[PATH_MAX];
  if (!dladdr(symbol, &info) || !info.dli_fname || !realpath(info.dli_fname, path) ||
      !realpath("/proc/self/exe", executable)) {
    std::puts("resolved-path=unavailable; skipped"); return false;
  }
  std::printf("%s=%s\n", label, Clean(path).c_str());
  const std::string exe(executable);
  const std::string directory = exe.substr(0, exe.rfind('/')) + "/";
  if (std::string(path).compare(0, directory.size(), directory) == 0) {
    std::puts("not-firmware=app-local; skipped"); return false;
  }
  return true;
}
bool InspectFrame(const AVFrame* frame, double* energy) {
  if (!frame || frame->sample_rate != 48000 || frame->channels != 2 ||
      frame->nb_samples <= 0 || frame->nb_samples > 4096 || !frame->extended_data) return false;
  const bool floating = frame->format == AV_SAMPLE_FMT_FLT || frame->format == AV_SAMPLE_FMT_FLTP;
  const bool signed32 = frame->format == AV_SAMPLE_FMT_S32 || frame->format == AV_SAMPLE_FMT_S32P;
  const bool planar = frame->format == AV_SAMPLE_FMT_FLTP || frame->format == AV_SAMPLE_FMT_S16P || frame->format == AV_SAMPLE_FMT_S32P;
  if (!floating && !signed32 && frame->format != AV_SAMPLE_FMT_S16 && frame->format != AV_SAMPLE_FMT_S16P) return false;
  const int bytes = floating || signed32 ? 4 : 2;
  if (frame->linesize[0] < frame->nb_samples * bytes * (planar ? 1 : 2)) return false;
  for (int channel = 0; channel < 2; ++channel) {
    const auto* data = frame->extended_data[planar ? channel : 0];
    if (!data) return false;
    for (int sample = 0; sample < frame->nb_samples; ++sample) {
      const int offset = bytes * (planar ? sample : sample * 2 + channel);
      double value;
      if (floating) { float pcm; std::memcpy(&pcm, data + offset, sizeof(pcm)); value = pcm; }
      else if (signed32) { int32_t pcm; std::memcpy(&pcm, data + offset, sizeof(pcm)); value = pcm / 2147483648.0; }
      else { int16_t pcm; std::memcpy(&pcm, data + offset, sizeof(pcm)); value = pcm / 32768.0; }
      if (!std::isfinite(value) || std::fabs(value) > 16) return false;
      *energy += std::fabs(value);
    }
  }
  return true;
}
}
int RunFirmwareFfmpegProbe(const char* codec_path, const char* util_path) {
  const rlimit no_core{0, 0}; setrlimit(RLIMIT_CORE, &no_core);
  std::setvbuf(stdout, nullptr, _IONBF, 0);
  std::puts("FFmpeg firmware AAC probe (no audio output; playback unchanged)");
  void* util = dlopen(util_path, RTLD_NOW | RTLD_LOCAL);
  if (!util) { std::printf("avutil-load-error=%s\n", Clean(dlerror()).c_str()); return 0; }
#define SYMBOL(library, name) \
  const auto name##_fn = reinterpret_cast<decltype(&name)>(dlsym(library, #name)); \
  if (!name##_fn) { std::puts("missing-symbol=" #name); return 0; }
  SYMBOL(util, avutil_version)
  const unsigned util_version = avutil_version_fn();
  std::printf("avutil-version=%u.%u.%u\n", util_version >> 16, (util_version >> 8) & 255, util_version & 255);
  if ((util_version >> 16) != 57) { std::puts("unsupported-avutil-ABI; skipped"); return 0; }
  if (!FirmwareSymbol(reinterpret_cast<void*>(avutil_version_fn), "avutil-resolved")) return 0;
  void* codec_library = dlopen(codec_path, RTLD_NOW | RTLD_LOCAL);
  if (!codec_library) { std::printf("avcodec-load-error=%s\n", Clean(dlerror()).c_str()); return 0; }
  SYMBOL(codec_library, avcodec_version)
  const unsigned codec_version = avcodec_version_fn();
  std::printf("avcodec-version=%u.%u.%u\n", codec_version >> 16, (codec_version >> 8) & 255, codec_version & 255);
  if ((codec_version >> 16) != 59) { std::puts("unsupported-avcodec-ABI; skipped"); return 0; }
  if (!FirmwareSymbol(reinterpret_cast<void*>(avcodec_version_fn), "avcodec-resolved")) return 0;
  SYMBOL(codec_library, avcodec_find_decoder)
  SYMBOL(codec_library, avcodec_alloc_context3)
  SYMBOL(codec_library, avcodec_open2)
  SYMBOL(codec_library, avcodec_free_context)
  SYMBOL(codec_library, avcodec_send_packet)
  SYMBOL(codec_library, avcodec_receive_frame)
  SYMBOL(codec_library, av_packet_alloc)
  SYMBOL(codec_library, av_packet_free)
  SYMBOL(codec_library, av_packet_unref)
  SYMBOL(codec_library, av_new_packet)
  SYMBOL(util, av_frame_alloc)
  SYMBOL(util, av_frame_free)
  SYMBOL(util, av_frame_unref)
  SYMBOL(util, av_strerror)
#undef SYMBOL
  const AVCodec* codec = avcodec_find_decoder_fn(AV_CODEC_ID_AAC);
  if (!codec) { std::puts("aac-decoder=not-available"); return 0; }
  std::printf("aac-decoder=%s\n", Clean(codec->name).c_str());
  auto failure = [&](const char* stage, int error) {
    char message[128]{}; av_strerror_fn(error, message, sizeof(message));
    std::printf("%s-error=%d %s\n", stage, error, Clean(message).c_str());
  };
  for (int pass = 0; pass < 2; ++pass) {
    AVCodecContext* context = avcodec_alloc_context3_fn(codec);
    AVFrame* frame = av_frame_alloc_fn();
    AVPacket* packet = av_packet_alloc_fn();
    if (!context || !frame || !packet) { std::puts("allocation-failed"); return 0; }
    int error = avcodec_open2_fn(context, codec, nullptr);
    if (error < 0) { failure("open", error); return 0; }
    unsigned frames = 0; double energy = 0;
    auto receive = [&]() {
      for (int attempt = 0; attempt < 64; ++attempt) {
        const int status = avcodec_receive_frame_fn(context, frame);
        if (status == AVERROR(EAGAIN) || status == AVERROR_EOF) return status;
        if (status < 0) { failure("receive", status); return status; }
        const bool valid = InspectFrame(frame, &energy);
        av_frame_unref_fn(frame);
        if (!valid) { std::puts("invalid-PCM-format-or-content"); return AVERROR_INVALIDDATA; }
        ++frames;
      }
      std::puts("receive-limit"); return AVERROR_INVALIDDATA;
    };
    for (size_t offset = 0; offset < sizeof(kAacProbeFixture);) {
      if (offset + 7 > sizeof(kAacProbeFixture)) return 1;
      const auto* p = kAacProbeFixture + offset;
      const int length = ((p[3] & 3) << 11) | (p[4] << 3) | (p[5] >> 5);
      if (length < 7 || offset + length > sizeof(kAacProbeFixture)) return 1;
      error = av_new_packet_fn(packet, length);
      if (error < 0) { failure("packet-allocation", error); return 0; }
      std::memcpy(packet->data, p, length);
      error = avcodec_send_packet_fn(context, packet);
      if (error == AVERROR(EAGAIN)) {
        if (receive() != AVERROR(EAGAIN)) return 0;
        error = avcodec_send_packet_fn(context, packet);
      }
      av_packet_unref_fn(packet);
      if (error < 0) { failure("send", error); return 0; }
      if (receive() != AVERROR(EAGAIN)) return 0;
      offset += length;
    }
    error = avcodec_send_packet_fn(context, nullptr);
    if (error < 0) { failure("flush", error); return 0; }
    if (receive() != AVERROR_EOF || frames < 8 || energy <= 0) {
      std::puts("decode=failed-or-silent"); return 0;
    }
    std::printf("pass=%d frames=%u sample-rate=48000 channels=2 non-silent=yes\n", pass + 1, frames);
    av_packet_free_fn(&packet); av_frame_free_fn(&frame); avcodec_free_context_fn(&context);
  }
  std::puts("decode=PASS firmware FFmpeg AAC; recreated twice and drained EOS");
  return 0;
}
}}}
