# Caption preferences and optional DeArrow

Implemented in 2.4.0. Both application IDs contain the same features. All new
preferences use native app preference storage from 2.6.1, with legacy browser
storage migration and verified save-status feedback.
Backup/restore remains excluded.

## Captions

GREEN exposes per-video Prefer on / Prefer off / YouTube choice, a preferred
language, and YouTube default / Extra small / Small / Normal / Large / Extra large text. Default track and language values leave YouTube’s selections untouched;
text has a black backing for visibility. Available tracks are matched by exact language then regional
variant, preferring human captions within the same match. No translation is
requested; unavailable languages preserve the current choice.

The adapter uses the existing YouTube player element with capability checks for
`getOption` / `setOption` to select tracks. It reads `captions.tracklist` and
`captions.track`; when Prefer on needs an unloaded module, it calls
`loadModule('captions')` only if exposed. These controls are internal YouTube
interfaces, not LG APIs and not guaranteed on every TV-client version. Track
preferences are requested once per video/configuration; manual caption choices
cancel pending track requests. Missing languages retain the YouTube choice.

As of 2.6.5, rendered caption sizing has exactly one owner: a persistent scoped
stylesheet. The app does not additionally call the player `captions.fontSize`
option when DOM sizing is available. Earlier releases used both paths, allowing
YouTube's asynchronous API rerender to change the baseline. Extra small uses
60%, Small 80%, Normal 100%, Large 125% and Extra large 150% of the first
unmodified rendered size. That baseline is retained across cue/whole-window
replacement and adjusted proportionally when the viewport height changes.

Rules cover fresh caption segments and known caption-window descendants before
mutation delivery, so a replacement cue cannot paint once at YouTube's alternate
size. The stylesheet is filled before insertion and replaced when its rules change.
Cobalt 23 parses HTMLStyleElement only on insertion/parser completion; changing
textContent after attachment does not update its parsed sheet. The 2.6.4 build
inserted an empty style, leaving Cobalt with an empty parsed sheet even though
Chrome applied later text writes. This failure is reproduced with Cobalt’s real
OnInsertedIntoDocument/Process methods and an insertion-only host DOM fixture.
Computed font sizes are now checked before reporting the override as applied.
Selection shows a toast, and renderer feedback appears before the longer help.

Mutation callbacks update text-leaf markers within the same microtask,
without waiting another animation frame. A 250 ms fallback scan handles clients
with incomplete mutation delivery. No inline font writes compete with the
renderer or overwrite its later updates. Matching nodes are released when
removed; page exit removes the owned stylesheet, markers, observer and timer.
Returning through pageshow restores the stylesheet and observation idempotently.

Caption text has a black, 80%-opaque backing, including YouTube default, because
some TV-client DOM renderers omit the backing shown by LG's official app. Custom
sizes also have an eight-direction black `text-shadow` outline, supported by
Cobalt 23. YouTube default removes all app font-size, line-height and outline
rules while leaving the current YouTube font, colour and text size intact. The
black backing is an explicit visibility improvement, not a claim to reproduce
every styling option of LG's official YouTube client. Unsupported/canvas
renderers remain unchanged. Player font API sizing is retained only as a
fallback for environments without DOM sizing support.

Host regressions cover insertion-only style parsing, computed-size verification,
stable baselines, replacement cues, resolution changes,
black backing/outline, default restoration and absence of competing API writes.
Browser checks at 720p/1080p measure each frame during cue and window replacement.
They use sample caption DOM and cannot prove the C3's current YouTube renderer;
this corrective build still needs a device retest.

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
