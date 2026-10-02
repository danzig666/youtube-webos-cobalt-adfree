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

## Follow-up ideas, not implemented in this batch

1. **Caption preferences:** preferred language and readable caption presets.
   First verify how the current YouTube TV client exposes these choices and
   retains them; avoid repeatedly overriding the user's in-player selection.
2. **Guided device check:** a checklist for launch, VOD, live/DVR, seeking, HDR
   and lifecycle behavior, with an exportable result. Report observed results
   rather than automatically enabling codecs from a TV model name.
3. **Undo the last SponsorBlock skip:** bounded per-video seek history and an
   explicit remote action. Validate interaction with live/DVR windows and
   prevent the same segment from immediately skipping again.
4. **Compact and larger-text settings layouts:** preview sizing before saving,
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
