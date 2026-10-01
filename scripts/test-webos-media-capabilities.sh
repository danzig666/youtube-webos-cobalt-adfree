#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cobalt_root="${1:-$repo_root/workdir/cobalt-23.lts.6}"
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT
# Real Starboard headers/constants, host architecture; no SDK or vendor stubs.
"${CXX:-c++}" -std=c++14 -Wall -Wextra -Werror -Wno-expansion-to-defined \
  -DSTARBOARD -DSB_API_VERSION=13 -DSB_IS_ARCH_X64=1 -DSB_IS_64_BIT=1 \
  -DSB_IS_LITTLE_ENDIAN=1 -DSB_SIZE_OF_POINTER=8 -DSB_SIZE_OF_LONG=8 \
  '-DSTARBOARD_CONFIGURATION_INCLUDE="starboard/linux/x64x11/configuration_public.h"' \
  -I"$cobalt_root" -I"$repo_root/cobalt-platform/webos/arm" \
  "$repo_root/scripts/test-webos-media-capabilities.cc" \
  "$repo_root/cobalt-platform/webos/arm/webos_media_capabilities.cc" \
  "$cobalt_root/starboard/linux/shared/configuration_constants.cc" \
  -o "$temporary/capabilities"
"$temporary/capabilities"
