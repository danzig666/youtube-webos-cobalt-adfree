#ifndef STARBOARD_WEBOS_ARM_WEBOS_UI_PREFERENCES_H_
#define STARBOARD_WEBOS_ARM_WEBOS_UI_PREFERENCES_H_
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>
#include <unistd.h>
namespace starboard { namespace shared { namespace webos {
constexpr size_t kUiPreferenceLimit = 65536;
inline std::string ReadUiPreferencesFile(const std::string& path) {
  FILE* file = std::fopen(path.c_str(), "rb");
  if (!file) return {};
  std::vector<char> buffer(kUiPreferenceLimit + 1);
  const size_t size = std::fread(buffer.data(), 1, buffer.size(), file);
  const bool failed = std::ferror(file) != 0;
  std::fclose(file);
  if (failed || size > kUiPreferenceLimit) return {};
  std::string value(buffer.data(), size);
  return value.find('\0') == std::string::npos ? value : std::string();
}
inline bool WriteUiPreferencesFile(const std::string& path, const std::string& value) {
  if (path.empty() || value.empty() || value.size() > kUiPreferenceLimit || value.find('\0') != std::string::npos) return false;
  const std::string pattern = path + ".XXXXXX";
  std::vector<char> temporary(pattern.begin(), pattern.end()); temporary.push_back('\0');
  const int fd = mkstemp(temporary.data());
  if (fd < 0) return false;
  size_t position = 0; bool success = true;
  while (position < value.size()) {
    const ssize_t count = write(fd, value.data() + position, value.size() - position);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) { success = false; break; }
    position += static_cast<size_t>(count);
  }
  if (success && fsync(fd) != 0) success = false;
  if (close(fd) != 0) success = false;
  if (success && std::rename(temporary.data(), path.c_str()) != 0) success = false;
  if (!success) std::remove(temporary.data());
  return success;
}
std::string GetUiPreferences();
bool SaveUiPreferences(const std::string& value);
}}}
#endif
