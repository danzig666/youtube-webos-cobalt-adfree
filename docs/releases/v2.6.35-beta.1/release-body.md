Diagnostics now opens with a readable summary showing the latest playback decoder, playback state and SponsorBlock status. You do not need to run a capability test or search through logs to identify the AAC backend.

The decoder line says one of:

- **TV built-in AAC decoder (FFmpeg 59)**
- **Bundled AAC decoder (FDK fallback)**

The native selection is retained separately from the event ring, so capability queries and long playback sessions cannot evict it. The heading says “Latest playback decoder” because a selection can still be reported after playback stops. Older runtimes use recent decoder-selection events when available and otherwise report that the backend is unavailable.

Technical details follow the summary. Up/Down move by two lines instead of 70% of a page. Wheel jumps in Diagnostics are limited to a few lines, including TVs that send large or page-sized deltas. Scrolling elsewhere is unchanged. Technical reports remain bounded and contain no account data or signed video URLs.

**C3 check:** install your usual app-ID variant, fully close/reopen, start the livestream, then open **GREEN → Diagnostics**. Photograph the summary at the top. No capability test is needed.

AAC playback policy is unchanged from 2.6.34: firmware FFmpeg 59 is preferred, bundled FDK remains available as fallback. Playback on the C3 was reported working in 2.6.34; the active backend had been difficult to identify.

Both IPKs are attached:

- `com.cobalt.youtube.adfree_2.6.35_arm.ipk` — separate app identity.
- `youtube.leanback.v4_2.6.35_arm.ipk` — original app identity.

Validation: 411 web tests, complete native host suite, retained decoder status after event-ring eviction and fallback selection, real settings/browser checks at 720p and 1080p, summary visibility/backend refresh checks at both resolutions, production web build, both ARM Gold binaries and final package checks. C3 GUI confirmation remains pending.

Source: `c6da80646fa68d0873a1ebe8ba2081a8fa68764e` · [CI](https://github.com/danzig666/youtube-webos-cobalt-adfree/actions/runs/40107611192) · [ARM Gold build](https://github.com/danzig666/youtube-webos-cobalt-adfree/actions/runs/40107625386)
