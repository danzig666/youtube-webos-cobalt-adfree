# Selected fork improvements — 2.6.27

Sources reviewed:

- [ja3850's C4 development branch](https://github.com/ja3850/youtube-webos-cobalt-adfree/tree/432e823a35cdc6a8e80958a8ed50db3cf5cd081d), especially capability probes, optional JSON filters and compiler caching.
- [LawfulGremlin's detached fork](https://github.com/LawfulGremlin/youtube-webos-cobalt), especially its hardware findings about Cobalt DOM collections and missing `Element.closest()`.

These are adaptations to our current architecture, not a wholesale branch merge.

## DOM compatibility

The ad-tile hider now walks parents with `matches()` and traverses NodeLists by
index. Cobalt 23.lts.6 has no native `Element.closest()` or `NodeList.forEach()`.
The dislike cleanup also converts its NodeList before iteration. A regression
executes the actual adblock module with indexed, non-iterable collections and no
`closest()`, covering initial ads, new nodes and restoring tiles when disabled.

## Native compiler cache

The container build uses Cobalt's supported `cc_wrapper` for host and ARM
compilation when ccache is installed. Links are uncached. The native workflow
restores/saves a 5 GiB cache separately for the Cobalt ref and build type. The
compiler is checked by content; no sloppiness options are enabled. Existing
exact-source artifact verification remains in force.

`YTAF_CCACHE=0` disables caching. `CCACHE_HOST_DIR` and `CCACHE_MAXSIZE` select the
local directory and budget. An image without ccache builds normally. Build errors
survive statistics reporting. Tests cover both modes and failures; real ARM
compilation verified a cache hit and invalidation after a same-mtime header edit.
Real Cobalt GN generation verified compilation wrappers for host and target.
No full-build speedup is claimed from this small verification.

## Media capability queries

Cobalt's real MIME parser rejects a decimal bitrate such as `4241906.25` because
it requires an integer. The early preload and main fallback now share one wrapper
for `MediaSource.isTypeSupported` and `canPlayType`. Only a native rejection with
a valid, unquoted decimal bitrate is retried, rounding **up** from decimal text to
an integer. That avoids rounding a value below a hardware ceiling. Supported
queries are untouched. Malformed/duplicate parameters, numeric strings, negatives
and values above the signed integer range are not repaired.

Frame rate, codec, size, HDR and hardware policy are unchanged. In particular,
62.5/75 fps are not divided by playback speed or accepted using an assumed 4K60
pixel budget. This fixes a demonstrated parser issue; it does **not** establish
that the entire speed/quality downgrade is fixed on the C3.

GREEN → Diagnostics shows counts and at most 12 recent rejected/normalized
queries, using fixed codec names and numeric size/rate/bitrate data. Raw MIME
strings, URLs, account values and exception messages are excluded.

## Optional display settings

All four are under General and default **off**:

- Hide end-screen recommendations: removes the player response's recognized
  end-screen renderer, preserving playback tracking and stream metadata.
- Sharper video thumbnails: prefers the public 640px SD variant for standard
  YouTube thumbnails. Existing higher-resolution images, custom crops, avatars
  and DeArrow URLs stay intact. Availability of the SD variant depends on YouTube;
  this optional rewrite does not probe image availability or guarantee fallback
  on every renderer.
- Hide recommendation sign-in prompts: targets recognized recommendation nudges;
  unrelated alerts, privacy prompts and the normal sign-in screen remain.
- Hide YouTube logo: bundled CSS hides menu branding without changing its layout.

Logo visibility applies immediately. JSON display options affect newly loaded
responses. They never reload or rearrange the existing Home feed automatically;
use the existing Home refresh action when desired.

## Validation and limits

386 web tests, the complete native host suite, compiler-entrypoint tests, package
checks, actual production browser checks at 720p/1080p and both ARM package builds.
The browser checks remove `closest()`/NodeList `forEach()` and exercise persisted
options, new ad nodes, tracking/alert preservation and the capability wrappers.
Existing settings, seeking and simulated long-playback/SponsorBlock regressions
remain covered. No TV is connected here; current hardware validation is pending.

The C4 fork's native timestamp-rescaling and A/V synchronizer is not imported:
it changes the default to legacy playback and assumes behavior verified on its
C4. It needs an isolated port and C3 testing before enabling it in this fork.
Finer arbitrary playback rates and old-starter keyboard patches likewise remain
separate research rather than being silently enabled.
