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
  bash scripts/check-starfish-av-session-state-sdk.sh
```

Results: 25 webapp tests passed; native timing/state, package tools and the
actual patched Cobalt Seek regression passed. The complete overlay installer
applied to pinned upstream Cobalt. ARM syntax checks passed for SDL application
and window sources and the shared native player, including real Cobalt
InputBuffer instantiation. SDK: buildroot-nc4 `webos-a38c582`; syntax-only SDL
headers: pinned webosbrew `263629dab0c89e75f9872eed66e197174952ce02`
with SDK-generated configuration and webOS/Wayland ABI flags.

At the baseline, no full Cobalt link or TV playback test had been performed.
The full Gold build and package validation have since passed (see the final
validation below). Syntax/build checks cannot establish firmware compatibility;
on-device playback/lifecycle checks remain required before a stable release.

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

## Incremental delivery (2026-10-02)

Branch: `playback/host-tested-v2`. Implementation is split into reviewable commits and pushed to the same branch.
No stable release has been published or TV installation performed.

| Phase | Delivered evidence / remaining gate |
| --- | --- |
| 0 | Baseline SHA, architecture, tests and ARM syntax recorded above |
| 1 | Behavior-preserving capability extraction committed before policy changes; boundary comparison passed |
| 2 | Safe/UHD/UHD-HDR profiles and latched override; no speculative detection |
| 3 | Generic audio epoch/session and packet timing separated from Opus; wire format preserved |
| 4 | SDK/source AAC investigation documented; compressed AAC remains unproven and uses existing fallback |
| 5 | 100 resets, stale callbacks/EOS, queue boundaries, counter exhaustion and video transitions host-tested |
| 6 | Rate policy, idempotence and confirmed 1x recovery; firmware validation outstanding |
| 7 | Existing seek fix preserved; rapid/repeated/bidirectional/zero/paused/rate-context regressions expanded |
| 8 | Native boundary tracing and live hypotheses documented; numeric MSE tracing added; failing TV trace/repair still gated |
| 9 | SDL lifecycle policy and duplicate/skipped-event tests; actual suspend/relaunch/resource recovery outstanding |
| 10–11 | GREEN-button paged diagnostics, native snapshots and confirmed clipboard report copy implemented; compositor validation gated |
| 12 | Required device-test form and labeled-report generator; no device reports imported or claimed verified |
| 13 | Cheap SDK-free native host job added to ordinary CI |
| 14 | Daily Gold CI configured; local full Gold ARM link and IPK payload validation passed; remote Actions run unavailable |
| 15 | Typed player error categories and shared/legacy diagnostic events added |

Final local validation: webapp's 34 tests and production webpack build passed;
all native host suites passed with undefined-behavior checking;
compatibility-generator tests (4) and package-tool tests (2) passed. Patches install
on a clean pinned Cobalt tree and on an existing baseline-patched checkout;
repeated installation is harmless. ARM syntax checks cover the SDL platform,
both player implementations, capability/rate/lifecycle/diagnostic components
and patched audio/video capability queries. `actionlint` accepts both modified
workflows; shell syntax and the issue-form YAML were checked.

The behavioral defaults intentionally change: unverified devices advertise
H.264 SDR up to 1080p60 and use 1x/pause. Developer overrides must be set before
launch and are process-latched: `YTAF_VIDEO_CAPS=uhd` or `uhd-hdr`, and
`YTAF_PLAYBACK_RATES=common` (or the explicit `full-range` experiment).
Invalid overrides fail closed. `YTAF_SHARED_AV=0`, the marker and all legacy
fallback paths remain. Normal operation requires no root/SSH.

Build/host results do not establish TV playback, live repair, AAC support or
firmware HDR/rate/clipboard behavior. Those device gates remain open. The next
meaningful validation is a known-device trace and the specified playback/
lifecycle matrix in one process.

## Remaining implementation (2026-10-02)

The user confirmed that no TV is available and requested implementation/build
validation in this environment. GREEN-button diagnostics/report copying, native
snapshots and numeric MediaSource tracing are implemented. Webapp tests now
cover 34 cases; report/state/policy host tests and ARM syntax checks pass.
Manual Gold workflows also validate packages; SDK checksums are pinned. A
restrictive-umask package regression now checks non-root readability/execution.
AAC research found no framing/clock/reset specification in verified SDK headers,
so AAC remains on the existing fallback, as required by the conditional plan.

The full local Gold build and final IPK validation passed with genuinely
compiled patched SDL, VP9 and AV1 libraries. The package includes the SDK atomic
runtime required by the linked executable; missing runtime input is rejected. GitHub workflow dispatch returned HTTP 404 with this
connection; no GitHub Actions run is claimed. This environment's kernel cannot
execute i386 programs, so local V8 host-generation tools use qemu-i386 through
a build-only wrapper. The ARM toolchain and target configuration are unchanged.
Compositor clipboard behavior, device playback/lifecycle, live failure diagnosis
and AAC feeding remain evidence-gated. No stable release or TV installation is
performed.

## Full Gold and IPK evidence

Validated source commit: `374464b54f6824efd58d541621471756f5eeac92`.
Cobalt source remains `007628df7bddd86e53d6d151ecd122614916223d`.
See [full validation details](full-gold-build-validation.md) for commands,
artifact checksums, environment workaround and remaining device gates.
The native runtime archive, final IPK, checksums, source metadata and build logs
are retained under local `output/`; binaries are not tracked in Git.

## Follow-up project review (2026-10-02)

[The project review](v2-project-review.md) records reproduced and fixed bugs in
legacy decoder admission/startup/conversions, MSE tracing, settings recovery and
packaging. The updated source passes 42 webapp tests, native host regressions,
ARM Gold incremental linking and exact IPK payload validation. Its artifact
checksums supersede the earlier local package at the same filename. The review
also checks each plan area and preserves the outstanding TV/AAC/live evidence gates.
