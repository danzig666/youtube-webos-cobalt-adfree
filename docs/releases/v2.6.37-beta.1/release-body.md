Restores the bundled AAC fallback omitted by the experimental 2.6.36 packages. **Use this compatibility build instead of 2.6.36**, especially on the LG C4 running webOS 26 (43.21.73), where livestreams failed without the fallback and worked with 2.6.35.

- Prefers compatible TV firmware AAC and automatically falls back to the packaged FDK decoder when firmware is unavailable, incompatible or fails before its first decoded audio output.
- Retains the 2.6.36 startup improvements: no hidden Diagnostics collection during startup, no pre-selection FDK loading, and audio/graphics/font timing milestones.
- Restores bundled AAC for normal automated and scheduled builds. Firmware-only packaging is an explicit developer experiment.
- Preserves Starfish hardware video, shared Opus, legacy playback, existing settings and rollback options.

**Install the same package ID you already use**, then fully close and reopen the app. Both IPKs are attached below:

- `com.cobalt.youtube.adfree_2.6.37_arm.ipk`: installs alongside official YouTube.
- `youtube.leanback.v4_2.6.37_arm.ipk`: replaces official YouTube.

The Homebrew catalog is updated to this compatibility release. SHA-256 checksums and individual build records are attached.

Validation: 413 web tests, nine packaging tests, complete native host regressions, actual FDK and firmware AAC decode tests, full ARM Gold builds for both application identities, and inspection of both final IPKs for the real bundled AAC library, exported decoder symbols, native source/identity hashes, required runtime libraries and licenses.

The supplied C4 report confirms 2.6.35 selected bundled FDK; it does not establish why firmware AAC failed. This release restores that fallback, but this exact build has not been tested on the C4 here. No blanket A/V timing offset was added from the separate slight-desync report. Startup speed with the restored fallback also needs device confirmation.

Source: `b5dc6dd33761a8bf26731272f7e5c91284783c98` · [CI](https://github.com/danzig666/youtube-webos-cobalt-adfree/actions/runs/40209393639) · [ARM Gold build](https://github.com/danzig666/youtube-webos-cobalt-adfree/actions/runs/40209393641)
