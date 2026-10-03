# Caption preferences and optional DeArrow

Implemented in 2.4.0. Both application IDs contain the same features. All new
preferences use native app preference storage from 2.6.1, with legacy browser
storage migration and verified save-status feedback.
Backup/restore remains excluded.

## Captions

GREEN exposes per-video Prefer on / Prefer off / YouTube choice, a preferred
language, and YouTube default / Extra small / Small / Normal / Large / Extra large text. Default values leave
YouTube untouched. Available tracks are matched by exact language then regional
variant, preferring human captions within the same match. No translation is
requested; unavailable languages preserve the current choice.

The adapter uses the existing YouTube player element with capability checks for
`getOption` / `setOption`. It reads `captions.tracklist` and `captions.track`;
when Prefer on needs an unloaded module, it calls `loadModule('captions')` only
if exposed. These track/module controls are internal YouTube interfaces, not
LG APIs and not guaranteed on every TV-client version. The public YouTube
[IFrame API](https://developers.google.com/youtube/iframe_api_reference#onApiChange)
documents `captions.fontSize`: Small uses -1, Normal 0, Large 1 and Extra large 2.
Size requests wait until the caption module exposes a numeric option and check
read-back. Track selection is not repeated while waiting for font readiness.

On TV clients without those methods, the app styles rendered caption segments
and text leaves in known caption windows. Extra small scales to 60%, Small 80%,
Normal 100%, Large 125% and Extra large 150% of their original computed size.
Mutation observation handles new text/segments; writes are idempotent and original
inline styles are restored on YouTube default. This affects caption elements,
not the native video plane or ordinary YouTube text. Unknown/canvas renderers
cannot be sized through CSS. The C3's exact renderer is not available here and
must be retested; API confirmation or matched text is required before reporting
size as applied.

Pending readiness is retried at most 20 times at 250 ms intervals. Writes are
attempted once per current video/configuration; exceptions do not trigger repeat
writes. Matching player identity is checked when `getVideoData` is available.
Native caption-button activation and the caption shortcut cancel pending
preferences. Settings explicitly changed in GREEN may request them again.
Changing to YouTube choice stops future overrides; the current player state is
not reset behind the user's back. Track feedback says “requested”; size feedback distinguishes pending controls
from confirmed options or rendered text. Host tests cannot verify C3 rendering.

## DeArrow

Default Off makes no DeArrow requests or polling timer. Titles only and Titles
and thumbnails use community submissions on supported visible video cards.
There is no local title rewriting, random thumbnail generation, voting or
submission. If the highest eligible server-ranked entry recommends the original,
that choice is respected. Remote title text is bounded and assigned through
`textContent`, never HTML. Unrecognized DOM layouts are left intact.

The integration uses these upstream interfaces, inspected on October 2, 2026:

- [DeArrow branding client](https://github.com/ajayyy/DeArrow/blob/00275920e71f894d13ed6f765afb4e47fb7a7c9f/src/dataFetching.ts):
  `GET https://sponsor.ajay.app/api/branding?videoID=…`.
- [Server result model](https://github.com/ajayyy/SponsorBlockServer/blob/121e1c6edbb9628393c2d405b8ab1fef47917e7a/src/types/branding.model.ts):
  ranked title and thumbnail entries, original flags, votes, locked status and
  screenshot timestamps. A live public response was checked against this model.
- [Thumbnail endpoint](https://github.com/ajayyy/DeArrowThumbnailCache/blob/d5e9ae6844e214aeedfbb2ae8d563942f72dc0a1/app.py):
  `GET https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=…&time=…`.

A submitted thumbnail is preloaded before replacement. Load failures and
8-second timeouts keep the original; displayed-image errors restore it. There
is no automatic retry storm. Off and Show originals cancel pending work and
restore only content still matching our replacements, preserving later YouTube
updates. Card identities and configuration generations guard asynchronous
responses against recycled cards and setting changes.

Requests contain validated public video IDs and submitted timestamps, not
YouTube cookies, OAuth credentials or full video URLs. The services can see the
requested IDs and network address; the menu discloses this before opt-in.
Branding XHR explicitly omits cross-origin credentials. Nothing is added to
playback diagnostics or persisted as browsing history.

Bounds: two concurrent branding requests, 8-second request timeout, 64 KiB
accepted JSON, 100 cached results, 10-minute positive cache / 1-minute failure
cache. Visible-card scans run every two seconds, examine at most the first 100
candidate cards and request at most 30 visible ones. Restoration records are
bounded to 100. Thumbnail timestamps must be finite and within 24 hours. There
is no periodic work when disabled. Cache and Show originals state are session-only.

Cobalt's CSP integration adds only the fixed HTTPS thumbnail host to `img-src`
and its `default-src` fallback; no wildcard is added. The existing SponsorBlock
host allowance covers branding requests. Asset installation applies the
additional patch idempotently to fresh and previously patched Cobalt trees.

## Validation limits

Host tests cover preference migration/persistence, language matching, manual
caption cancellation, stale player identity, bounded retries, malformed DeArrow
responses, concurrency/cache bounds, missing data, disabled requests, recycled
cards, late callbacks, original restoration and thumbnail failures. Both ARM
Gold/IPK variants are built with the CSP change. Cobalt DOM IDL was checked;
connected-node checks use `contains()` rather than unavailable `isConnected`.

No LG TV is available. Caption API availability, actual caption rendering,
YouTube TV card selectors, thumbnail decoding, remote interaction and firmware
behavior remain device-validation items. Neither unsupported caption controls
nor missing DeArrow data are treated as playback failures.
