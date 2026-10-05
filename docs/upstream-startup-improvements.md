# Upstream adaptations and startup investigation

Compared RF1705 main `7f9de1da9a1cd97da55c7b7b507fb8f7c47a0fdc`
against our release 2.6.24. The LG C3 tester reports no recent playback freezes;
this change preserves the existing controls, SponsorBlock and seek fixes.

## Adapted improvements

- [Upstream PR #98](https://github.com/RF1705/youtube-webos-cobalt-adfree/pull/98):
  direct stdout/stderr logging removes our blocking pipe and its reader thread.
  Our variant rotates whole files instead of copying/truncating a file while
  raw native writes are active. In-flight writes remain in the previous file.
  Each install ID has its own log. Nominal retention is two 8 MiB segments,
  with possible overshoot between one-second rotation checks. Startup trimming
  uses a fixed 64 KiB buffer; initialization failure keeps original output.
- [Upstream PR #104](https://github.com/RF1705/youtube-webos-cobalt-adfree/pull/104):
  use LG's `/usr/share/fonts`, with packaged system-font metadata. Installed
  families have priority; missing files fall back to the complete existing
  Cobalt font package. Inter remains the settings-menu font. We deliberately
  keep bundled fonts until representative firmware is tested. No LG font
  binaries are redistributed. Overlapping named families retain their owners,
  preventing dangling unique font-face/alias pointers in Cobalt.
- Native-build concurrency now includes the source branch, so a build on one
  branch cannot cancel a build on another branch.

Wheel input support and source checkout were already covered in this fork.
Our exact-source/version/checksum artifact verification remains intact.

## Startup work

Two avoidable costs were found in the startup path: blocking pipe backpressure
when logs arrive faster than the reader drains them, and routine success
messages emitted as errors for each external/inline JavaScript execution.
Production Gold builds now omit that per-script tracing and debug-message
argument construction. Error reports remain; `YTAF_COBALT_DEBUG` enables verbose
tracing. This does not change YouTube's scripts or execution order.

Open GREEN → Diagnostics to read:

- Native milliseconds from process entry: logging, SDL and graphics ready.
- Page milliseconds from first instrumentation: preload, document loaded,
  settings script, settings ready, feature hooks and first usable screen.

The two clocks have separate origins and must not be added together. Native
measurements start after executable loading, so they exclude webOS launch and
dynamic-loader time. Page timings cover the instrumented document only.
A usable screen means visible recommendation cards, account selection, or
ready video; it is a heuristic, not confirmation that every UI feature is ready.
The watcher polls twice a second and stops on success or after one minute.
Reports contain fixed labels and numbers, without URLs, titles or account data.

A long interval before graphics points toward native initialization. A long
page-document or usable-screen interval needs investigation of YouTube/network
loading. No TV is connected here: the original startup duration and any speedup
are **not measured on hardware**. No account-selection delay or capability
policy was changed speculatively.

## Validation

368 web tests, the complete native host suite (including concurrent logging and
startup timing under UBSan), package/provenance regressions and actual
production-bundle browser checks at 720p/1080p. Both ARM Gold runtime identities
are rebuilt and their packaged assets, font metadata, fallback fonts and source
identity verified before publication.
