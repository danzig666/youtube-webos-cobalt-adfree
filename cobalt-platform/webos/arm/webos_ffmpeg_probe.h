#ifndef STARBOARD_WEBOS_ARM_WEBOS_FFMPEG_PROBE_H_
#define STARBOARD_WEBOS_ARM_WEBOS_FFMPEG_PROBE_H_
namespace starboard { namespace shared { namespace webos {
// Explicit paths are supplied only by the fixed native CLI or host harness.
int RunFirmwareFfmpegProbe(const char* codec_path, const char* util_path);
}}}
#endif
