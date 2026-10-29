Adds a missing scroll path for YouTube-controlled virtual rows: at a browsing row edge, a bounded sequence of normal YouTube Left/Right navigation events can reveal content when focusing a card cannot scroll the row.

Stops when card geometry moves, after six ignored attempts, on normal remote input/menu opening, or if focus leaves the row. Checks for content beyond the edge before sending navigation, preventing the first card from opening the sidebar. No videos are activated and no CSS transforms are injected.

Removes the premature “Video row follows the pointer” success message. The status now distinguishes a movement request, confirmed card movement and navigation that failed to move the row. Also chooses the actual clipping viewport over a wider inner track.

Validation: 424 web tests; production browser checks at 720p/1080p including transform-controlled rows with no writable DOM offset, one movement then stop, ignored navigation bounded to six attempts, and the left row-end guard; source CI; ARM Gold builds and both final IPKs. Actual YouTube behavior on the TV still needs confirmation. Both identities and bundled AAC fallback are retained.
