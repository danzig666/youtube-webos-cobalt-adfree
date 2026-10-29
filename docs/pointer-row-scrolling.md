# Pointer row scrolling

Enabled by default. Toggle **GREEN → General → Pointer row scrolling**.
Point at a partly visible video card near either side of a horizontal browsing
row. Focus follows the pointer and a damped spring moves the row only far enough
to reveal the card, leaving part of the neighbouring tile visible. Hover never
activates a video. Moving back to a card on the left reveals it the same way.
Holding the pointer stationary does not keep advancing through the row.

The reference is [PlxNative CardRow](https://github.com/danzig666/plx-native/blob/47fd8bbc6c2ca70ab90507b3dc6ccf02672182f7/rust-modules/src/ui/card_row.rs):
nearest legal pixel offset, a breathing gap and a critically damped spring with
K_SCROLL=170. This is not whole-tile navigation or an endless edge-hover timer.

Real DOM scroll containers use `scrollLeft`. YouTube's virtual rows use a
translation on the shared horizontal content track, composed with its existing
transform. The clipping viewport is not translated. Positions are clamped to
laid-out row content; there is no rounding to tile indices. A track containing
multiple video rows is rejected. RTL remains native-owned.

A YouTube transform update stops our animation and becomes the next base.
Remote key input restores the native styles before handing control back.
Route changes, resize, disabling the setting and destruction also restore styles.
Menu opening, wheel scrolling, pointer dragging and backgrounding stop animation.
After a keypress, deliberate pointer movement of about 120 pixels at 1080p
(scaled with the viewport) restores hover control.

Cobalt 23 has no `document.elementFromPoint`, `Element.closest`, computed
`overflowX` or `getPropertyPriority`. The implementation uses native event targets,
bounded geometry hit testing, `overflow` and the inline declaration's priority.
No startup scan or idle polling is required. Detached tracks are discarded.
Playback/Shorts screens, popups, hidden rows and vertically clipped cards are
excluded. The saved off setting survives updates.

2.6.46 replaces the arrow-event fallback from 2.6.44/45 with pixel-based movement.
Browser fixtures at 720p and 1080p check intermediate spring positions, partial
tiles, right-to-left return, stationary stopping, native-transform preservation,
D-pad handoff, native updates during motion, and the existing UI guards. They
exercise the production bundle with Cobalt's missing APIs removed. Actual live
YouTube DOM behavior still needs TV confirmation.
