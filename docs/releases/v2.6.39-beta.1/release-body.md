Focused C3 microphone test build. **The public-connection fallback is a candidate fix, not yet confirmed on the TV.** Both packages retain bundled AAC fallback and the existing playback paths. Homebrew stays on 2.6.37.

- Tries LG's SDK public app connection when the private handle is missing, has no dispatcher, or cannot accept the initial recording call. It never starts a second subscription after the first was accepted.
- Shows the actual library/symbol, app connection, dispatcher, service code or socket failure under the voice-language control. Only fixed operation names and numeric codes are displayed.
- Shows delivered audio byte count and whether samples were nonzero. Audio and transcripts are never saved or included in reports.
- Keeps Hungarian language requests and normal startup behavior unchanged.

**Quick test:** install the same app-ID variant, fully close and reopen the app, dismiss LG's voice assistant, then use **YouTube Search's on-screen microphone** without pressing the physical microphone button. After the attempt, open **GREEN → General** and highlight **Voice search language**. If it still fails, send the short reason and audio-byte lines shown underneath.

The physical microphone button still invokes LG's system voice app. The non-operable EN label is not a verified language picker. This build does not claim to fix those OS/UI paths or establish Hungarian recognition yet.

Both IPKs are attached: separate ID `com.cobalt.youtube.adfree` and original ID `youtube.leanback.v4` (replaces official YouTube), with checksums and build records.

Validation: focused native microphone tests including public-only handles and a missing private dispatcher; 428 web tests; production 720p/1080p cursor/persistence checks; successful source CI, full ARM Gold build and final package inspection. AAC fallback, lazy voice loading and required license notices verified in both packages.

Source: `ff94892c707f4e3106f20ff7ba76ebe4f536e673` · [CI](https://github.com/danzig666/youtube-webos-cobalt-adfree/actions/runs/40228972560) · [ARM build](https://github.com/danzig666/youtube-webos-cobalt-adfree/actions/runs/40228972525)
