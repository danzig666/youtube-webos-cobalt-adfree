Bug fixes from a full code review, and a compact GREEN settings menu that shows about twice as many rows at 720p. Built on 2.6.40; the reverted 2.6.41–2.6.47 pointer-scrolling experiment is not included.

**Settings menu**
- One-line header and a footer key hint; the centred panel uses more of the screen.
- Tighter rows, quieter indented help text, row-style actions with a chevron, and an accent bar on the selected category.
- A scroll indicator shows when a category continues. Scrolling reveals a row's help text and keeps the category heading in view near the top.

**Fixes**
- SponsorBlock: reopening the same video after Home skips and prompts again, a reply dropped while away is fetched again, and markers move when the real duration arrives.
- Stop after this video now holds only autoplay. A video you start yourself is no longer paused until **Continue playback**.
- Reopening settings returns to the control you left, not another control with the same tab index.
- Number-key shortcuts no longer get stuck on remotes that omit key release.
- OK pressed while focus slipped out of the menu no longer toggles a hidden setting. Media and colour keys stay with the menu while it is open.
- Cobalt 23 compatibility: hidden playback controls can be revealed again, and arrow keys in settings no longer cancel a pending resume.
- The preferred caption language applies when YouTube turns captions on slightly later.
- Sharper thumbnails leave 16:9 images alone and fall back when a sharper image is missing.
- Reused feed tiles are shown again once their ad is gone. Removing your own dislike lowers the count. A temporary startup quality pin cannot stay on the next video.
- Very large exception lists or saved positions can no longer exceed the 64 KiB settings store and block later saves.

If you installed an experimental 2.6.41–2.6.47 package, this update replaces it.

Validation: 440 web tests, production webpack build, settings/auto-quality/fork-adaptation/playback-recovery browser regressions at 720p and 1080p, source CI with native host regressions, full ARM Gold build and inspection of both final IPKs. No TV was available for this release; on-TV confirmation is still needed. Checksums and exact build/source records are attached. The Homebrew catalog is updated after verified publication.
