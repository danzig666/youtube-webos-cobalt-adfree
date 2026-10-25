#!/usr/bin/env bash
# Runs in the build container; kept separate so cache selection is testable.
set -euo pipefail
: "${OUT_DIR:?}" "${BUILD_TYPE:?}" "${PARALLEL:?}"
case "$BUILD_TYPE" in gold|devel|qa) ;; *) echo 'Invalid Cobalt build type' >&2; exit 2;; esac
[[ "$PARALLEL" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid compiler job count' >&2; exit 2; }
case "${YTAF_CCACHE:-1}" in 0|1) ;; *) echo 'YTAF_CCACHE must be 0 or 1' >&2; exit 2;; esac
wrapper_arg=''
use_cache=0
if [[ "${YTAF_CCACHE:-1}" == 1 ]] && command -v ccache >/dev/null 2>&1; then
  use_cache=1
  wrapper_arg=' cc_wrapper="ccache"'
  # Compiler content, arguments and headers determine hits. Do not enable the
  # fork's sloppiness options or trust timestamps alone for compiler identity.
  export CCACHE_COMPILERCHECK=content
  export CCACHE_SLOPPINESS=''
  ccache --zero-stats
  echo 'Cobalt compiler cache enabled'
else
  echo 'Cobalt compiler cache disabled or unavailable'
fi
# Cobalt's GN cc_wrapper covers host and target compilation; link/archive
# commands stay uncached. No platform toolchain or playback behavior changes.
git config --global --add safe.directory /code
umask 022
# Generated content directories belong to the container user. Refresh them
# here so a host user can also perform a second build of another app identity.
# GN uses hard links for these assets; remove only the generated directory.
rm -rf -- "$OUT_DIR/content/web/adblock"
rc=0
gn --script-executable=python3 gen "$OUT_DIR" --args="target_platform=\"webos-arm\" build_type=\"$BUILD_TYPE\" target_cpu=\"arm\" sb_api_version=13 is_clang=false$wrapper_arg" &&
  ninja -v -j "$PARALLEL" -C "$OUT_DIR" cobalt || rc=$?
if [[ "$rc" == 0 && -n "${FDK_BUNDLE:-}" ]]; then
  # The container owns these generated directories. Archive the AAC library
  # with its runtime so later packaging cannot depend on the TV's firmware.
  mkdir -p "$OUT_DIR/lib" "$OUT_DIR/content/licenses"
  cp "$FDK_BUNDLE/libfdk-aac.so" "$OUT_DIR/lib/libfdk-aac.so"
  cp "$FDK_BUNDLE/fdk-aac-build.txt" "$OUT_DIR/lib/fdk-aac-build.txt"
  cp "$FDK_BUNDLE/fdk-aac.txt" "$OUT_DIR/content/licenses/fdk-aac.txt"
fi
if [[ "$use_cache" == 1 ]]; then ccache --show-stats || true; fi

# Public ABI headers used only by the firmware FFmpeg diagnostic probe.
if [[ "$rc" == 0 && -f starboard/webos/arm/ffmpeg5/COPYING.LGPLv2.1 ]]; then
  mkdir -p "$OUT_DIR/content/licenses"
  cp starboard/webos/arm/ffmpeg5/COPYING.LGPLv2.1 "$OUT_DIR/content/licenses/ffmpeg5-headers.txt"
fi
if [[ "$rc" == 0 && -f starboard/webos/arm/json-c-LICENSE.txt ]]; then
  mkdir -p "$OUT_DIR/content/licenses"
  cp starboard/webos/arm/json-c-LICENSE.txt "$OUT_DIR/content/licenses/json-c.txt"
fi
exit "$rc"
