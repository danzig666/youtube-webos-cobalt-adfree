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

## Device feedback — 2026-10-25

| Device | Report | Limits of the observation |
| --- | --- | --- |
| LG C3 | Firmware-only test build works; user reports startup before the YouTube logo is much shorter. | Subjective speed comparison, without a matched before/after stopwatch measurement. Screenshot of 2.6.36 reports audio ready at 13 ms, SDL at 60 ms, graphics at 151 ms and font catalog at 177 ms. These are cumulative native milestones and exclude loading before `main`. That screenshot alone does not identify the audio backend: its latest decoder selection is unknown. |
| LG C4 | Playback reported working, with slight audio/video desynchronization. | Build version, active codec/backend, firmware, audio output route, offset direction and whether it is constant or drifting are not yet confirmed. This is partial compatibility feedback, not a complete playback validation. |

### Initial sync investigation

The firmware adapter uses input microsecond packet timestamps for decoded PCM;
its regression tests already check timestamp preservation across decoder resets.
A separate host comparison decoded the same deterministic two-second stereo AAC-LC
noise stream through the production firmware adapter with FFmpeg 59.18.100 / util
57.17.100 and through FDK 2.0.3 using Cobalt's existing delay-compensation policy.
FDK reported 1744 samples of output delay, which were discarded before comparison.
Both decoders produced 97,280 PCM frames from 95 access units after EOS drain.
Cross-correlation found a best relative waveform lag of zero samples within a
±4096-sample search window. This does not show a fixed decoder sample shift for
that fixture; it does not validate TV presentation latency, long-run clock drift,
other AAC profiles or seek/resume behavior on the C4.

No automatic A/V offset has been added from this report. The next useful evidence
is whether audio leads or trails the picture, and whether the offset is constant,
grows over time, or appears after seeking/pause. Firmware/video presentation and
the audio output path remain possible causes, not established diagnoses.
