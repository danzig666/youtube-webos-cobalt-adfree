#include "webos_media_capabilities.h"

#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <mutex>
#include <string>
#include <vector>
#include <unistd.h>

#include "starboard/configuration_constants.h"
#include "starboard/system.h"

namespace starboard { namespace shared { namespace webos {
namespace {
std::mutex preference_mutex;
std::string PreferencePath() {
  std::vector<char> directory(kSbFileMaxPath, '\0');
  if (!SbSystemGetPath(kSbSystemPathStorageDirectory, directory.data(), directory.size()))
    return {};
  return std::string(directory.data()) + "/ytaf-video-capabilities";
}
}

CapabilityTier GetSavedVideoCapabilityTier() {
  std::lock_guard<std::mutex> lock(preference_mutex);
  const std::string path = PreferencePath();
  if (path.empty()) return CapabilityTier::kSafe;
  FILE* file = std::fopen(path.c_str(), "rb");
  if (!file) return CapabilityTier::kSafe;
  char data[16];
  const size_t count = std::fread(data, 1, sizeof(data), file);
  const bool failed = std::ferror(file) != 0;
  std::fclose(file);
  if (failed || count == sizeof(data)) return CapabilityTier::kSafe;
  const std::string value(data, count);
  const auto tier = ParseVideoCapabilityTier(value.c_str());
  // Reject trailing bytes and embedded NULs, including corrupted preferences.
  return value == VideoCapabilityTierName(tier) ? tier : CapabilityTier::kSafe;
}

bool SaveVideoCapabilityTier(unsigned value) {
  if (value > static_cast<unsigned>(CapabilityTier::kKnownUhdHdr)) return false;
  // A preference change never modifies capabilities in an existing process.
  GetWebOsMediaCapabilities();
  std::lock_guard<std::mutex> lock(preference_mutex);
  const std::string path = PreferencePath();
  if (path.empty()) return false;
  const std::string pattern = path + ".XXXXXX";
  std::vector<char> temporary(pattern.begin(), pattern.end());
  temporary.push_back('\0');
  const int fd = mkstemp(temporary.data()); // Same directory, mode 0600.
  if (fd < 0) return false;
  const char* data = VideoCapabilityTierName(static_cast<CapabilityTier>(value));
  size_t remaining = std::strlen(data);
  bool success = true;
  while (remaining) {
    const auto written = write(fd, data, remaining);
    if (written < 0 && errno == EINTR) continue;
    if (written <= 0) { success = false; break; }
    remaining -= written; data += written;
  }
  if (success && fsync(fd) != 0) success = false;
  if (close(fd) != 0) success = false;
  if (success && std::rename(temporary.data(), path.c_str()) != 0) success = false;
  if (!success) std::remove(temporary.data());
  return success;
}

std::string GetVideoCapabilitySetting() {
  const auto active = GetWebOsMediaCapabilities().tier;
  const auto saved = GetSavedVideoCapabilityTier();
  return "{\"saved\":" + std::to_string(static_cast<int>(saved)) +
      ",\"active\":" + std::to_string(static_cast<int>(active)) +
      ",\"overridden\":" + (VideoCapabilityOverrideActive() ? "true" : "false") + "}";
}
}}}
