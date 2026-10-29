Fixes pointer row scrolling when focusing a card does not start a native scroll. A short fallback reveals the card in a real horizontal scroll container; native scrolling that already starts keeps ownership.

- Handles pointer events directly, including when compatibility mouse events are suppressed.
- Recognizes clipping wrappers and card focus wrappers that also contain metadata.
- GREEN → General → Pointer row scrolling now shows the pointer movement count and last result when Settings opens. This avoids searching the technical diagnostics if a TV still does not scroll.
- Enabled by default; the saved switch remains available. Both app IDs and the bundled AAC fallback are retained.

Validated with 424 web tests, production browser regressions at 720p/1080p (including pointer-only input and focus without native scrolling), source CI and ARM Gold packaging. Actual YouTube behavior on the TV still needs confirmation.

Source: `c920f6ec4d419fe8f6aa348a9cac8a5cb13958a4` · [CI](https://github.com/danzig666/youtube-webos-cobalt-adfree/actions/runs/40794396310) · [ARM build](https://github.com/danzig666/youtube-webos-cobalt-adfree/actions/runs/40794395807)
