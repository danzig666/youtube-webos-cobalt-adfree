// Only the platform path lookup is substituted; tests use the real file I/O.
#include <cstdlib>
#include <cstring>
#include "starboard/system.h"
bool SbSystemGetPath(SbSystemPathId id, char* output, int size) {
  const char* path = std::getenv("YTAF_TEST_STORAGE");
  if (id != kSbSystemPathStorageDirectory || !path ||
      static_cast<int>(std::strlen(path)) >= size) return false;
  std::strcpy(output, path);
  return true;
}
