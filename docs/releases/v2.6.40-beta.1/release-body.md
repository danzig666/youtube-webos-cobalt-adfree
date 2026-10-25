Home and Shorts ads are now filtered before YouTube renders the first response. Ad blocking defaults **on**. The unused GREEN-menu voice-language selector has been removed; voice search follows YouTube’s own language setting.

- Adapts [RF1705 upstream #119](https://github.com/RF1705/youtube-webos-cobalt-adfree/pull/119): removes entire nested ad tiles, ad slots and mastheads before clearing their identifying fields, preventing blank feed tiles.
- Applies the filter during early preload, continuation responses and cached guide updates. Sponsored shopping QR filtering also starts early and keeps its separate switch.
- Preserves saved ad-block choices, Home refresh, Shorts preferences, playback/watch-time tracking and SponsorBlock channel metadata. Retains the Cobalt-compatible DOM fallback and the older-runtime response-filter fallback.
- Removes the independent voice-language selector and all associated speech/HTTP request overrides. **For Hungarian, use YouTube Settings → Language → Magyar.** The TV may stay English.
- Keeps microphone state and audio-delivery counts in the short Diagnostics summary.

**Recommended package for the tested C3:** `youtube.leanback.v4_2.6.40_arm.ipk`. It replaces official YouTube. The tester confirmed microphone capture and Hungarian recognition with this identity in 2.6.39. The separate-ID package is also attached for coexistence, but LG rejected microphone capture under that ID on the tested C3.

Bundled AAC fallback remains included for C4/webOS 26 livestream compatibility. Firmware AAC selection, playback backends and startup improvements are retained.

Validation: 421 web tests, production webpack build, settings/cursor checks at 720p and 1080p, successful source CI/native host regressions, full ARM Gold build and inspection of both final IPKs. Early ad filtering is host/browser-validated; a TV test of this release is still pending. Checksums and exact build/source records are attached. The Homebrew catalog is updated after verified publication.

Source: `58a2406b81faf4a2eb0fd0d430ff52988494a9dd` · [CI](https://github.com/danzig666/youtube-webos-cobalt-adfree/actions/runs/40235944377) · [ARM build](https://github.com/danzig666/youtube-webos-cobalt-adfree/actions/runs/40235944263)
