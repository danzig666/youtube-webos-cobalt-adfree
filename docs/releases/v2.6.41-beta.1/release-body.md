Adds **Magic Remote pointer row scrolling**, following the hover-focus and minimal-reveal behavior in [PlxNative](https://github.com/danzig666/plx-native/tree/47fd8bbc6c2ca70ab90507b3dc6ccf02672182f7).

- Point at a clipped card near the left or right edge of a horizontal browsing row to reveal it. Hovering never starts a video; clicking still works normally.
- Enabled by default. Turn it off under **GREEN → General → Pointer row scrolling**; the choice is saved.
- A stationary pointer does not keep advancing through cards. Arrow navigation owns focus until deliberate pointer movement resumes.
- Uses YouTube/Cobalt's native focus/scroll engine for hybrid navigation and virtual rows. Ordinary DOM scrollers get a smooth, bounded reveal animation. No synthetic Left/Right keys, clicks or transforms are injected.
- Excludes playback/Shorts screens, menus, hidden rows, vertical lists and held-button dragging. Cancels on normal remote input, wheel scrolling, navigation and backgrounding. No idle polling or startup row scan.

**For your C3, install `youtube.leanback.v4_2.6.41_arm.ipk`**, the original-ID variant that replaces official YouTube. The separate-ID IPK remains available for coexistence; microphone capture was rejected under that ID on the tested C3.

Retains the 2.6.40 early ad filtering, ad blocking on by default, voice language controlled by YouTube Settings → Language, and bundled AAC fallback for C4/webOS 26 livestream compatibility.

Validation: 424 web tests; production webpack build; pointer and settings browser checks at 720p/1080p; successful source CI/native host regressions; full ARM Gold build and inspection of both final IPKs. Pointer tests use YouTube-shaped DOM fixtures and verify native-focus ownership. **Live YouTube/Cobalt behavior on a TV still needs confirmation.** Checksums and build records are attached; Homebrew is updated after verified publication.

Source: `34a69f9ae71260ceb637f90145a319c3d59d4a0b` · [CI](https://github.com/danzig666/youtube-webos-cobalt-adfree/actions/runs/40789804126) · [ARM build](https://github.com/danzig666/youtube-webos-cobalt-adfree/actions/runs/40789804224)
