# Pointer row scrolling

Enabled by default under **GREEN → General → Pointer row scrolling**.
Keep the Magic Remote pointer near either edge of a horizontal browsing row to
pan continuously. Speed increases toward the edge and ramps up gradually.
Move inward or outside the row to stop at any pixel position, including partial
tiles. Scrolling stops at either end. Hovering never activates a video.

2.6.47 replaces the single-card reveal from 2.6.46. It keeps the pixel-offset
approach inspired by PlxNative, but uses continuous edge panning to address the
reported one-movement limit. It does not refocus passing tiles or inject arrow
keys. Gaps between cards at the edge remain part of the same row.

Real DOM scroll containers use `scrollLeft`. Virtual rows translate a separate
horizontal content track while preserving YouTube's existing transform. An
external transform update stops our movement. Remote keys, route changes,
resize, disabling the setting and destruction restore native styles. Menus,
wheel input, drags, playback screens and backgrounding stop panning. RTL remains
native-owned. Deliberate pointer movement after a keypress restores hover control.

The active row geometry is reused instead of scanning the whole page for every
pointer packet. Animation uses only requestAnimationFrame timestamps, clamps
long frame gaps to small movement increments and does not run at rest or at row
ends. Popup checks during motion are bounded to one per 200 ms. Scrolling is
limited to currently laid-out row content; native virtualization may need further
TV-specific adaptation.

Cobalt 23 missing APIs are explicitly avoided: `elementFromPoint`, `closest`,
computed `overflowX` and `getPropertyPriority`. A short status under the setting
includes animation frame count and largest frame gap; no video/account data is
collected.

Validation uses the production bundle at 720p/1080p with Cobalt's missing APIs
removed: sustained movement both ways, tile gaps, stopping at partial tiles,
row bounds, no focus/arrow jumps, repeated pointer packets without repeated DOM
scans, mismatched clock origins and delayed frames, native transform updates,
remote/menu/wheel/drag/playback guards. TV smoothness still needs confirmation.
