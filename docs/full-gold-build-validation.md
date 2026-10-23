# Full Gold build and package validation (2026-10-02)

## Sources and result

- Repository/native source: `374464b54f6824efd58d541621471756f5eeac92`.
- Cobalt 23.lts.6: `007628df7bddd86e53d6d151ecd122614916223d`.
- Starboard 13, ARMv7 softfp, Gold, GCC 14.2.0 from the pinned SDK.
- SDK release `webos-a38c582`, archive SHA-256
  `04ad3311b48b4557a7002aef56ae2e167478e8e129f37daac04649bddf813616`.
- SDL webOS 2.30.12: `263629dab0c89e75f9872eed66e197174952ce02`,
  existing relaunch/SIGCONT patch and webOS/Wayland ABI configuration.
- Patched SDL, VP9-only libvpx and dav1d 0.5.2 compiled successfully.
- All Cobalt objects, generated bindings (including H5VCC diagnostics),
  V8 snapshot generation and final linking succeeded. A final incremental
  pass included the latest committed source metadata and diagnostics changes.

The resulting ELF is 32-bit ARM, EABI5, soft-float ABI, stripped, with
`$ORIGIN/lib` runtime search path. The starterless IPK was created with
@webos-tools/cli 3.2.5 using the source appinfo version **2.0.2**. That version
comes from this repository's appinfo; it is not a new stable release.

## Commands and environment

The real overlay/assets installers prepared pinned Cobalt. The existing SDL,
libvpx and dav1d Docker build scripts built the native libraries. Cobalt used:

```sh
gn --script-executable=python3 gen out/webos-arm-sbversion-13_gold \
  --args='target_platform="webos-arm" build_type="gold" target_cpu="arm" sb_api_version=13 is_clang=false'
ninja -j4 -C out/webos-arm-sbversion-13_gold cobalt
```

The local Debian 10 build image used the pinned upstream GN package and Clang
`365097-f7e52fbd-8` for 32-bit host tools, the official relocated ARM SDK, and
the compiled patched SDL bundle. Network operations retained proxy/CA trust.
Docker Hub rate limiting required the same Debian base from its public ECR
mirror. The environment kernel cannot execute i386 binaries, so **local-only**
`third_party/v8/tools/run.py` prepended qemu-i386 to host-tool invocations.
This emulated the generators; it did not change the ARM target or its media
implementation. A normal runner supporting i386 executes those tools directly.
The wrapper is not part of the repository overlay. Original and incremental
logs retain the resolved IDL-keyword and host-execution failures and the
subsequent successful link. Upstream assembler/compiler warnings remain in
those logs; they did not fail the build.

Packaging used the existing script with COBALT_BUILD_DIR pointing to that
Gold output, COBALT_RUNTIME_DIR containing matching SDK libraries, and
WEBAPP_OUTPUT_DIR pointing to its built content/web/adblock. The executable
requires libatomic.so.1; packaging now includes it along with libstdc++.so.6
and libgcc_s.so.1. A missing-atomic regression failed with exit 4 before a
package was produced. Final packaging succeeds with all three libraries.

## Payload checks and artifacts

The final container and all 232 payload entries pass the IPK verifier. Additional
payload inspection confirmed the exact linked executable, embedded source SHA,
matching current web assets, exact SDK runtime libraries, unchanged appinfo,
non-root read/execute permissions, and absence of a proprietary starter library.

- ELF SHA-256: `b8458985130cbb3d8ff5a07f13671c0f6a1c9b323e892e8b3b918e71067a9183`.
- IPK SHA-256: `e0bc4dd97bdd81e4af686e19b4193892d61b35e6f3b3ff931336f9d1471f8696`.
- IPK: `youtube.leanback.v4_2.0.2_arm.ipk`.
- Runtime archive: `cobalt-23.lts.6-sb13-gold-374464b54f68.tar.xz`.

Local output also contains build/validation logs, runtime/archive checksums,
source/SDK metadata, and native dependency checksums. Artifacts are ignored by
Git and were not published as stable releases. The branch contains the code,
CI configuration and evidence documentation. The repository's `device-test`
label was created; no device result was fabricated or imported.

## What remains evidence-gated

The user confirmed no LG TV is available. This validates compilation, linking,
package integrity and host logic. It does not validate launch on any firmware,
codec/HDR/rate support, actual A/V synchronization, live/DVR/ad transitions,
clipboard/compositor behavior, Home/background/suspend/relaunch or resource
recovery. Live repair needs a failing device trace. SDK declarations still do
not prove compressed AAC framing/clock/reset behavior, so AAC stays on the
existing decoder fallback. Run the requested device matrix before a stable
release.

GitHub workflow dispatch returned HTTP 404 with the current connection;
no remote build or scheduled run is claimed. Nightly CI is committed on the
working branch and takes effect on the default branch after merge.

## Subsequent reviewed build

The [2026-10-02 project review](v2-project-review.md) includes fixes, an incremental
Gold rebuild and a new verified package. Consult that record for the latest source
SHA and artifact checksums; this document retains the original full-build evidence.

The later [video quality setting validation](playback-diagnostics.md#video-setting-validation-2026-10-02)
records the current package after adding native persistence and the GREEN-menu
control, including the new source SHA and checksums.

## Diagnostic beta verification — 23 October 2026

The original evidence above is historical. The later **2.6.30 beta 1** is built
from `ab32e9578fb9f701ca11e90a24c8cba1ec83d658`, with the same pinned Cobalt,
Starboard, SDL and SDK versions. The manual workflow is now registered and
[ARM Gold run 39968901024](https://github.com/danzig666/youtube-webos-cobalt-adfree/actions/runs/39968901024)
completed successfully. It compiled and packaged the separate and original
application identities in sequence, using a generated identity header for each.
This does not establish that scheduled builds are active on the default branch.

The first run compiled and linked successfully but failed during the second
identity's asset installation: the packaging-only WEBAPP_OUTPUT_DIR leaked
into the native rebuild, and GN had hard-linked those generated files to their
sources. The corrected workflow scopes that override to each package command.
Generated-asset cleanup now runs inside the compiler container, which owns the
output directories. Two regressions fail against the previous scripts and pass
with these changes. Packaging logs are retained alongside compiler logs.

Both downloaded packages passed container/ownership, ELF32 ARM, embedded source
SHA/version/own-ID/opposite-ID exclusion, runtime dependency, exact font and
matching web-bundle checks. Runner checksums, artifact ZIP digest and all five
public release-asset digests were verified.

| Package | IPK SHA-256 | ELF SHA-256 |
| --- | --- | --- |
| `com.cobalt.youtube.adfree_2.6.30_arm.ipk` | `794a66bb91ca0dbd0c3a9a6302ce49378ae83bdd197195c250269338ecd92ff3` | `52f7efe8df2af52c676c7b374999b217c780b57ff8caef21bfd35ab99712b4dc` |
| `youtube.leanback.v4_2.6.30_arm.ipk` | `39bbf42031b4e4590a0fed5313ed2695f3d9268be4274828eb4ef3f84c2d9ec8` | `fe6e8d16313d3bb3769cce2d56429a2a7c438dbccdf96c0f2cf27d5f6c0b2bac` |

[Release and build records](https://github.com/danzig666/youtube-webos-cobalt-adfree/releases/tag/v2.6.30-beta.1).
Source CI, 406 web tests, production web build, the full native host suite,
seven package tests, five compiler-cache tests, four artifact-provenance tests,
three IPK-container tests and sixteen Homebrew catalog tests passed. This is a
diagnostic update, without new TV validation or a confirmed livestream fix.
See [the C3 log investigation](live-playback-investigation.md#c3-log-investigation--23-october-2026).

## Bundled AAC dependency verification — 23 October 2026

**2.6.31 beta 1** uses source `6a36fc74b88e368778f4c930ffd8a25bb30a328d`.
[ARM Gold run 40034711761](https://github.com/danzig666/youtube-webos-cobalt-adfree/actions/runs/40034711761)
succeeded, including both native identities, the real-library host AAC decode
check and both IPKs. The runtime archive now also retains its private AAC
library and source metadata, along with the complete license notice in content.

FDK-AAC 2.0.3 source is pinned to
`716f4394641d53f0d79c9ddac3fa93b03a49f278`. It was cross-compiled with the
same pinned SDK and ARMv7 softfp/NEON flags as the app. Final payload checks
confirmed ELF32 ARM softfp, required AAC exports, dependencies and glibc 2.4
baseline. Both packages contain byte-identical AAC libraries and tested web
assets. Cobalt's existing AAC feed/decode/output-delay methods decode a generated
AAC-LC fixture twice with decoder recreation in both local and CI checks.
The loader prefers the private library and preserves its system fallback.
No compressed AAC feeding through Starfish is added.

| Package | IPK SHA-256 | ELF SHA-256 |
| --- | --- | --- |
| `com.cobalt.youtube.adfree_2.6.31_arm.ipk` | `c087e7bc68fb4be1c2447592585c7f7432851ab152b4cfa2dea0ad29655e70f8` | `adda09f727b8ded6105896d1a44e205b1632b3c6d042dffbcfe0c11afb276c30` |
| `youtube.leanback.v4_2.6.31_arm.ipk` | `463383c85a2acddeb5478d49cc1fac6be3cab0e7bb4cc7e06bfb83dd3721b81b` | `32cc5064155580833c85dc6eb2479dfb759f1d352952a7bb7ba8a399fd28e3ac` |

AAC library SHA-256: `9a5b1ebcc2f3a0357bc6062a7b649df745f10a191d28eddf3dc8f411fc15c909`.

[Public packages, checksums and source-specific build records](https://github.com/danzig666/youtube-webos-cobalt-adfree/releases/tag/v2.6.31-beta.1).
Source CI, 406 web tests, production web build, the full native host suite,
eight package tests, six compiler-entrypoint tests, four provenance tests,
three IPK-container tests and sixteen catalog tests passed. The supplied C3
trace proves the previous AAC creation failure; the new build still requires
on-TV confirmation of startup, synchronization and live/DVR behavior.
