#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cobalt_root="${1:-$repo_root/workdir/cobalt-23.lts.6}"
test_dir="$(mktemp -d)"
trap 'rm -rf "$test_dir"' EXIT

# Applying the real overlay also catches malformed patches and installer order
# regressions. This deliberately prepares the supplied Cobalt checkout.
bash "$repo_root/scripts/install-webos-starboard-platform.sh" "$cobalt_root"
bash "$repo_root/scripts/install-webos-starboard-platform.sh" "$cobalt_root"

flags=(-std=c++14 -Wall -Wextra -Werror -pthread -fsanitize=undefined
       -fno-sanitize-recover=all -I"$repo_root/cobalt-platform/webos/arm")
run_test() {
  local name="$1"
  shift
  "${CXX:-c++}" "${flags[@]}" "$repo_root/scripts/test-$name.cc" "$@" \
    -o "$test_dir/$name"
  "$test_dir/$name"
}
platform="$repo_root/cobalt-platform/webos/arm"
run_test starfish-av-session-state
run_test starfish-audio-session
run_test starfish-playback-rate "$platform/starfish_playback_rate.cc"
run_test webos-lifecycle "$platform/webos_lifecycle.cc"
run_test webos-media-diagnostics "$platform/webos_media_diagnostics.cc"
bash "$repo_root/scripts/test-webos-media-capabilities.sh" "$cobalt_root"
python3 "$repo_root/scripts/test-external-video-seek.py" --require-fixed "$cobalt_root"
echo 'All native host regressions passed (no webOS SDK required).'
