# v2 playback improvement baseline

## Source and runtime

- Working repository: `danzig666/youtube-webos-cobalt-adfree`.
- Starting main/base SHA: `1aea406e8c833e2fd16099e390da08b16326942f`.
- Cobalt: `23.lts.6`, upstream SHA
  `007628df7bddd86e53d6d151ecd122614916223d`.
- Starboard API: **13**, ARMv7 softfp; SDL webOS and the firmware-provided
  Starfish library. No proprietary LG starter is packaged.

## Existing playback paths and rollback

Eligible clear WebM Opus mono/stereo, 48 kHz streams use one shared Starfish
session and presentation clock with H.264, VP9 or AV1 video. Codec-delay and
seek-pre-roll validation is Opus-specific. Input queues, generations and EOS
state are generic. HDR and resolution transitions have separate validation.

AAC, DRM, audio-only and unsupported configurations retain Cobalt's existing
factory. The legacy video path uses StarfishVideoDecoder with separately
decoded audio (for example FFmpeg AAC); software decoders remain available in
the factory. No mid-playback backend switch is promised after a shared player
has already been selected.

`YTAF_SHARED_AV=0` restores the existing factory. Modes 1/2/3 respectively
restrict shared selection to H.264 SDR, UHD SDR, and UHD SDR/HDR. The first
query latches the process policy. The historical `/tmp/ytaf-shared-av.enable`
marker remains supported; an invalid explicit override selects legacy. No
root access is required for ordinary operation.

The starting capability advertisement permits H.264 up to 1920x1080 and
VP9/AV1 up to 3840x2160, all up to 60 fps and Starboard's maximum bitrate.
The upstream color check restricts non-SDR input to 10/12-bit UHD codecs.
Decode-to-texture is unsupported. These are policy limits, not proof of
capability on every TV.

## Baseline validation (2026-10-01)

Before behavioral changes:

```sh
cd webapp
npm ci
npm test
cd ..
c++ -std=c++14 -Wall -Wextra -Werror -I cobalt-platform/webos/arm \
  scripts/test-starfish-av-session-state.cc -o /tmp/ytaf-state
/tmp/ytaf-state
python3 scripts/test-ipk-tools.py
scripts/install-webos-starboard-platform.sh workdir/cobalt-23.lts.6
python3 scripts/test-external-video-seek.py workdir/cobalt-23.lts.6
WEBOS_SDK_ROOT=/path/to/relocated/sdk SDL2_BUNDLE_DIR=/path/to/sdl \
  scripts/check-webos-starboard-sources.sh
WEBOS_SDK_ROOT=/path/to/relocated/sdk \
  scripts/check-starfish-av-session-state-sdk.sh
```

Results: 25 webapp tests passed; native timing/state, package tools and the
actual patched Cobalt Seek regression passed. The complete overlay installer
applied to pinned upstream Cobalt. ARM syntax checks passed for SDL application
and window sources and the shared native player, including real Cobalt
InputBuffer instantiation. SDK: buildroot-nc4 `webos-a38c582`; syntax-only SDL
headers: pinned webosbrew `263629dab0c89e75f9872eed66e197174952ce02`
with SDK-generated configuration and webOS/Wayland ABI flags.

No full Cobalt link or TV playback test has been performed in this workspace.
Syntax checks cannot establish firmware compatibility. Before shipping an IPK,
the separate full Gold build and on-device playback/lifecycle checks remain
required.

## Delivery order and evidence gates

Keep each implementation step in a separate buildable commit. Separate
behavior-preserving refactors from policy changes. Start with capability
centralization, expand state regressions, introduce conservative profiles,
extract generic audio timing, extend repeated-seek coverage, then test rate
policy and structured diagnostics. Keep vendor calls outside pure policy/state
components. Add lifecycle state tests and cheap PR CI; keep the nightly Gold
build separate. Add a device-report schema and compatibility generator.

Live fixes require traces identifying the failing layer. AAC requires verified
compressed-input framing and clock/reset behavior; investigate before coding.
On-TV diagnostics and report export require a supported native/UI bridge.
Neither SDK declarations nor host tests prove native playback. Do not invent
LG APIs, publish releases, replace Cobalt/UI, remove legacy/rollback paths,
require root/SSH, or log authentication data or signed media URLs.
