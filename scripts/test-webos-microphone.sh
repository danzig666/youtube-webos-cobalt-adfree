#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/ytaf-microphone-tests.XXXXXX")"
trap 'rm -rf "$test_dir"' EXIT
mkdir -p "$test_dir/include/starboard/webos"
ln -s "$repo_root/cobalt-platform/webos/arm" "$test_dir/include/starboard/webos/arm"

mkdir -p "$test_dir/helpers" "$test_dir/unsupported"
"${CXX:-g++}" -std=c++17 -Wall -Wextra -Werror -shared -fPIC \
  "$repo_root/scripts/fixtures/native-helper.cc" \
  -o "$test_dir/helpers/libhelpers.so.2"
# A library without the required ABI must fail gracefully too.
printf 'extern "C" int unsupported() { return 0; }\n' | \
  "${CXX:-g++}" -x c++ -shared -fPIC - -o "$test_dir/unsupported/libhelpers.so.2"
"${CXX:-g++}" -std=c++17 -Wall -Wextra -Werror \
  -I"$test_dir/include" -I"$repo_root/cobalt-platform/webos/arm" \
  "$repo_root/scripts/test-lg-native-bus.cc" \
  "$repo_root/cobalt-platform/webos/arm/lg_native_bus.cc" -ldl \
  -o "$test_dir/test-lg-native-bus"
LD_LIBRARY_PATH="$test_dir/helpers" "$test_dir/test-lg-native-bus"
LD_LIBRARY_PATH="$test_dir/helpers" YTAF_TEST_NO_HANDLE=1 \
  "$test_dir/test-lg-native-bus" --unavailable
LD_LIBRARY_PATH="$test_dir/unsupported" "$test_dir/test-lg-native-bus" --unavailable

"${CXX:-g++}" -std=c++14 -Wall -Wextra -Werror -shared -fPIC \
  -I"$repo_root/scripts/test-support" $(pkg-config --cflags glib-2.0) \
  "$repo_root/scripts/fixtures/voice-api.cc" -o "$test_dir/helpers/libluna-service2.so.3"
cp "$test_dir/unsupported/libhelpers.so.2" "$test_dir/unsupported/libluna-service2.so.3"
cp "$test_dir/unsupported/libhelpers.so.2" "$test_dir/unsupported/libluna-service2.so"
"${CXX:-g++}" -std=c++14 -Wall -Wextra -Werror \
  -I"$test_dir/include" -I"$repo_root/scripts/test-support" -I"$repo_root/cobalt-platform/webos/arm" \
  $(pkg-config --cflags glib-2.0) \
  "$repo_root/scripts/test-lg-voice-api.cc" "$repo_root/cobalt-platform/webos/arm/lg_voice_api.cc" \
  -ldl -o "$test_dir/test-lg-voice-api"
LD_LIBRARY_PATH="$test_dir/helpers" "$test_dir/test-lg-voice-api"
LD_LIBRARY_PATH="$test_dir/unsupported" "$test_dir/test-lg-voice-api" --unavailable
python3 - "$test_dir/test-lg-voice-api" <<'PY'
import subprocess,sys
dynamic=subprocess.check_output(['readelf','-d',sys.argv[1]],text=True)
assert not any('NEEDED' in line and ('glib' in line or 'luna' in line) for line in dynamic.splitlines())
print('Voice API libraries are lazy-loaded; incompatible LS2 symbols fail gracefully')
PY

"${CXX:-g++}" -std=c++17 -Wall -Wextra -Werror -pthread -DYTAF_VOICE_API_DIRECT \
  -I"$test_dir/include" -I"$repo_root/scripts/test-support" -I"$repo_root/cobalt-platform/webos/arm" \
  $(pkg-config --cflags glib-2.0 json-c) \
  "$repo_root/scripts/test-lg-voice-capture.cc" \
  "$repo_root/cobalt-platform/webos/arm/lg_voice_capture.cc" \
  "$repo_root/cobalt-platform/webos/arm/microphone.cc" \
  $(pkg-config --libs glib-2.0 json-c) -o "$test_dir/test-lg-voice-capture"
"$test_dir/test-lg-voice-capture"
