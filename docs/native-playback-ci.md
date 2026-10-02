# Native playback validation

## Cheap PR checks

`native-host-tests` in ordinary CI checks out pinned Cobalt
`007628df7bddd86e53d6d151ecd122614916223d` (23.lts.6), applies the real platform
overlay twice, and compiles/runs SDK-independent state and policy tests with
undefined-behavior detection. Session-state, Opus timing, video transitions,
generic audio epochs, capabilities, playback rates, lifecycle and bounded
diagnostics are covered. The seek regression compiles the actual patched Cobalt
Seek method and requires the repeated-seek fix to already be installed.

```sh
bash scripts/test-native-host.sh /path/to/cobalt-23.lts.6
```

This prepares/modifies that Cobalt checkout; use a disposable pinned checkout.
Requirements: x86-64 Linux C++ compiler, Python 3, git and rsync. No webOS SDK,
SDL library or Starfish implementation is required. Firmware/player integration
still needs the ARM syntax scripts and full build.

## Daily full build

The separate starterless build workflow runs daily at **03:17 UTC**. Scheduled
runs use Cobalt 23.lts.6, Starboard 13, ARM and Gold, with four compiler jobs.
Manual runs default to Gold and retain selectable Devel/Gold builds. Each run checks
the exact repository commit associated with the workflow, runs host regressions,
then builds the existing patched SDL/Cobalt runtime.

Artifacts retain the runtime, archive and executable SHA-256 checksums, build
log, repository SHA, Cobalt upstream SHA and build configuration for 14 days.
Scheduled and manual Gold runs additionally package and validate an IPK using runtime libraries
from the pinned SDK and the matching built web assets. Nightly packages remain
Actions artifacts; there is no release publication or stable-channel update.

The full Gold ARM build and final IPK payload checks passed locally; see
[validation details](full-gold-build-validation.md). Workflow definitions pass
actionlint. GitHub workflow dispatch returned HTTP 404 with this connection, so
no remote Actions run is claimed. Scheduled workflows activate on the default
branch after merge. On-device playback remains a stable-release gate.

Packaging includes libstdc++.so.6, libgcc_s.so.1 and, when the executable needs
it, libatomic.so.1 from the same pinned SDK. Missing required runtime inputs
fail packaging. Both package workflows extract the atomic runtime. Package
verification checks ownership, non-root read access and executable permissions.

The host job also executes `scripts/test-starfish-video-decoder.py`, which compiles
actual legacy decoder methods against fake firmware boundaries to check packet
admission, timestamp bounds, asynchronous load/rate application and retained seeks.
The smoke job runs `scripts/test-starterless-package.py` to ensure dependency
inspection failures and pipefail/SIGPIPE cannot silently omit required libraries.
