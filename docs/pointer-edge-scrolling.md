# Magic Remote edge scrolling (2.6.49, experimental)

**GREEN → General → Magic Remote edge scrolling** (on by default in this test
build). Rest the pointer near the left or right screen edge to move the row
under it; rest near the top or bottom edge to move between rows. Move the
pointer inward, press any remote key, open the menu, click or use the wheel to
stop. Playback and Shorts pages are excluded.

## Why the 2.6.41–2.6.47 attempts failed

They panned YouTube's row by pixels. YouTube TV rows are virtual: only tiles
near focus exist, and YouTube rewrites the row transform whenever focus
changes. Panning therefore stopped at the end of the rendered tiles: about one
movement per direction, or none.

## This approach

It follows [PlxNative's `EdgeScroll`](https://github.com/danzig666/plx-native/blob/main/rust-modules/src/app/input.rs):
screen-edge bands of 120 px (sides) and 80 px (top/bottom, taking the corners),
scaled from 1920×1080; a 150 ms dwell; a 350 ms smoothstep ease-in; and a rate
from 35% at the band's inner border to 100% at the edge. Instead of moving
pixels, each step is YouTube's own arrow navigation (up to 3.5 tiles/s sideways,
2 rows/s vertically), so YouTube loads tiles and animates the row itself.

A sideways step only happens while the focused tile is the one under the
pointer (YouTube's hover focus), so another row is never moved. Two steps that
do not move focus mark the end of the list until the pointer leaves the band.
Steps are marked as synthetic, so this app's remote handling ignores them.

## Diagnostics log for testers

**GREEN → General → Save pointer diagnostics log** is on by default in this
test build; turn it off when you no longer need it. The app appends
to **`/tmp/ytaf-pointer.log`** (cleared at 1 MiB; `/tmp` empties on TV reboot).
It records only:

- session: user agent, view size and pixel ratio;
- pointer moves (throttled), the hit element chain and the focused element;
- band enter/stop with reason, each step, and whether focus moved afterwards.

Elements are logged as tag names, rounded geometry, `tabindex` presence, inline
transform and overflow: no titles, URLs, video IDs or account data.

To collect it with Developer Mode: `ares-shell -d <tv>` then
`cat /tmp/ytaf-pointer.log`, or `ares-pull -d <tv> /tmp/ytaf-pointer.log .`.
With root (Homebrew Channel), copy it from `/tmp`. If the file is not there, the
app may run in a jail; `find / -name ytaf-pointer.log 2>/dev/null` locates it.
The menu status line under the setting shows the line count and write errors.

## Native support

`cobalt-23.lts.6-webos-pointer-log.patch` adds
`h5vcc.system.appendYtafPointerLog(text)`: bounded 4 KiB lines appended with
Starboard file APIs; it returns false on failure. Older runtimes report
"needs the updated native app" and log nothing.

## Validation

Unit tests cover the bands, the dwell/ease-in rate curve, continuous stepping,
end-of-list, band exit, remote keys, playback pages, the focus-under-pointer
check and log privacy. `scripts/test-pointer-edge-browser.py` runs the
production bundle at 720p and 1080p against a fixture row that, like YouTube,
moves only by arrow keys and rewrites its transform. TV behaviour still needs
the log above.
