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
