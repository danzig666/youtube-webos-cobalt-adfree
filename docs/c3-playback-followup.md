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

## 2.6.3 correction after further C3 feedback

The above describes 2.6.2, which did not resolve the reported TV failures.
The first host test for early resume stubbed `Seek()` and missed a second failure:
metadata can precede a seekable MSE range, and the real DOM method clamps a
bookmark to zero through `TimeRanges::Nearest(empty)`. The new test compiles the
real getter, setter and Seek, reproduces both the original exception and the
2.6.2 seek-to-zero, then verifies the corrected pending target across late ranges,
latest-target replacement, zero cancellation and resource reset. Native retry
hooks cover ready state, duration changes, time changes and playback progress.
Local resume uses YouTube's public `seekTo` where available, verifies native frame
position, retries at most three times and never claims success on setter readback.
Settings pointer clicks no longer cancel resume; actual manual seeks still do.

Dropdown removal on pointerup permits Cobalt to hit-test later compatibility
mouse events against underlying switches. Capture consumes the entire release
sequence and outside dismissal, while a new pointerdown permits a new gesture.
Tests explicitly retarget mouseup/click to a switch after removing the popup.

The former speed check ignored readyState below 3/seeking and stopped after five
seconds while retaining a failed preference. Rates are now per-video, cleared on
startup/navigation, toasted, and watched for actual native progress while
buffering. SDK acceptance is not confirmation: sustained presentation rate is
checked too. Failure clears the preference and sends a native 1x reset. The
reset command atomically carries DOM pause intent so buffering rate 0 can recover
without unpausing a genuinely paused video. A real shared Step regression covers
accepted Play with no frames, fractional deferral, one-shot application, reset
with no new frames, user pause and delayed load completion. The legacy backend
keeps its independent audio/video clocks at 1x rather than exposing unverified
fractional playback through the new setting.

Playback has a visible reset action and a selectable Remote reset key. Quick
Left/Right seeking debounces for 80 ms, with a separate 300 ms mode. Both combine
rapid taps and apply after the last press without OK.

These changes require a native runtime update. Host/browser/build validation
cannot establish that the C3 firmware now plays or resumes correctly. A TV retest
remains necessary; the release does not claim the intermittent controls issue
is confirmed resolved.

## Intermittent controls and early account resume

The user clarified that SponsorBlock and the timeline initially work, then can
stop partway through playback. That is distinct from failure at startup; the
physical failure is not reproducible without the TV. These additional changes
address concrete code defects and preserve state for a follow-up report:

- The old global video-style observer forced width/height/left/top, overwriting
  YouTube's hidden/offscreen geometry during navigation and completion. It is
  removed: native SDL/Starfish already inhibit the screen saver while playing.
- The text-data guard replaced Cobalt's inherited native `CharacterData.data`
  accessor and inserted/removed an empty text node on every write. Cobalt already
  invalidates layout and reports character-data changes. Preserve its native
  accessor, and make a fallback for missing accessors idempotent without phantom
  child mutations. This removes an avoidable source of mutation traffic; it is
  not proof that mutation traffic caused the C3 failure.
- GREEN reattaches the same settings node if YouTube removes its parent during
  rendering, retaining listeners/preferences rather than creating duplicate
  controllers. Initialization is marked complete only after listeners exist.
- SponsorBlock starts discovery before an initial video identity is available,
  rebinds after media-element replacement, and retries transient API failures
  twice with 10/30-second delays. Navigation/config changes invalidate retries.
  Features disabled at startup can be initialized once when later enabled.
- Diagnostics now include media ready/paused/seeking/ended state, position,
  settings initialization, SponsorBlock fetch status/count/retries/HTTP status,
  media binding and polling state. No video identities, URLs or response bodies
  enter those app diagnostics.
- Cobalt's existing `currentTime` setter raises `INVALID_STATE_ERR` before
  metadata. The new webOS DOM patch retains the latest finite early position,
  reports it through the getter, applies it once at metadata and resets it for
  each resource load. This fixes a reproducible lost-request path that could
  explain YouTube knowing a bookmark while native playback starts at zero.
  The local bookmark fallback remains optional and does not replace YouTube's
  own resume point. Physical account-resume behavior still needs a C3 retest.

## Storage and boundaries

Only bounded `{id, position, duration, updated}` bookmark records enter the
existing private per-package UI preference file. Up to 100 unfinished VODs are
retained for 90 days. Live/DVR, Shorts, ads with exposed ad state and uncertain
metadata are skipped. Bookmarks are not logged, dispatched as configuration
events, included in native diagnostics or synchronized to YouTube/account
history. The setting is on by default and offers disable and clear controls.
Storage failures produce a bounded session warning and throttled retries.

## Validation

155 web regressions pass, including silent Cobalt CSS replacement, pointer-only
selection, duplicate events, popup dismissal, native speed opt-in/confirmation/
recovery, paused rates, local resume, stale navigation callbacks, live exclusion,
seek debouncing, held keys, timeline bounds and native failures. Native host
tests include common/full-range/invalid rate environment overrides and exercise
the real patch installer twice. A host regression compiles actual upstream and
patched DOM methods, reproducing the lost pre-metadata seek and verifying latest
request retention, zero cancellation and one-shot dispatch at metadata. Browser checks exercise the actual settings UI
at 720p and 1080p with sample native APIs, including category switches with a list
open and repeated caption style overwrites. Synthetic VOD checks cover actual
UI bookmark storage/restoration, rapid deferred seeks and native speed feedback.

Both package IDs are built with the patched ARM Gold runtime and production web
assets. This environment has no LG TV. Browser/native fake-firmware checks do
not establish physical Magic Remote behavior, C3 caption renderer compatibility,
firmware fractional-rate timing or YouTube account history synchronization.
The follow-up release needs a C3 retest of those paths.
