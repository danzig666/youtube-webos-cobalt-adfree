# LG C3 caption and Magic Remote correction — 2.6.5

Report against 2.6.4: caption-size preferences save correctly but text stays at
YouTube's default size; the dropdown opens but cursor clicks cannot select an
option. This build corrects Cobalt-specific behavior missed by the earlier
Chrome-only checks.

## Caption stylesheet insertion

Cobalt 23's `HTMLStyleElement::Process()` runs on insertion or parser completion.
Editing an already attached style's text does not reprocess its CSS. The 2.6.4
app appended an empty style and filled it afterward, so Cobalt retained an empty
parsed sheet. The style is now filled before insertion and replaced only when
rules change. The baseline remains stable across cue/window replacement; one
stylesheet owns size, black backing and custom-size black outline. Default
removes font-size/line-height/outline rules and keeps the black backing.

The first confirmation now comes from computed font readback, rather than just
finding text or writing CSS. Caption-size selection shows feedback and places
renderer status before the longer help. If matched text does not acquire the
requested size, feedback says it has not applied instead of claiming success.
Pageshow restores observation and styling after pagehide cleanup.

## Cursor selection

The 2.6.4 opening-key latch could block an option release/click indefinitely
without the expected keyboard release and next pointerdown. That latch is
removed: visible options accept pointerup, mouseup and click directly, including
a click-only sequence. Cobalt's real compatibility-mouse mapper confirms that
cancelling pointerdown can suppress mousedown/mouseup while release still emits
a click. Mouse-only movement now focuses the hovered option for OK selection.

The popup previously lived on YouTube's document body and could inherit disabled
pointer input. It now belongs to the active settings container and explicitly
sets pointer-events to auto. A real-cursor browser regression reproduces the old
unclickable list with body pointer-events none and passes with this correction.

The opener still consumes its trailing mouse/pointer events without dismissing
the list. The release guard protects switches under a dismissed popup, while
visible options take precedence over a previous popup's guard. BACK and menu/
category closure continue removing the list.

## Verification

187 web regressions pass. The cheap native suite now compiles and runs the real
pinned Cobalt style insertion/process and compatibility-mouse/release-click
methods, with parser/CSP/DOM payload boundaries represented by fixtures. An
insertion-only JavaScript DOM fixture reproduces the former empty parsed sheet.
Tests read parsed CSS snapshots rather than the live style text.

Browser checks at 720p/1080p cover release/click-only selection, rapid reopening,
click-through isolation, caption feedback and stable size at every frame across
cue/window replacement. A separate real cursor check covers disabled page
pointer input. Both ARM application IDs contain identical web fixes; native
playback behavior is unchanged.

No physical LG C3 is connected here. These tests identify and reproduce concrete
runtime differences but cannot confirm the TV's current YouTube renderer or the
physical Magic Remote. The separate disappearing-controls and sign-in reports
remain unconfirmed.

Commands: `npm --prefix webapp test` and
`bash scripts/test-native-host.sh <pinned-Cobalt-checkout>`.
