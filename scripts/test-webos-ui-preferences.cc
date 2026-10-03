#include "webos_ui_preferences.h"
#include <cassert>
#include <fstream>
#include <iostream>
#include <sys/stat.h>
using namespace starboard::shared::webos;
int main() {
  char directory[] = "/tmp/ytaf-prefs-XXXXXX"; assert(mkdtemp(directory));
  const std::string path = std::string(directory) + "/preferences";
  const std::string on = "{\"enableAdBlock\":true}";
  const std::string off = "{\"enableAdBlock\":false}";
  assert(ReadUiPreferencesFile(path).empty());
  assert(WriteUiPreferencesFile(path, on)); assert(ReadUiPreferencesFile(path) == on);
  assert(WriteUiPreferencesFile(path, off)); assert(ReadUiPreferencesFile(path) == off);
  struct stat info; assert(stat(path.c_str(), &info) == 0); assert((info.st_mode & 0777) == 0600);
  assert(!WriteUiPreferencesFile(path, std::string(kUiPreferenceLimit + 1, 'x')));
  assert(!WriteUiPreferencesFile(path, std::string("a\0b", 3)));
  assert(ReadUiPreferencesFile(path) == off);
  assert(!WriteUiPreferencesFile(std::string(directory) + "/missing/prefs", on));
  { std::ofstream file(path, std::ios::binary); file << std::string(kUiPreferenceLimit + 1, 'x'); }
  assert(ReadUiPreferencesFile(path).empty());
  { std::ofstream file(path, std::ios::binary); file.write("a\0b", 3); }
  assert(ReadUiPreferencesFile(path).empty());
  std::remove(path.c_str()); rmdir(directory);
  std::cout << "UI preferences persist toggles, reject corruption and keep private file permissions\n";
}
