#include "starboard/webos/arm/webos_aac_probe.h"
#include "starboard/webos/arm/webos_aac_probe_fixture.h"
#include "starboard/webos/arm/webos_capability_process.h"
#include "third_party/libfdkaac/include/aacdecoder_lib.h"
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <dirent.h>
#include <dlfcn.h>
#include <elf.h>
#include <limits.h>
#include <set>
#include <sys/resource.h>
#include <vector>

namespace starboard { namespace shared { namespace webos {
namespace {
std::string Clean(const char* value) {
  std::string out;
  if (value) for (size_t i = 0; value[i] && i < 240; ++i) {
    const unsigned char ch = value[i];
    out += ch >= 32 && ch < 127 ? ch : '?';
  }
  return out;
}
bool LibraryName(const std::string& name, const char* prefix) {
  const size_t n = std::strlen(prefix);
  if (name.compare(0, n, prefix) != 0) return false;
  for (size_t i = n; i < name.size(); ++i)
    if (name[i] != '.' && (name[i] < '0' || name[i] > '9')) return false;
  return true;
}
std::string Architecture(const char* path) {
  unsigned char header[20]{};
  FILE* file = std::fopen(path, "rb");
  if (!file) return "unreadable";
  const size_t read = std::fread(header, 1, sizeof(header), file);
  std::fclose(file);
  if (read != sizeof(header) || std::memcmp(header, ELFMAG, SELFMAG)) return "not ELF";
  const int machine = header[EI_DATA] == ELFDATA2LSB
      ? header[18] | (header[19] << 8) : (header[18] << 8) | header[19];
  return std::string(header[EI_CLASS] == ELFCLASS32 ? "32-bit" : "64-bit") +
      " machine=" + std::to_string(machine);
}
bool Bundled(void* symbol, std::string* path) {
  Dl_info info{};
  if (!dladdr(symbol, &info) || !info.dli_fname) return true;
  char resolved[PATH_MAX], executable[PATH_MAX];
  if (!realpath(info.dli_fname, resolved) || !realpath("/proc/self/exe", executable)) return true;
  *path = resolved;
  const std::string exe(executable);
  const std::string directory = exe.substr(0, exe.rfind('/')) + "/";
  return path->compare(0, directory.size(), directory) == 0;
}
}

std::string GetFirmwareAacProbeReport() {
  std::string report = "Firmware AAC investigation (playback decoder unchanged)\n";
  std::set<std::string> candidates;
  size_t listed = 0;
  // Read only public library directories. Do not inspect app/account storage.
  for (const char* directory : {"/lib", "/usr/lib", "/lib32", "/usr/lib32",
       "/usr/lib/arm-linux-gnueabi", "/lib/arm-linux-gnueabi", "/usr/lib/lib32"}) {
    DIR* dir = opendir(directory);
    if (!dir) continue;
    size_t entries = 0;
    while (const auto* entry = readdir(dir)) {
      if (++entries > 8192) break;
      const std::string name(entry->d_name);
      const bool fdk = LibraryName(name, "libfdk-aac.so");
      if (!fdk && !LibraryName(name, "libavcodec.so") &&
          !LibraryName(name, "libavutil.so") && !LibraryName(name, "libavformat.so")) continue;
      const std::string path = std::string(directory) + "/" + name;
      if (listed++ < 24) report += path + ": " + Architecture(path.c_str()) + "\n";
      if (fdk && candidates.size() < 6) candidates.insert(path);
    }
    closedir(dir);
  }
  if (!listed) report += "No matching FDK/FFmpeg files found in scanned directories.\n";
  if (listed > 24) report += "Library listing truncated.\n";
  report += "FFmpeg 59 decoding is tested separately below.\n";
  // Also exercise the process's loader search path, including versioned SONAMEs.
  for (const char* name : {"libfdk-aac.so.2", "libfdk-aac.so.1", "libfdk-aac.so"}) candidates.insert(name);
  const char* ffmpeg_args[] = {"/proc/self/exe", "--ytaf-ffmpeg-aac-probe", nullptr};
  const auto ffmpeg = RunCapabilityProcess(const_cast<char* const*>(ffmpeg_args), 2500, 4096);
  report += "\nFFmpeg 59 AAC test [" + ffmpeg.status + "]\n" + ffmpeg.output;
  for (const auto& candidate : candidates) {
    const char* args[] = {"/proc/self/exe", "--ytaf-aac-probe", candidate.c_str(), nullptr};
    const auto result = RunCapabilityProcess(const_cast<char* const*>(args), 1500, 1024);
    report += "\n" + candidate + " [" + result.status + "]\n" + result.output;
  }
  report += "\nA fixture decode pass is not yet validation of live playback, seeking or A/V sync.\n";
  return report;
}

int RunFirmwareAacProbe(const char* candidate) {
  // Executed before Cobalt/SDL startup, in a disposable process. Never changes
  // the parent loader, decoder choice, audio sink or saved settings.
  const rlimit no_core{0, 0};
  setrlimit(RLIMIT_CORE, &no_core);
  std::setvbuf(stdout, nullptr, _IONBF, 0);
  std::printf("load=%s\n", Clean(candidate).c_str());
  void* library = dlopen(candidate, RTLD_NOW | RTLD_LOCAL);
  if (!library) { std::printf("load-error=%s\n", Clean(dlerror()).c_str()); return 0; }
  void* open_symbol = dlsym(library, "aacDecoder_Open");
  std::string path;
  if (!open_symbol) { std::puts("missing-symbol=aacDecoder_Open"); return 0; }
  const bool bundled = Bundled(open_symbol, &path);
  std::printf("resolved=%s\n", Clean(path.c_str()).c_str());
  if (bundled) { std::puts("not-firmware=app-local-or-unresolved; skipped"); return 0; }
#define AAC_SYMBOL(name) \
  const auto name##_fn = reinterpret_cast<decltype(&name)>(dlsym(library, #name)); \
  if (!name##_fn) { std::puts("missing-symbol=" #name); return 0; } \
  (void)name##_fn;
  AAC_SYMBOL(aacDecoder_Open)
  AAC_SYMBOL(aacDecoder_Close)
  AAC_SYMBOL(aacDecoder_SetParam)
  AAC_SYMBOL(aacDecoder_GetStreamInfo)
  AAC_SYMBOL(aacDecoder_ConfigRaw)
  AAC_SYMBOL(aacDecoder_AncDataInit)
  AAC_SYMBOL(aacDecoder_Fill)
  AAC_SYMBOL(aacDecoder_DecodeFrame)
#undef AAC_SYMBOL
  for (int pass = 0; pass < 2; ++pass) {
    HANDLE_AACDECODER decoder = aacDecoder_Open_fn(TT_MP4_ADTS, 1);
    if (!decoder) { std::puts("decode=open-failed"); return 0; }
    bool good = aacDecoder_SetParam_fn(decoder, AAC_PCM_MAX_OUTPUT_CHANNELS, 0) == AAC_DEC_OK;
    unsigned frames = 0; unsigned long long energy = 0;
    for (size_t offset = 0; good && offset + 7 <= sizeof(kAacProbeFixture);) {
      const auto* p = kAacProbeFixture + offset;
      const UINT length = ((p[3] & 3) << 11) | (p[4] << 3) | (p[5] >> 5);
      if (length < 7 || offset + length > sizeof(kAacProbeFixture)) { good = false; break; }
      unsigned char packet[2048];
      if (length > sizeof(packet)) { good = false; break; }
      std::memcpy(packet, p, length);
      unsigned char* input = packet; UINT remaining = length;
      AAC_DECODER_ERROR error = aacDecoder_Fill_fn(decoder, &input, &length, &remaining);
      INT_PCM pcm[2048 * 8]{};
      if (error == AAC_DEC_OK && remaining == 0)
        error = aacDecoder_DecodeFrame_fn(decoder, pcm, 2048 * 8, 0);
      else good = false;
      if (!good || error != AAC_DEC_OK) {
        std::printf("decode-error=%d remaining=%u\n", static_cast<int>(error), remaining);
        good = false; break;
      }
      const CStreamInfo* info = aacDecoder_GetStreamInfo_fn(decoder);
      if (!info || info->sampleRate != 48000 || info->numChannels != 2 ||
          info->frameSize <= 0 || info->frameSize > 2048) { good = false; break; }
      for (int i = 0; i < info->frameSize * 2; ++i) {
        const int sample = pcm[i]; energy += sample < 0 ? -sample : sample;
      }
      ++frames; offset += length;
    }
    aacDecoder_Close_fn(decoder);
    if (!good || frames < 8 || !energy) { std::puts("decode=failed"); return 0; }
  }
  std::puts("decode=PASS AAC-LC 48000Hz stereo; recreated twice; firmware candidate");
  // Process exit owns library teardown, including any vendor background work.
  return 0;
}
}}}
