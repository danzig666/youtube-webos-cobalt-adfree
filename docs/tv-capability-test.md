# On-TV capability test

Open **GREEN → Diagnostics → Run capability test**. The result appears at the top
of the existing scrolling report. Read it with the Magic Remote wheel or ↑/↓.
Results remain available when returning to Diagnostics; rerun to replace them.
The test changes no playback or capability settings and does not load a decoder.
It requires the 2.6.19 native runtime, not just an updated injected script.

The report separates three sources:

- **LG hardware information:** fixed, read-only service queries using the app's
  own ID and permissions. The fields and requests match LG's official
  [webOS.deviceInfo implementation](https://webostv.developer.lge.com/develop/references/webostvjs-webos)
  in [webOSTV.js 1.2.13](https://webostv.developer.lge.com/assets/library/webOSTVjs-1.2.13.zip).
  `com.webos.service.config/getConfigs` provides `tv.hw.panelResolution` (`UD`
  means 4K, `8K` means 8K), display type, model, mainboard, firmware/platform,
  `tv.model.supportHDR` (the library's HDR10 flag), Dolby Vision and 8K flags.
  `com.webos.service.tv.systemproperty/getSystemInfo` supplies the library's
  fallback model/firmware/SDK and UHD/OLED flags. HLG is unknown because these
  queries do not supply an HLG flag. Only allowlisted fields are displayed.
- **Starfish decoder limits:** `smp::util::getMaxVideoResolution` is declared in
  the SDK's `StarfishMediaAPIs.h` and exported by `libplayerAPIs.so.1` with the
  C++11 string ABI. The optional function is resolved at runtime for H264, VP9
  and AV1. Missing libraries/exports, false answers and invalid dimensions
  remain unknown. This query provides resolution/fps, not HDR or bit-depth
  validation. It runs in a freshly executed subprocess to contain hangs/crashes.
- **Cobalt policy checks:** MSE and video MIME support for 1080p H264 and 4K
  H264/VP9/AV1, including HDR MIME descriptions. These can be affected by the
  user's selected Safe/UHD/UHD HDR profile and MIME parsing. They are not
  independent hardware evidence and must not drive automatic detection alone.

Each subprocess has a 2.5-second deadline and a 16 KiB output limit. Children
are reaped after success, crash, timeout or overflow. The UI polls asynchronously
for at most 12 seconds. No shell, SSH, root access, account API, personal data,
cookies or signed video URLs are involved. Unavailable commands, permissions,
malformed responses or missing fields mean **unknown**, not unsupported.

Hardware flags do not prove that every advertised codec/HDR combination works
through this app. Before adding automatic policy selection, compare the results
on real TVs with successful playback at the reported resolution/codec/HDR.

Validation: `npm --prefix webapp test` and
`bash scripts/test-native-host.sh workdir/cobalt-clean`; the latter includes
bounded process tests and the real async bridge against a fake vendor library,
including a deliberately stalled query. Neither substitutes for TV validation.
