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

## Follow-up ideas, not implemented in this batch

1. **Settings backup and restore:** a versioned, allowlisted report containing
   preferences only, with a preview before import. Keep accounts, tokens,
   cookies, video URLs and viewing history out of it. First choose a usable
   on-TV transfer method; clipboard support varies by firmware.
2. **Caption preferences:** preferred language and readable caption presets.
   First verify how the current YouTube TV client exposes these choices and
   retains them; avoid repeatedly overriding the user's in-player selection.
3. **Guided device check:** a checklist for launch, VOD, live/DVR, seeking, HDR
   and lifecycle behavior, with an exportable result. Report observed results
   rather than automatically enabling codecs from a TV model name.
4. **Undo the last SponsorBlock skip:** bounded per-video seek history and an
   explicit remote action. Validate interaction with live/DVR windows and
   prevent the same segment from immediately skipping again.
5. **Compact and larger-text settings layouts:** preview sizing before saving,
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
