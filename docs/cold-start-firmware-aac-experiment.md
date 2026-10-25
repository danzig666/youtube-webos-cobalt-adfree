# Cold-start and firmware-only AAC experiment (2.6.36)

The C3 tester reports most cold-start delay before the YouTube logo. This is
before the settings script: native initialization, executable loading and the
first document/frame need to be distinguished from later webapp work.

## Changes

- The webOS AAC factory no longer checks/loads FDK before selecting firmware
  FFmpeg. It retains the existing channel limit and other-platform behavior.
- Optional `YTAF_PACKAGE_FDK_AAC=0` omits `lib/libfdk-aac.so` and its build
  record from the TV package. It requires a runtime with safe missing-FDK
  handling. Copyright notices remain. Normal packaging defaults to including
  FDK; the workflow's `bundle_aac` input selects the profile.
- Owner-authored pushes changing the native build workflow create firmware-only
  test artifacts. Scheduled builds retain FDK. No build automatically publishes
  a release; the checked publisher requires a separate pinned manifest.
- Missing firmware and missing fallback cause a regular decoder error, never
  construction of an unavailable FDK decoder. Legacy Starfish video and shared
  Opus playback remain available. This does not add compressed AAC to Starfish.
- Creating a hidden settings menu no longer collects the full native report,
  scans the Home guide or formats diagnostic histories. Diagnostics still
  refreshes automatically when opened.
- Native timings now separate audio initialization, SDL, graphics and font
  catalog readiness. The first values begin at executable entry and exclude
  dynamic-loader/webOS scheduling time before `main`.
- Page instrumentation records account selection separately from the video list
  and ready video. Seeing an account selector no longer stops measurement of a
  later list. Page timings have their own origin and are not added to native
  timings. Diagnostics shows a compact startup line above the technical report.

## Scope and rollback

The C3's firmware FFmpeg 59/avutil 57 passed the isolated AAC-LC decode. Earlier
2.6.34 playback worked, but its chosen backend was unconfirmed. A firmware-only
package is an opt-in C3 experiment, not a replacement for compatibility builds.
Older TVs without compatible firmware AAC may lose AAC/live playback in this
experiment. The normal Homebrew catalog stays on 2.6.35. Its packages and bundled
FDK fallback remain available in the prior release.

Removing an unused codec has not been shown to fix the pre-logo delay. Test a
fully closed app after installation, compare the time to the logo and usable
screen, play the known AAC livestream, then open GREEN → Diagnostics. The summary
identifies the selected decoder and startup phases without searching event logs.
No root or SSH is needed for the test. No caches, account data or settings are
cleared by this work.

## Build verification

[2.6.36-beta.1](https://github.com/danzig666/youtube-webos-cobalt-adfree/releases/tag/v2.6.36-beta.1)
contains verified firmware-only IPKs for both application identities. Both full
ARM Gold binaries, 413 web tests, the complete native host suite, nine packaging
tests and 720p/1080p settings checks passed. The published IPKs contain no
FDK-AAC library or FDK build record; their required runtime libraries and legal
notices remain. The normal Homebrew catalog was verified unchanged at 2.6.35.
C3 playback and cold-start speed remain to be measured.
