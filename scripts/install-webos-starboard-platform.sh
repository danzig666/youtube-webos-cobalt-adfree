#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cobalt_root="${1:-$repo_root/workdir/cobalt-23.lts.6}"
overlay="$repo_root/cobalt-platform/webos"
platform_target="$cobalt_root/starboard/webos"
platforms_file="$cobalt_root/starboard/build/platforms.py"
registration_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos.patch"
compatibility_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-compat.patch"
egl_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-egl.patch"
egl_sdl_surface_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-egl-sdl-surface.patch"
sdl_input_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-sdl-input.patch"
gcc_compat_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-gcc.patch"
video_fallback_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-video-fallback.patch"
vp9_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-vp9.patch"
av1_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-av1.patch"
dav1d_api_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-dav1d-api.patch"
starfish_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-starfish.patch"
shared_av_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-shared-av.patch"
hardware_video_capabilities_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-hardware-video-capabilities.patch"
media_capabilities_upgrade_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-media-capabilities-upgrade.patch"
media_diagnostics_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-media-diagnostics.patch"
pulse_soname_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-pulse-soname.patch"
pulse_tuning_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-pulse-tuning.patch"
external_video_seek_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-external-video-seek.patch"
external_video_controls_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-external-video-controls.patch"
external_video_preroll_sync_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-external-video-preroll-sync.patch"
external_video_repeated_seek_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-external-video-repeated-seek.patch"
lifecycle_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-webos-lifecycle.patch"
demuxer_stop_race_patch="$repo_root/cobalt-platform/cobalt-23.lts.6-demuxer-stop-race.patch"

if ! git -C "$cobalt_root" rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
   [[ ! -f "$platforms_file" ]]; then
  echo "Not a Cobalt source tree: $cobalt_root" >&2
  exit 2
fi

if [[ "$(git -C "$cobalt_root" rev-parse HEAD)" != 007628df7bddd86e53d6d151ecd122614916223d &&
      "$(git -C "$cobalt_root" describe --tags --always)" != 23.lts.6* ]]; then
  echo "This overlay currently supports Cobalt 23.lts.6 only." >&2
  exit 3
fi

mkdir -p "$platform_target"
# Compare file contents so repeated installs do not touch every platform header
# and force Ninja to rebuild almost the entire dependency graph.
rsync -ac --exclude=webos_build_metadata.h "$overlay/" "$platform_target/"

if ! grep -q "'webos-arm': 'starboard/webos/arm'" "$platforms_file"; then
  git -C "$cobalt_root" apply --check "$registration_patch"
  git -C "$cobalt_root" apply "$registration_patch"
fi

if ! grep -q 'defined(STARBOARD_WEBOS)' \
  "$cobalt_root/starboard/linux/shared/routes.cc"; then
  git -C "$cobalt_root" apply --check "$compatibility_patch"
  git -C "$cobalt_root" apply "$compatibility_patch"
fi

if ! grep -q 'ApplicationSdl::Get()->GetNativeDisplay' \
  "$cobalt_root/starboard/shared/egl/system_egl.cc"; then
  git -C "$cobalt_root" apply --check "$egl_patch"
  git -C "$cobalt_root" apply "$egl_patch"
fi

if ! grep -q 'Adopting SDL EGL surface with config' \
  "$cobalt_root/cobalt/renderer/backend/egl/graphics_system.cc"; then
  git -C "$cobalt_root" apply --check "$egl_sdl_surface_patch"
  git -C "$cobalt_root" apply "$egl_sdl_surface_patch"
fi

if ! grep -q 'SDL supplies webOS remote' \
  "$cobalt_root/starboard/linux/shared/BUILD.gn"; then
  git -C "$cobalt_root" apply --check "$sdl_input_patch"
  git -C "$cobalt_root" apply "$sdl_input_patch"
fi

if ! grep -q 'config("webos_gcc_compat")' "$cobalt_root/net/BUILD.gn"; then
  git -C "$cobalt_root" apply --check "$gcc_compat_patch"
  git -C "$cobalt_root" apply "$gcc_compat_patch"
fi

if ! grep -q 'defined(STARBOARD_WEBOS)' \
  "$cobalt_root/starboard/linux/shared/media_is_video_supported.cc"; then
  git -C "$cobalt_root" apply --check "$video_fallback_patch"
  git -C "$cobalt_root" apply "$video_fallback_patch"
fi

if ! grep -Eq "VP9-only libvpx|TV's Starfish hardware pipeline|WebOsIsVideoSupported" \
  "$cobalt_root/starboard/linux/shared/media_is_video_supported.cc"; then
  git -C "$cobalt_root" apply --check "$vp9_patch"
  git -C "$cobalt_root" apply "$vp9_patch"
fi

if ! grep -Eq "dav1d handles AV1|TV's Starfish hardware pipeline|WebOsIsVideoSupported" \
  "$cobalt_root/starboard/linux/shared/media_is_video_supported.cc"; then
  git -C "$cobalt_root" apply --check "$av1_patch"
  git -C "$cobalt_root" apply "$av1_patch"
fi

if ! grep -q 'dav1d-webos-official/public' \
  "$cobalt_root/starboard/shared/libdav1d/dav1d_video_decoder.h"; then
  git -C "$cobalt_root" apply --check "$dav1d_api_patch"
  git -C "$cobalt_root" apply "$dav1d_api_patch"
fi

if ! grep -q 'Playing video using webOS Starfish hardware decoder' \
  "$cobalt_root/starboard/linux/shared/player_components_factory.cc"; then
  git -C "$cobalt_root" apply --check "$starfish_patch"
  git -C "$cobalt_root" apply "$starfish_patch"
fi

if ! grep -q 'TryCreateStarfishAvComponents' \
    "$cobalt_root/starboard/linux/shared/player_components_factory.cc" ||
   ! grep -q 'kWebosStarfishAudioTiming' "$cobalt_root/starboard/player.h" ||
   ! grep -q 'webos_audio_timing' \
    "$cobalt_root/starboard/shared/starboard/player/input_buffer_internal.h"; then
  git -C "$cobalt_root" apply --check "$shared_av_patch"
  git -C "$cobalt_root" apply "$shared_av_patch"
fi

if ! grep -q 'WebOsIsVideoSupported' \
  "$cobalt_root/starboard/linux/shared/media_is_video_supported.cc"; then
  if grep -q "TV's Starfish hardware pipeline" \
    "$cobalt_root/starboard/linux/shared/media_is_video_supported.cc"; then
    # Upgrade an existing incremental build as well as clean Cobalt checkouts.
    git -C "$cobalt_root" apply --check "$media_capabilities_upgrade_patch"
    git -C "$cobalt_root" apply "$media_capabilities_upgrade_patch"
  else
    git -C "$cobalt_root" apply --check "$hardware_video_capabilities_patch"
    git -C "$cobalt_root" apply "$hardware_video_capabilities_patch"
  fi
fi

if ! grep -q 'RecordMediaEvent(event)' \
  "$cobalt_root/starboard/linux/shared/media_is_video_supported.cc"; then
  git -C "$cobalt_root" apply --check "$media_diagnostics_patch"
  git -C "$cobalt_root" apply "$media_diagnostics_patch"
fi

if ! grep -q 'kPulseLibraryName.*libpulse.so.0' \
  "$cobalt_root/starboard/shared/pulse/pulse_dynamic_load_dispatcher.cc"; then
  git -C "$cobalt_root" apply --check "$pulse_soname_patch"
  git -C "$cobalt_root" apply "$pulse_soname_patch"
fi

if ! grep -q 'kPulseBufferSizeInFrames = 16384' \
  "$cobalt_root/starboard/shared/pulse/pulse_audio_sink_type.cc"; then
  git -C "$cobalt_root" apply --check "$pulse_tuning_patch"
  git -C "$cobalt_root" apply "$pulse_tuning_patch"
fi

if ! grep -q 'virtual void SetSeekTime' \
  "$cobalt_root/starboard/shared/starboard/player/filter/video_decoder_internal.h"; then
  git -C "$cobalt_root" apply --check "$external_video_seek_patch"
  git -C "$cobalt_root" apply "$external_video_seek_patch"
fi

if ! grep -q 'virtual void SetPlaybackRate' \
  "$cobalt_root/starboard/shared/starboard/player/filter/video_decoder_internal.h"; then
  git -C "$cobalt_root" apply --check "$external_video_controls_patch"
  git -C "$cobalt_root" apply "$external_video_controls_patch"
fi

if ! grep -q 'first_input_written_ || decoder_->NeedsResetOnEverySeek()' \
  "$cobalt_root/starboard/shared/starboard/player/filter/video_renderer_internal_impl.cc"; then
  git -C "$cobalt_root" apply --check "$external_video_repeated_seek_patch"
  git -C "$cobalt_root" apply "$external_video_repeated_seek_patch"
fi

if ! grep -q 'Hold an external video pipeline at its preroll target' \
  "$cobalt_root/starboard/shared/starboard/player/filter/filter_based_player_worker_handler.cc"; then
  git -C "$cobalt_root" apply --check "$external_video_preroll_sync_patch"
  git -C "$cobalt_root" apply "$external_video_preroll_sync_patch"
fi

if ! grep -q 'Stay Concealed so the main event loop' \
  "$cobalt_root/starboard/shared/signal/system_request_freeze.cc"; then
  git -C "$cobalt_root" apply --check "$lifecycle_patch"
  git -C "$cobalt_root" apply "$lifecycle_patch"
fi

if ! grep -q 'Ignore that stale callback before dereferencing its stream' \
  "$cobalt_root/cobalt/media/base/sbplayer_pipeline.cc"; then
  git -C "$cobalt_root" apply --check "$demuxer_stop_race_patch"
  git -C "$cobalt_root" apply "$demuxer_stop_race_patch"
fi

if ! grep -q 'GetYtafMediaReport' "$cobalt_root/cobalt/h5vcc/h5vcc_system.h"; then
  git -C "$cobalt_root" apply --check "$repo_root/cobalt-platform/cobalt-23.lts.6-webos-diagnostics-ui.patch"
  git -C "$cobalt_root" apply "$repo_root/cobalt-platform/cobalt-23.lts.6-webos-diagnostics-ui.patch"
fi
if ! grep -q 'GetYtafVideoCapabilitySetting' "$cobalt_root/cobalt/h5vcc/h5vcc_system.h"; then
  git -C "$cobalt_root" apply --check "$repo_root/cobalt-platform/cobalt-23.lts.6-webos-video-setting.patch"
  git -C "$cobalt_root" apply "$repo_root/cobalt-platform/cobalt-23.lts.6-webos-video-setting.patch"
fi
if ! grep -q 'GetYtafUiPreferences' "$cobalt_root/cobalt/h5vcc/h5vcc_system.h"; then
  git -C "$cobalt_root" apply --check "$repo_root/cobalt-platform/cobalt-23.lts.6-webos-ui-preferences.patch"
  git -C "$cobalt_root" apply "$repo_root/cobalt-platform/cobalt-23.lts.6-webos-ui-preferences.patch"
fi
if ! grep -q 'EnableYtafPlaybackRates' "$cobalt_root/cobalt/h5vcc/h5vcc_system.h"; then
  git -C "$cobalt_root" apply --check "$repo_root/cobalt-platform/cobalt-23.lts.6-webos-playback-speed-setting.patch"
  git -C "$cobalt_root" apply "$repo_root/cobalt-platform/cobalt-23.lts.6-webos-playback-speed-setting.patch"
fi
if ! grep -q 'webos_initial_playback_position_' "$cobalt_root/cobalt/dom/html_media_element.h"; then
  git -C "$cobalt_root" apply --check "$repo_root/cobalt-platform/cobalt-23.lts.6-webos-initial-playback-position.patch"
  git -C "$cobalt_root" apply "$repo_root/cobalt-platform/cobalt-23.lts.6-webos-initial-playback-position.patch"
fi
if ! grep -q 'ResetYtafPlaybackRate' "$cobalt_root/cobalt/h5vcc/h5vcc_system.h"; then
  git -C "$cobalt_root" apply --check "$repo_root/cobalt-platform/cobalt-23.lts.6-webos-reset-playback-speed.patch"
  git -C "$cobalt_root" apply "$repo_root/cobalt-platform/cobalt-23.lts.6-webos-reset-playback-speed.patch"
fi
if ! grep -q 'TimeRanges::Nearest(empty)' "$cobalt_root/cobalt/dom/html_media_element.cc"; then
  git -C "$cobalt_root" apply --check "$repo_root/cobalt-platform/cobalt-23.lts.6-webos-seekable-resume.patch"
  git -C "$cobalt_root" apply "$repo_root/cobalt-platform/cobalt-23.lts.6-webos-seekable-resume.patch"
fi
python3 - "$repo_root" "$platform_target/arm/webos_build_metadata.h" <<'PYMETA'
from pathlib import Path
import json, re, subprocess, sys
root, target = Path(sys.argv[1]), Path(sys.argv[2])
appinfo = json.loads(subprocess.check_output(
    [sys.executable, str(root / 'scripts/starterless-appinfo.py')], text=True))
version, app_id = appinfo['version'], appinfo['id']
assert re.fullmatch(r'[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+', app_id)
assert re.fullmatch(r'[0-9]+(?:\.[0-9]+)*', version)
sha = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
assert re.fullmatch(r'[0-9a-f]{40}', sha)
text = '#ifndef STARBOARD_WEBOS_ARM_WEBOS_BUILD_METADATA_H_\n#define STARBOARD_WEBOS_ARM_WEBOS_BUILD_METADATA_H_\n#define YTAF_APP_ID "' + app_id + '"\n#define YTAF_APP_VERSION "' + version + '"\n#define YTAF_SOURCE_SHA "' + sha + '"\n#endif\n'
if not target.exists() or target.read_text() != text:
    target.write_text(text)
PYMETA

echo "Installed webos-arm Starboard platform into: $platform_target"
