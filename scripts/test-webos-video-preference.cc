#include <cassert>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <string>
#include "webos_media_capabilities.h"
using namespace starboard::shared::webos;
int main(int argc, char** argv) {
  assert(argc == 5);
  const std::string mode = argv[1];
  const auto active = GetWebOsMediaCapabilities().tier;
  if (mode == "read") {
    assert(static_cast<int>(GetSavedVideoCapabilityTier()) == std::atoi(argv[2]));
    assert(static_cast<int>(active) == std::atoi(argv[3]));
    assert(VideoCapabilityOverrideActive() == (std::atoi(argv[4]) != 0));
  } else if (mode == "save") {
    const unsigned requested = static_cast<unsigned>(std::strtoul(argv[2], nullptr, 10));
    assert(SaveVideoCapabilityTier(requested) == (std::atoi(argv[3]) != 0));
    assert(static_cast<int>(GetSavedVideoCapabilityTier()) == std::atoi(argv[4]));
    assert(GetWebOsMediaCapabilities().tier == active); // No mid-playback change.
    assert(GetVideoCapabilitySetting().find("\"active\":" + std::to_string(static_cast<int>(active))) != std::string::npos);
  } else if (mode == "unavailable") {
    assert(::unsetenv("YTAF_TEST_STORAGE") == 0);
    assert(!SaveVideoCapabilityTier(1));
    assert(GetWebOsMediaCapabilities().tier == active);
  } else { return 2; }
  std::cout << "Video preference " << mode << " passed\n";
}
