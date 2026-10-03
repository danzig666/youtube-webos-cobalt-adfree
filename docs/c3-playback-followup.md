# LG C3 playback follow-up — 2.6.2

This update responds to physical Magic Remote selection failures, sticky option
lists, caption sizes being overwritten, ineffective playback speed, missing
resume positions and the request for automatic seeking.

## Evidence and changes

- Option lists were attached inside the transformed/scrolling settings panel,
  relied on click alone and survived category changes. They now use a fixed
  body portal, focusable button options, primary pointer/mouse release handlers,
  pointer hover focus, outside-pointer dismissal and explicit category cleanup.
  The settings focus guard recognizes the portal. Duplicate compatibility
  mouse/click events cannot save the selection twice.
- Cobalt 23's `HTMLElement::OnCSSMutation` calls the inline-style invalidation
  path; not every direct style-property write delivers the attribute mutation
  on which caption observation relied. Per-text-leaf important stylesheet rules
  survive ordinary YouTube inline writes, with a 250 ms watchdog for silent
  replacement, class changes and newly rendered captions. Baselines are captured
  before any styling to avoid scaling inherited sizes twice. YouTube default
  stops the watchdog/observer and restores prior attributes and inline styles.
- Native rate support defaulted to 1× while JavaScript advertised other rates.
  The new `h5vcc.system.enableYtafPlaybackRates()` bridge enables common fractional
  rates only after an explicit UI choice/shortcut. A process-local atomic flag
  is read by both native backends. Environment overrides take precedence and
  invalid overrides still fail closed. Custom speed is saved as an app setting,
  applied when metadata/playback starts, and monitored briefly for DOM resets
  and native requested/applied-rate feedback. Missing bridge, policy rejection,
  firmware recovery and ignored requests are visible instead of claiming success.
  Existing native idempotence, reset and 1× recovery paths remain intact.
- No existing code established durable app-local bookmarks. The new resume
  fallback requires current video identity, confirmed non-live player metadata,
  compatible finite duration, the watch page and an eligible timeline. It saves
  captured samples, flushing the old sample before identity changes instead of
  reading a reused media element under a new ID. Restoring waits for playback
  and respects YouTube's own position, manual seeking and explicit timestamps.
- Automatic seeking accumulates against the most recent target, not an old
  asynchronous currentTime value. Range clamps handle live DVR and gaps. Full
  held-key sequences are consumed; navigation, category opening, focus changes
  and metadata replacement invalidate deferred work. YouTube's normal
  OK-to-confirm mode remains the default.

## Storage and boundaries

Only bounded `{id, position, duration, updated}` bookmark records enter the
existing private per-package UI preference file. Up to 100 unfinished VODs are
retained for 90 days. Live/DVR, Shorts, ads with exposed ad state and uncertain
metadata are skipped. Bookmarks are not logged, dispatched as configuration
events, included in native diagnostics or synchronized to YouTube/account
history. The setting is on by default and offers disable and clear controls.
Storage failures produce a bounded session warning and throttled retries.

## Validation

147 web regressions pass, including silent Cobalt CSS replacement, pointer-only
selection, duplicate events, popup dismissal, native speed opt-in/confirmation/
recovery, paused rates, local resume, stale navigation callbacks, live exclusion,
seek debouncing, held keys, timeline bounds and native failures. Native host
tests include common/full-range/invalid rate environment overrides and exercise
the real patch installer twice. Browser checks exercise the actual settings UI
at 720p and 1080p with sample native APIs, including category switches with a list
open and repeated caption style overwrites. Synthetic VOD checks cover actual
UI bookmark storage/restoration, rapid deferred seeks and native speed feedback.

Both package IDs are built with the patched ARM Gold runtime and production web
assets. This environment has no LG TV. Browser/native fake-firmware checks do
not establish physical Magic Remote behavior, C3 caption renderer compatibility,
firmware fractional-rate timing or YouTube account history synchronization.
The follow-up release needs a C3 retest of those paths.
