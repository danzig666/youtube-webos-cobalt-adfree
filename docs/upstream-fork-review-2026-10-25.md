# Upstream and fork review — 2026-10-25

Compared our branch at `0fbee1f1a77da86543aec4a2a8b4098566052687`
(application source `0b6952608c7b000f235ea017d25fca53a5a95100`, 2.6.36)
with RF1705 main `34823b47e43ee11b907002eb82ff76bbe4040031`.
Enumerated all 18 direct forks returned by GitHub, including ours, and inspected
branches of the other 17. Also checked the detached LawfulGremlin fork and the
NicholasBly reference project. This is a review; no runtime adaptation is included.

## Worth adapting

1. **Early Home/Shorts ad-response filtering — merged [#119](https://github.com/RF1705/youtube-webos-cobalt-adfree/pull/119).**
   Commit `763786419abd` moves ad and sponsored-QR JSON filtering into preload,
   before the first feed consumes responses. It recognizes nested rich-item/tile
   ad-slot wrappers and removes whole ad/masthead array entries before deleting
   their identifying properties. Our preload currently filters Shorts and our
   optional display preferences; general ad/QR response filtering is still in
   the later main bundle. Adapt its shared filter module and early ordering,
   retaining our settings guards, display filters, Home-refresh integration and
   Cobalt-compatible DOM fallback. Do not copy its deletion of the DOM observer
   without verifying remaining ad-rendering routes on the C3.
2. **Magic Remote microphone — merged [#116](https://github.com/RF1705/youtube-webos-cobalt-adfree/pull/116),
   with follow-up [#118](https://github.com/RF1705/youtube-webos-cobalt-adfree/pull/118).**
   Provides real mono 16-bit/16 kHz microphone input through LG voiceconductor
   instead of the inherited Starboard stubs. The follow-up checks nonblocking
   UNIX-socket connection completion and handles late recording tickets during
   bounded shutdown. Upstream documents successful in-app voice search on an
   LG 55NANO85SPA using a 2.0.6-based build. Current-main sources were SDK checked;
   C3/C4 capture still needs testing. Port both changes together, guard the
   private helper ABI, keep voice resources demand-loaded, and review waits on
   the shared GLib dispatcher so unavailable capture cannot freeze controls.
3. **Phone/DIAL and voice launch targets — merged [#120](https://github.com/RF1705/youtube-webos-cobalt-adfree/pull/120),
   integrating renanmarcos [#117](https://github.com/RF1705/youtube-webos-cobalt-adfree/pull/117).**
   Previously a phone could open the app while its chosen video was lost.
   Parses initial/relaunch parameters, passes Cobalt `--link`/`Link`, preserves
   pairing/list/time attributes, and adds webOS DIAL/query/voice routing metadata.
   This is DIAL/YouTube launch handling, not a general Chromecast receiver.
   Upstream documents phone launch with the app open and closed on the same
   Nano85; our dual app identities, coexistence with official YouTube, lifecycle
   guards, logging and startup-page preferences need explicit adaptation/tests.

## Useful experimental work

- **DjVreditel webOS 4 compatibility — open [#121](https://github.com/RF1705/youtube-webos-cobalt-adfree/pull/121),
  branch `webos4-acb-video` at `f647d02039f348f5c41c37f29d6c6907e64112d5`.**
  Adds a missing-`wl_webos_foreign` guard and an ACB video-window fallback,
  avoiding an exported-window null dereference on older compositors. Also gates
  AV1 on known old webOS generations and bundles libatomic when present.
  Author reports picture/sound/seek/pause working on a rooted 55UK6450PLC,
  webOS 4.4.2, using the older 2.0.6 base; no full current-main device build or
  webOS 5/6 comparison is claimed. We already inspect/bundle required libatomic.
  The AV1 restriction belongs in our centralized per-codec policy. The ACB
  fallback needs isolated testing with our session/lifecycle ownership; do not
  replace the C3/C4 exported-window path wholesale. Its locale patch calls
  `luna-send-pub` synchronously with no timeout before ICU startup: do not copy
  that into our faster startup path without a bounded/cached design.
- **AV1 opt-out — open [#111](https://github.com/RF1705/youtube-webos-cobalt-adfree/pull/111).**
  A build-wide diagnostic switch for a reported 55UP8100PTB / LM21A AV1 problem.
  It has no claimed native build/hardware validation. A selective codec override
  could help diagnostics, but this is not proven automatic capability detection
  or evidence for disabling AV1 on working C3/C4 devices.

## Already present or unchanged

- Our bundled AAC livestream fix [#115](https://github.com/RF1705/youtube-webos-cobalt-adfree/pull/115)
  was merged upstream on October 24. Preserve our later firmware AAC path and
  optional FDK packaging rather than reintroducing a mandatory bundled codec.
- ja3850 `c4-speed-legacy` remains at
  `432e823a35cdc6a8e80958a8ed50db3cf5cd081d`, already reviewed in
  [the earlier fork adaptations](fork-improvements-2026-10.md). No new C4 sync fix
  was found there. Its older timestamp/synchronizer changes remain experimental.
- hoangvya19's newest fork mirrors current upstream and its AV1 opt-out branch.
  Renanmarcos' microphone/DIAL work is now integrated upstream. DjVreditel's
  webOS 4 branch is the significant new unmerged direct-fork work.
- The remaining direct-fork branch heads are older work or upstream mirrors.
  Existing wheel, SponsorBlock EOS, settings navigation, ownership, preload,
  startup-page and display-filter adaptations are not new additions to this fork.
- LawfulGremlin's newest work is keyboard-related; the previously reviewed DOM
  compatibility findings are already adapted. NicholasBly main remains at
  `78a374a32774`, with its latest listed release 0.8.4 from September 29.

## Verification and recommendation

Upstream main's CI, main push workflow and full Cobalt build all report success
(runs `40115917404`, `40115918121`, `40116230131`). Nine targeted tests covering
preload feed/Shorts/ad filtering and guide dispatch passed against an isolated
checkout of that exact upstream main. Native launch/microphone tests could not
run locally because the host lacks json-c development headers/pkg-config data;
that is a local dependency limitation, not a reported code failure. No TV test
was performed for this review.

Recommended order: adapt early ad filtering, then microphone with its shutdown
follow-up, then DIAL launch handling. Keep webOS 4/ACB and AV1 opt-out as isolated
compatibility work. No newly validated C3/C4 audio-sync or cold-start fix was
found that justifies replacing our current playback timing or startup behavior.
