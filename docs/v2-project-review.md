# v2 project review (2026-10-02)

Reviewed the playback plan against capability advertisement and decoder admission,
shared queue/timing/EOS state, legacy seek/rate handling, lifecycle integration,
native reports and clipboard bridging, MediaSource instrumentation, settings,
packaging, device-report generation and CI. The existing starterless architecture
and fallback mechanisms remain intact. No LG TV is available.

## Reproduced and fixed

- **MediaSource tracing:** a rejected overlapping append overwrote the pending
  append's completion sequence. A rejected append could also make a later remove
  completion appear to be an append completion. Successful asynchronous operations
  now retain their own completion entries, including remove placeholders.
- **Asynchronous append errors:** only synchronous exceptions were traced, so an
  error event followed by updateend could be reported as successful completion.
  The error is now recorded against its append sequence without exception text.
- **Instrumentation isolation:** a throwing byteLength/timestampOffset metadata
  getter could replace the native append outcome. Diagnostic reads are now guarded;
  original arguments, results and native exceptions remain intact. Listener setup
  precedes wrapping so failed registration cannot leave orphaned completion entries.
- **Legacy admission:** after a pipeline had loaded, InitializePipeline could reject
  a changed resolution/color configuration while FeedBuffer continued submitting it.
  Admission now returns an explicit result that FeedBuffer checks.
- **Legacy asynchronous startup:** SetPlayRate could run before LOADCOMPLETED and
  treat normal not-ready rejection as a fatal rate failure. Startup Play remains
  available, rate application waits for load completion, retained flushes preserve
  readiness, and pipeline recreation clears it. Confirmed rate failures retain the
  existing player-error handling needed for the independent audio clock.
- **Numeric bounds:** legacy packet and seek timestamps could overflow when converted
  to nanoseconds; a finite MIME frame rate could overflow int before being clamped.
  Both are bounded before conversion. Undefined-behavior regressions reproduced
  the original conversion failures.
- **Settings recovery:** valid JSON containing null or primitive values could crash
  configRead, and arrays could lose keyed settings during serialization. Invalid
  shapes now recover to defaults. Failed storage writes retain live session settings
  and dispatch change notifications. Persistence across relaunch cannot be promised
  while the browser store is unavailable.
- **Packaging:** failed readelf inspection was treated as absence of libatomic, and
  grep -q with pipefail could hide a match when the producer received SIGPIPE. Failed
  inspection now stops packaging and successful inspection is consumed completely.
  Both failures were reproduced at the actual packaging entrypoint.

Workflow review also removed shell-source interpolation of manual/ref metadata,
pinned the packaging SDK checksum to the compiler SDK checksum, and changed package
CLI installation to npm ci. The new native and packaging regressions run in ordinary
CI. These workflow changes passed actionlint; no remote Actions run is claimed.

## Plan assessment

| Plan area | Assessment |
| --- | --- |
| Baseline and incremental delivery | Source versions and rollback paths are recorded; fixes remain separate commits |
| Capability centralization/profiles | One policy is used for queries and both players; unknown devices fail closed; overrides are experiments, not verified device detection |
| Generic audio and AAC research | Generic state is separate from Opus wire/timing rules; direct compressed AAC remains unproven and stays on its existing decoder path |
| Shared state and repeated seeks | Host tests cover queue boundaries, reset generations, stale tickets/EOS, overflow, keyframes and rapid target changes; legacy diagnostic generations do not prove firmware callback attribution |
| Rate handling | Pure policy tests plus actual legacy-method regressions cover idempotence, deferred startup and failure handling; native fractional-rate behavior remains device-dependent |
| Live playback | Boundary tracing now covers synchronous and asynchronous MSE failures; a live repair still requires a failing TV trace, including starvation/discontinuity behavior |
| Lifecycle | SDL events use the tested idempotent policy and existing Cobalt callbacks; kSuspend is a future input, not proof of firmware suspend/resource restoration |
| Diagnostics/report export | Numeric/typed bounded reports exclude URLs, credentials and account data; clipboard/compositor behavior still needs a TV |
| Compatibility matrix | Schema and generator are tested; no hardware reports or compatibility claims are fabricated |
| CI/nightly/package/error categories | Host tests, Gold linking and package verification pass locally; schedules activate on the default branch after merge |

The plan is sound as an incremental validation strategy. Its on-device definition
of done is **not complete**: host tests cannot establish codec/HDR support, A/V sync,
live/DVR recovery, suspend/relaunch behavior, clipboard operation or native resource
release on a particular firmware. No speculative live workaround, AAC feed format,
LG probing API, model list, root requirement or legacy-backend replacement was added.

## Validation and artifacts

Validated implementation source: `8a13aaa864f5b56b2ac57e1d7f0cf878c34c3b5c`.

- All **42 webapp tests** and the production webpack build passed.
- All native host suites passed. The new regression runner compiles the actual
  legacy InitializePipeline, FeedBuffer, playback-state, Reset and adaptive-capability
  methods against fake firmware/thread boundaries, using UBSan and float-cast checks.
- Two existing IPK-container tests, two new packaging-entrypoint tests and four
  device-report-generator tests passed. All shell scripts pass bash -n; all four
  workflows pass actionlint; Makefile help and git diff --check pass.
- ARM SDK source checks passed. The existing full Gold build tree was updated,
  recompiled and linked successfully with the real SDK and patched SDL libraries.
  This was an incremental Gold build, not a second clean build of upstream Cobalt.
- The new IPK passes container and exact payload checks: current ARM executable,
  embedded source SHA, all three matching SDK runtime libraries, current web assets,
  source appinfo and non-root permissions. No proprietary starter is included.

The build environment and local-only i386 generator workaround are described in
[the original full-build record](full-gold-build-validation.md).

- IPK: `output/youtube.leanback.v4_2.0.2_arm.ipk` (repository appinfo version).
- IPK SHA-256: `b094a7928a2eebaadb5e33a9fa4bf1f8cba1360c31564f9c5c8ecc7c8d06f60c`.
- ELF SHA-256: `73f036157e8dfac8f31d122e1a21a0f31f98b2c1c25fa249707196d873ed009e`.
- Runtime archive: `output/cobalt-23.lts.6-sb13-gold-8a13aaa.tar.xz`.
- Logs: `output/review-*.log`; metadata/checksums: `output/validation-metadata/`.

The previous package and source metadata are retained under `output/pre-review/`.
Generated binaries remain outside Git. No TV installation, main-branch merge or
stable release is performed by this review.
