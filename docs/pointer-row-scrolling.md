# Pointer row scrolling

Enabled by default. Toggle **GREEN → General → Pointer row scrolling**.
Point at a partially visible video card at either side of a horizontal browsing
row. Focus follows the pointer and the row reveals that card. Clicking still
plays the selected video normally; hovering never activates it.

This follows the behavior in [danzig666/plx-native](https://github.com/danzig666/plx-native),
reviewed at `47fd8bbc6c2ca70ab90507b3dc6ccf02672182f7`:

- [CardRow](https://github.com/danzig666/plx-native/blob/47fd8bbc6c2ca70ab90507b3dc6ccf02672182f7/rust-modules/src/ui/card_row.rs)
  reveals the focused card only as far as needed, with a gap for breathing room.
- [HitMap](https://github.com/danzig666/plx-native/blob/47fd8bbc6c2ca70ab90507b3dc6ccf02672182f7/rust-modules/src/ui/hit.rs)
  gives D-pad navigation ownership until deliberate pointer movement resumes.

The DOM implementation focuses YouTube's existing card controls. Cobalt hybrid navigation (`tabindex <= -2`) gets a brief opportunity to scroll
natively. If focus succeeds but a real scroll container stays still, a bounded
reveal follows. Transformed/virtual rows and RTL rows retain native scrolling. Ordinary horizontal DOM scrollers use a bounded,
critically damped reveal animation inspired by PlxNative's scroll spring.
They keep a small peek of the neighbouring card available at the edge so the
pointer can continue through the row without switching to the arrow keys.
No transforms, synthetic arrow keys or clicks are injected.

Cobalt 23's DOM is checked explicitly: the controller falls back to the native
mouse event target without `document.elementFromPoint`, uses the supported
`overflow` property without `overflowX`, and does not require `Element.closest`.

The pointer must actually move to acquire another card. Holding it stationary
does not keep advancing through the row. After a keypress it must travel about
120 pixels at 1080p (scaled with the viewport) before hover takes focus again.

Only recognized horizontal browsing rows participate. Playback/Shorts screens,
settings, popups, vertical lists, hidden rows and held-button drags are excluded.
Animation stops on ordinary remote input, wheel scrolling, route changes,
backgrounding or loss of the current row. There is no startup DOM scan or idle
polling. The saved off setting survives an update/relaunch.

Validation: 424 web tests; production build; actual-browser fixtures at 720p and
1080p for both scroll directions, no hover activation or stationary runaway,
D-pad ownership, popup/playback/drag guards, saved switches and native-focus
ownership. Existing six-category settings checks also pass. These tests use
YouTube-shaped fixtures; operation with the live YouTube DOM on a TV still
needs confirmation.

2.6.42: listens to pointer events directly as well as compatibility mouse events,
accepts clipping wrappers and per-card focus wrappers with metadata, and shows
pointer movement count plus the last result beneath the General setting.
