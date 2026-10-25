Experimental C3 packages without the bundled FDK-AAC library. The normal Homebrew catalog remains on **2.6.35**, retaining its fallback; that release remains available for rollback.

- Removes `lib/libfdk-aac.so` and its build record from the TV IPK. Legal notices and required C++ runtime libraries remain. No FFmpeg library is bundled.
- Decouples firmware AAC selection from FDK loading. Missing firmware/fallback now reports a decoder error instead of attempting to construct an unavailable FDK decoder.
- Stops collecting native Diagnostics reports while the settings menu is hidden during startup. Diagnostics still updates automatically when opened.
- Adds audio initialization and font-catalog timing alongside SDL/graphics timings. Page instrumentation separates account selection from the later video list. The compact Diagnostics startup line shows the available milestones.
- Preserves Starfish hardware video, shared Opus and the legacy player. This does not remove Cobalt or add compressed AAC to Starfish.

**Test on the C3:**

1. Install the same app-ID variant you already use, then fully close/reopen the app.
2. Compare a cold start's time to the YouTube logo and to the video list.
3. Play the previously failing AAC livestream: https://www.youtube.com/watch?v=YaJgf-Pw7S4
4. Open **GREEN → Diagnostics** and send the top summary showing decoder and startup timings. Check sound, lip sync and seek/pause behavior too.

Removing FDK has **not been shown to fix the delay before the logo**. Native timings start at executable entry, excluding earlier webOS scheduling and dynamic-loader work. Page timings have a separate origin and must not be added to native timings.

The C3's firmware FFmpeg 59/avutil 57 passed the earlier AAC probe. Other TVs without compatible firmware AAC may lose AAC/livestream playback in this experiment. Use **2.6.35** for the bundled fallback. No root/SSH is needed, and this work does not clear settings, caches or account data.

Both IPKs are attached, for `com.cobalt.youtube.adfree` and `youtube.leanback.v4`. The original-ID package replaces official YouTube.

Validation: 413 web tests, complete native host suite, no-FDK decoder/admission regressions, nine packaging tests including omission and safe-runtime guards, actual settings/browser tests at 720p/1080p, full ARM Gold build and final package checks. C3 speed and firmware-only playback confirmation remain pending.

Source: `0b6952608c7b000f235ea017d25fca53a5a95100` · [CI](https://github.com/danzig666/youtube-webos-cobalt-adfree/actions/runs/40176776947) · [ARM Gold build](https://github.com/danzig666/youtube-webos-cobalt-adfree/actions/runs/40176776914)
