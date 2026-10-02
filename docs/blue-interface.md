# Blue interface (2.6.0)

The app's custom overlays use a navy/blue palette with opaque surfaces, rounded
cards, explicit Arial typography, larger setting labels and soft blue focus
outlines. The reading column in comments is limited to 1120 pixels to keep long
lines comfortable. Full comment text, line breaks and wheel scrolling remain.

## Settings navigation

| Category | Controls |
| --- | --- |
| General | Ad blocking, startup page, comments, automatic account selection, dislikes, Shorts |
| Playback | Video quality, sleep timer, stop after this video |
| Captions & titles | Caption preferences, optional DeArrow |
| Remote | Numeric shortcuts, custom key actions, remote help |
| SponsorBlock | Master toggle, per-category behavior, channel exceptions |
| Diagnostics | Native playback report, report pages, copy report |

Up/Down chooses a category; OK selects it and Right enters its controls.
Left returns to the selected category. Up from the first control also returns
to that category. At the bottom, Down stays on the last control. BACK and the
visible close button dismiss the menu. Mouse selection and Magic Remote wheel
scrolling work alongside the arrow keys. Changing a category resets its scroll
position and puts focus on its category button. Reopening the menu retains the
selected category in the current page session.

Settings nodes are moved into category panes once and retained, preserving their
callbacks and state. Hidden panes are excluded from remote focus selection.
A category button does not scroll the content viewport. Wheel input never changes
a setting; switching between wheel and keys keeps focus in the visible category.

## Compatibility and verification

The design uses basic block/flex layout, explicit colors and standard borders;
no CSS variables, CSS Grid, backdrop filters, external fonts or new native API
are required. The installed Cobalt source exposes the getClientRects API used
to filter hidden controls. Styling remains a browser/UI change.

Host tests cover category routing, retained controls, selection state, synthetic
click suppression and the existing media/menu regressions. Chromium checks at
1280×720 and 1920×1080 cover category navigation, settings changes, focus,
wheel scrolling, comments opening/return, close-button behavior and full comment
text/replies. Preview screenshots use labeled sample data and a neutral backdrop.

Both ARM packages are built with the updated production assets. No LG TV is
available, so native Cobalt rendering and physical Magic Remote behavior still
require device validation. YouTube's own browsing/player interface is supplied
by YouTube; this redesign covers the app's settings, comments, prompts and
notifications.
