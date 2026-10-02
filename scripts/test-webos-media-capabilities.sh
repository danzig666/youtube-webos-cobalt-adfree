#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cobalt_root="${1:-$repo_root/workdir/cobalt-23.lts.6}"
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT
# Real Starboard headers/constants, host architecture; no SDK or vendor stubs.
"${CXX:-c++}" -std=c++14 -Wall -Wextra -Werror -Wno-expansion-to-defined -pthread \
  -DSTARBOARD -DSB_API_VERSION=13 -DSB_IS_ARCH_X64=1 -DSB_IS_64_BIT=1 \
  -DSB_IS_LITTLE_ENDIAN=1 -DSB_SIZE_OF_POINTER=8 -DSB_SIZE_OF_LONG=8 \
  '-DSTARBOARD_CONFIGURATION_INCLUDE="starboard/linux/x64x11/configuration_public.h"' \
  -I"$cobalt_root" -I"$repo_root/cobalt-platform/webos/arm" \
  "$repo_root/scripts/test-webos-media-capabilities.cc" \
  "$repo_root/cobalt-platform/webos/arm/webos_media_capabilities.cc" \
  "$repo_root/cobalt-platform/webos/arm/webos_video_preference.cc" \
  "$repo_root/scripts/test-video-preference-storage-path.cc" \
  "$cobalt_root/starboard/linux/shared/configuration_constants.cc" \
  -o "$temporary/capabilities"
"$temporary/capabilities"

"${CXX:-c++}" -std=c++14 -Wall -Wextra -Werror -Wno-expansion-to-defined -pthread \
  -DSTARBOARD -DSB_API_VERSION=13 -DSB_IS_ARCH_X64=1 -DSB_IS_64_BIT=1 \
  -DSB_IS_LITTLE_ENDIAN=1 -DSB_SIZE_OF_POINTER=8 -DSB_SIZE_OF_LONG=8 \
  '-DSTARBOARD_CONFIGURATION_INCLUDE="starboard/linux/x64x11/configuration_public.h"' \
  -I"$cobalt_root" -I"$repo_root/cobalt-platform/webos/arm" \
  -fsanitize=undefined -fno-sanitize-recover=all \
  "$repo_root/scripts/test-webos-media-report.cc" \
  "$repo_root/cobalt-platform/webos/arm/webos_media_report.cc" \
  "$repo_root/cobalt-platform/webos/arm/starfish_playback_rate.cc" \
  "$repo_root/cobalt-platform/webos/arm/webos_media_diagnostics.cc" \
  "$repo_root/cobalt-platform/webos/arm/webos_media_capabilities.cc" \
  "$repo_root/cobalt-platform/webos/arm/webos_video_preference.cc" \
  "$repo_root/scripts/test-video-preference-storage-path.cc" \
  "$cobalt_root/starboard/linux/shared/configuration_constants.cc" \
  -o "$temporary/report"
"$temporary/report" >"$temporary/report-result" 2>"$temporary/report-log"
cat "$temporary/report-result"

"${CXX:-c++}" -std=c++14 -Wall -Wextra -Werror -Wno-expansion-to-defined -pthread \
  -DSTARBOARD -DSB_API_VERSION=13 -DSB_IS_ARCH_X64=1 -DSB_IS_64_BIT=1 \
  -DSB_IS_LITTLE_ENDIAN=1 -DSB_SIZE_OF_POINTER=8 -DSB_SIZE_OF_LONG=8 \
  '-DSTARBOARD_CONFIGURATION_INCLUDE="starboard/linux/x64x11/configuration_public.h"' \
  -I"$cobalt_root" -I"$repo_root/cobalt-platform/webos/arm" \
  "$repo_root/scripts/test-webos-video-preference.cc" \
  "$repo_root/cobalt-platform/webos/arm/webos_media_capabilities.cc" \
  "$repo_root/cobalt-platform/webos/arm/webos_video_preference.cc" \
  "$repo_root/scripts/test-video-preference-storage-path.cc" \
  "$cobalt_root/starboard/linux/shared/configuration_constants.cc" \
  -o "$temporary/preference"
mkdir "$temporary/storage"
export YTAF_TEST_STORAGE="$temporary/storage"
unset YTAF_VIDEO_CAPS
"$temporary/preference" read 0 0 0
"$temporary/preference" save 1 1 1
"$temporary/preference" read 1 1 0
"$temporary/preference" save 2 1 2
"$temporary/preference" read 2 2 0
"$temporary/preference" save 99 0 2
"$temporary/preference" unavailable 0 0 0
"$temporary/preference" read 2 2 0
YTAF_VIDEO_CAPS=safe "$temporary/preference" read 2 0 1
YTAF_VIDEO_CAPS=invalid "$temporary/preference" read 2 0 1
"$temporary/preference" save 0 1 0
"$temporary/preference" read 0 0 0
printf 'uhd-hdr\000extra' > "$temporary/storage/ytaf-video-capabilities"
"$temporary/preference" read 0 0 0
printf 'unrecognized-value-too-long' > "$temporary/storage/ytaf-video-capabilities"
"$temporary/preference" read 0 0 0
