#include "webos_ui_preferences.h"
#include "webos_build_metadata.h"
#include "starboard/configuration_constants.h"
#include "starboard/system.h"
#include <mutex>
namespace starboard { namespace shared { namespace webos {
namespace {
std::mutex ui_preferences_mutex;
std::string Path() {
  std::vector<char> path(kSbFileMaxPath, '\0');
  if (!SbSystemGetPath(kSbSystemPathStorageDirectory, path.data(), path.size())) return {};
  return std::string(path.data()) + "/ytaf-ui-" YTAF_APP_ID ".json";
}
}
std::string GetUiPreferences() {
  std::lock_guard<std::mutex> lock(ui_preferences_mutex);
  return ReadUiPreferencesFile(Path());
}
bool SaveUiPreferences(const std::string& value) {
  std::lock_guard<std::mutex> lock(ui_preferences_mutex);
  return WriteUiPreferencesFile(Path(), value);
}
}}}
