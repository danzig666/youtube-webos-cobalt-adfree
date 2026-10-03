# Usability improvements and follow-up ideas

This batch makes common actions discoverable from the GREEN menu and keeps
feedback honest when native capabilities or storage are unavailable. Both the
original-ID and separate-ID packages receive the same features.

## Implemented for 2.2.0

| Improvement | User flow | Important behavior |
| --- | --- | --- |
| SponsorBlock channel exceptions | Play a video → GREEN → Never skip SponsorBlock on this channel | Saves a stable channel ID; applies immediately to all SponsorBlock categories and future videos; does not change ad blocking |
| Manage channel exceptions | Next saved channel exception → Remove selected channel exception | Up to 200 exceptions; no need to play a saved channel to remove it |
| Sleep timer | GREEN → Sleep timer → OK | Off / 15 / 30 / 60 / 90 minutes; visible countdown and direct Cancel action; pauses the current video |
| Remote help | GREEN → Show remote help | Explains navigation, captions, rate shortcuts, timer and video-quality restart requirement |
| Optional numeric shortcuts | GREEN → Numeric playback shortcuts | Persisted switch; never intercepts text-entry targets or modified/repeated key presses |
| Remember menu position | Close and reopen GREEN menu | Restores the last focused item and scrolls it into view; deferred focus cannot reopen a closed menu |
| Save feedback | Change a menu preference | Distinguishes saved preferences from session-only changes and recovers after a later successful write |

Channel exceptions survive ordinary app restarts when local storage succeeds.
They are app preferences, not synced account preferences, and remain separate
between the two app IDs. Clearing app data or uninstalling can remove them.
Names are display labels only. Video-to-channel metadata is held in a bounded
in-memory cache, never persisted as viewing history or included in reports.
When any exceptions are configured, missing/mismatched channel metadata blocks
SponsorBlock skipping until the current channel is known. Queued skips and late
segment responses recheck policy. If a video changes while the menu is open,
the new channel must be reviewed before changing its exception.

The timer uses an absolute deadline, so suspended JavaScript does not extend it.
It expires once, pauses the current video if available, and reports a pause
failure rather than claiming success. It is session-only and cannot power off
the television. Native resume timing and the live YouTube DOM remain TV tests.

## Implemented for 2.3.0

- **SponsorBlock actions per category:** Auto skip / Ask first / Markers only /
  Off. Existing enabled categories become Auto skip; disabled ones remain Off.
  Ask first defaults to Keep watching, with Left/Right and OK to choose. BACK
  declines; GREEN dismisses the prompt and opens settings. A declined prompt
  does not reappear for that segment during the current video. An automatic
  skip stops before overlapping segments that require approval. Channel
  exceptions take precedence over every mode, including manual skips.
- **Custom number-key actions:** GREEN → Remote number key → Action for selected
  key. Map 0–9 to captions, slower/faster playback, stop-after-video/continue,
  cancel sleep timer, skip the current SponsorBlock segment, or no action.
  Defaults remain 0 captions, 1 slower and 3 faster; other keys have no action.
  The master switch and text-entry protection remain. Preferences persist in
  this app's local storage. GREEN, BACK and navigation remain available.
- **Stop after this video:** session-only, requires a current video with a known
  duration and video ID. Natural `ended` holds subsequent autoplay paused.
  GREEN → Continue playback releases the hold. Cancel before the ending to
  disarm it; navigating to another video before the ending cancels it too.
  The next video can load while held. This does not power off the TV or change
  account autoplay settings. Live playback without a known ending is refused.

Backup/restore is not included, as requested. No settings are uploaded.

The stop control depends on the TV client's natural-ended and navigation event
ordering. It must be tested on a TV; a client that navigates before emitting
`ended` can cancel the pending stop. Host tests cannot confirm that ordering.

## Implemented for 2.4.0

- **Caption preferences:** GREEN → Captions on each video, Preferred caption
  language, Caption text size. Defaults defer to YouTube. Prefer on/off, choose
  an available language (including Hungarian), and choose Large or Extra large.
  Requests apply once per video, with bounded retries while controls load;
  manual caption actions cancel pending requests. Missing languages keep the
  current choice. There is no automatic translation. Returning to YouTube choice
  stops future overrides; reset the current video through YouTube's caption menu.
- **Optional DeArrow:** Off (default), Titles only, or Titles and thumbnails.
  Changes supported visible video cards, using community submissions. Missing
  data and image failures preserve original content. Show original titles and
  thumbnails pauses replacements for the session; Resume DeArrow restores them.
  Off cancels pending requests and restores content still owned by the feature.
  No video history or DeArrow cache is persisted. The setting explains external
  requests before activation. Account credentials are never added to requests.
- **Cobalt DOM compatibility:** marker and focus checks use `contains()` because
  Cobalt 23 does not expose `Node.isConnected`.

See [caption and DeArrow integration evidence](caption-dearrow-integration.md)
for API sources, bounds, privacy behavior and outstanding TV checks.

## Historical 2.5.0 (comments removed in 2.6.1)

- **Read-only comments:** GREEN → Comments for this video. Top/Newest sorting,
  on-demand pages and replies; remote arrows/OK/BACK/GREEN.
  Requests are on demand with cancellation, bounded memory, Retry and explicit
  handling of unavailable comments. Old results cannot populate a new video.
  [Behavior, evidence and validation limits](comments-viewer.md).

## Historical 2.5.1 (comments removed in 2.6.1)

- **Expanded comments:** full received text in a scrolling list, no preview
  expansion or text pages. Replies return to the parent scroll position.
- **Magic Remote wheel:** native SDL-to-Starboard wheel delivery; scrolling in
  comments/replies and throughout GREEN settings, help and diagnostics. Wheel
  scrolling preserves useful focus without toggling settings. Outside our
  overlays, YouTube receives native wheel events unchanged.
- Host regressions cover wheel direction, precise/invalid deltas, line/pixel/page
  units, boundaries and full text. Chromium checks cover wheel/arrow switching,
  reply return position and settings focus. Physical TV validation is pending.

## Implemented for 2.6.0

- **Blue interface:** navy surfaces, rounded controls, larger setting labels,
  soft blue focus outlines, consistent notifications and comment cards.
- **Settings categories:** General, Playback, Captions & titles, Remote,
  SponsorBlock and Diagnostics. Right enters a category, Left returns to the
  category rail. Hidden settings are excluded from navigation; the wheel scrolls
  only the current category. A visible close button supports pointer use.
- Source UI checked in Chromium at 720p and 1080p for category selection,
  navigation, focus visibility, wheel behavior and comments return position.
  See [design and validation](blue-interface.md).

## Corrected after LG C3 testing (2.6.1)

- Removed the separate comments reader and unused clipboard-copy UI.
- Replaced cycling choices with explicit combobox-style option lists.
- Listed keys 0–9 separately, each with an action picker.
- Displayed the whole diagnostics report on category opening, with wheel and
  arrow scrolling instead of pages.
- Consumed full BACK key sequences so settings dismissal does not close video.
- Moved sponsored QR blocking exclusively into General, centred the close icon,
  removed the startup notification and cleaned up expired notification shells.
- Added durable, checked native preference saves; adblocking defaults on.
- Added smaller caption sizes, delayed/verified API size application and DOM
  text sizing when the player API is absent. C3 rendering needs retesting.

## Follow-up ideas, not implemented in this batch

1. **Guided device check:** a checklist for launch, VOD, live/DVR, seeking, HDR
   and lifecycle behavior, with an exportable result. Report observed results
   rather than automatically enabling codecs from a TV model name.
2. **Undo the last SponsorBlock skip:** bounded per-video seek history and an
   explicit remote action. Validate interaction with live/DVR windows and
   prevent the same segment from immediately skipping again.
3. **Compact and larger-text settings layouts:** preview sizing before saving,
   then verify focus and scrolling at actual TV output resolutions.

## Validation

Host tests exercise the real remote handler, choice controls, configuration
persistence and SponsorBlock controller. They cover held OK/synthetic clicks,
storage failure/recovery, stable channel IDs, stale metadata, late responses,
queued skip cancellation, removing exceptions, video changes, timer replacement,
cancellation, resume expiry, failed pause, editable fields and menu focus.
Production assets and both ARM Gold/IPK variants are validated before release.
No TV is available: neither live UI compatibility nor sign-in/pairing is claimed
verified. Keep publishing both IDs until separate-ID sign-in is confirmed.

## Home refresh (2.6.7)

General → Refresh Home recommendations reloads the YouTube Home page. Assign
the same action to any key 0–9 under Remote; default key mappings remain intact.
The master numeric-shortcut switch, editing protection and held-key suppression
apply. It only activates on known Home routes and never during Watch/Shorts.
If navigation begins during the brief notification, the pending refresh cancels.

Cobalt 23 has no History.replaceState and recreates sessionStorage with Window.
The action uses supported Location.replace with a transient Home query flag;
later refreshes use Location.reload because identical replace URLs with a hash
are ignored. Initial startup routing bypasses the saved startup page once per
document when this flag is present. Ordinary relaunches still apply the saved
preference, and fresh app launches start with their normal URL. The preference,
accounts and bookmarks are not cleared. This is a page reload, not an unverified
YouTube internal refresh endpoint. Recommendations may remain the same.

Host regressions cover route restrictions, duplicate presses, navigation races,
missing/failed navigation APIs, one-shot startup bypass and per-key activation.
Browser integration checks exercise actual reloads and saved mappings on Home
with History reduced to its Cobalt shape. Physical Home-route/API behavior still
needs a TV check.
