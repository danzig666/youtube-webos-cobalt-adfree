# Blue interface (2.6.1)

The app's custom overlays use a navy/blue palette with opaque surfaces, rounded
cards, explicit Arial typography, larger setting labels and soft blue focus
outlines. The custom comments reader is removed; use YouTube comments.

## Settings navigation

| Category | Controls |
| --- | --- |
| General | Ad blocking, startup page, sponsored QR blocking, automatic account selection, dislikes, Shorts |
| Playback | Video quality, sleep timer, stop after this video |
| Captions & titles | Caption preferences, optional DeArrow |
| Remote | Numeric shortcuts, all 0–9 keys with individual action selectors, remote help |
| SponsorBlock | Master toggle, per-category behavior, channel exceptions |
| Diagnostics | Full native playback report in one scrolling textbox |

Up/Down chooses a category; OK selects it and Right enters its controls.
Left returns to the selected category. Up from the first control also returns
to that category. At the bottom, Down stays on the last control. BACK and the
visible close button dismiss the menu and consume the full BACK press/release.
An open choice list consumes BACK to cancel it before settings can close. Mouse selection and Magic Remote wheel
scrolling work alongside the arrow keys. Changing a category resets its scroll
position and puts focus on its category button. Reopening the menu retains the
selected category in the current page session.

Settings nodes are moved into category panes once and retained, preserving their
callbacks and state. Hidden panes are excluded from remote focus selection.
A category button does not scroll the content viewport. Wheel input never changes
a setting; switching between wheel and keys keeps focus in the visible category.

## Compatibility and verification

The design uses basic block/flex layout, explicit colors and standard borders;
no CSS variables, CSS Grid, backdrop filters or external fonts are required.
Cobalt 23 lacks native HTML select/textarea controls: option lists and the
read-only report use supported div elements with combobox/listbox/textbox roles.
A small native binding persists UI preferences in app storage. The installed Cobalt source exposes the getClientRects API used
to filter hidden controls. Styling remains a browser/UI change.

Host tests cover category routing, retained controls, selection state, synthetic
click suppression and the existing media/menu regressions. Chromium checks at
1280×720 and 1920×1080 cover category navigation, settings changes, focus,
wheel scrolling, full-report arrow reading, option selection/cancellation,
BACK isolation, preference reload, QR placement and notification cleanup. Preview screenshots use labeled sample data and a neutral backdrop.

Both ARM packages are built with the updated production assets. No LG TV is
available, so native Cobalt rendering and physical Magic Remote behavior still
require device validation. YouTube's own browsing/player interface is supplied
by YouTube; this redesign covers the app's settings, prompts and
notifications.

## LG C3 corrective update

2.6.1 removes the startup notification and deletes notification containers after
expiry (including their empty shell). The QR option lives exclusively in General.
The close icon uses two centred CSS strokes, avoiding a font baseline offset.
Choice lists display every available option without saving merely on opening.
Keyboard repeats and trailing synthetic clicks cannot make another selection.
Diagnostics snapshots refresh when the category opens; no paging/copy controls.

Native UI preferences use an app-ID-specific mode-0600 file, bounded to 64 KiB,
with fsync and atomic replacement. Failed saves are shown as session-only. See
[the C3 fixes](lg-c3-ui-fixes.md) for evidence and remaining TV verification.
