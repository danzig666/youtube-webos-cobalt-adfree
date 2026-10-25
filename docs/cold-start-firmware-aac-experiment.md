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
- Push and scheduled builds retain FDK. Firmware-only packages require an
  explicit manual workflow dispatch with `bundle_aac=false`. Earlier experiment
  push builds omitted FDK; that automatic omission was reverted after the C4
  webOS 26 livestream failure below. No build automatically publishes a release;
  the checked publisher requires a separate pinned manifest.
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
The device feedback below records subsequent playback and startup observations;
these host/build checks do not establish cross-device playback compatibility.

## Device feedback — 2026-10-25

| Device | Report | Limits of the observation |
| --- | --- | --- |
| LG C3 | Firmware-only test build works; user reports startup before the YouTube logo is much shorter. | Subjective speed comparison, without a matched before/after stopwatch measurement. Screenshot of 2.6.36 reports audio ready at 13 ms, SDL at 60 ms, graphics at 151 ms and font catalog at 177 ms. These are cumulative native milestones and exclude loading before `main`. That screenshot alone does not identify the audio backend: its latest decoder selection is unknown. |
| LG C4 | Third-party report: playback works; “There is a slight desync in audio playback with 2.6.35 and 2.6.36 compared to YTAFNB.” | Direction, amount, drift behavior, active codec/backend, firmware and audio output route are unknown. The maintainer relaying the report has not personally noticed it. This is an unconfirmed sync report and partial compatibility feedback, not complete playback validation. |
| LG C4, webOS 26, firmware 43.21.73 | Follow-up: livestreams fail in firmware-only 2.6.36 and work again in 2.6.35. The supplied Diagnostics screenshot identifies “Bundled AAC decoder (FDK fallback)”. | This narrows the earlier general playback report: firmware-only livestream compatibility is not established on this C4. The screenshot shows the working fallback selection, not a 2.6.36 decoder failure trace. It does not establish why firmware AAC was rejected or failed. |

### C4 compatibility decision

Keep 2.6.35 as the recommended compatibility release for this configuration.
Retain the packaged FDK fallback in all normal push, scheduled and default manual
builds; keep firmware-only packaging explicitly opt-in. This does not disable
firmware AAC on TVs where it works or revert the independent startup changes.

The adapter currently accepts firmware libavcodec 59 / libavutil 57 and requires
compatible 32-bit libraries. A different ABI, unavailable libraries or a startup
decode failure can select FDK; the current report does not distinguish them.
The capability test's firmware AAC inventory/probe and a failed 2.6.36 playback
log would distinguish those cases. No model-based decoder rule is justified yet.

LG config/system queries report LS2 registration permission denied (-1027) in the
same screenshot, and the Starfish limit query is unavailable. These are separate
diagnostic failures; they do not prove that AAC decoding requires those queries
or that a permission error caused the firmware-only playback failure. The working
FDK selection is positive evidence to preserve the compatibility fallback.

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

The reporter names both 2.6.35 (bundled fallback present) and 2.6.36 (fallback
omitted), compared with YTAFNB. The observation is therefore not specific to
removing the bundled library. Both versions can select firmware FFmpeg AAC, so
this comparison does not rule that decoder path in or out. No global delay or
model-specific timing policy is justified by the currently available evidence.
