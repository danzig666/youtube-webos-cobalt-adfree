# Starfish compressed AAC investigation

## Verified source/header facts

Reviewed the fork baseline `1aea406e8c833e2fd16099e390da08b16326942f`,
Cobalt 23.lts.6 (`007628df7bddd86e53d6d151ecd122614916223d`) and the official
buildroot-nc4 SDK release `webos-a38c582`, Linux x86-64 archive.

- `StarfishMediaAPIs.h` declares Load, Feed, SetPlayRate, Seek/flush and audio
  buffer methods. They accept opaque payload strings; declarations do not
  specify AAC framing or compressed decoder reset/clock semantics.
- The same SDK declares media capability helpers, including
  `getMaxVideoResolution` and `isSupportedAudio`. A declaration does not prove
  availability/behavior on older firmware, so these helpers have not been
  introduced into runtime policy or used to infer AAC support.
- The custom shared player explicitly accepts `kSbMediaAudioCodecOpus`,
  requires WebM timing side data, and serializes OpusHead into Load's opusInfo.
  AAC is ineligible for that path.
- Cobalt's existing Linux factory selects its FDK-AAC software decoder when
  available, with FFmpeg as the existing fallback. Legacy StarfishVideoDecoder
  supplies video separately. Neither path feeds compressed AAC to Starfish.
- Generic session epochs and queues are now separate from Opus configuration
  and timing, but no AAC codec/configuration/framing implementation is added.

## Unverified questions

No TV is connected to this workspace. No available header or repository code
establishes which compressed AAC framing Starfish accepts through this RAW
BUFFERSTREAM path, whether AAC-LC/HE-AAC are supported, whether ADTS is required,
or whether raw samples plus AudioSpecificConfig are sufficient. MP4 elementary
sample support, audio-clock ownership, fractional-rate behavior and seek/reset
decoder recreation remain unverified. A successful SDK link would still not
answer those questions.

## Required experiment before implementation

On an identified TV/firmware, use verified SDK interfaces and minimal known
fixtures to record Load payload structure (without secrets), compressed input
framing, returned status, first audio/video presentation, native clock/rate,
seek/reset and natural EOS. Independently test AAC-LC versus HE-AAC and the
documented accepted framing. Compare 1x/non-1x and repeated resets in one process.
Record SDK/library versions and results separately for each device.

Only confirmed framing/clock/reset behavior can justify StarfishAacConfig,
session planning, packet timing and host regressions. Until then, AAC continues
through the existing decoder path. No speculative compressed AAC implementation
or undocumented LG call is introduced.

## Follow-up without a TV (2026-10-02)

The target SDK was inspected again while preparing a full native build. Its
`StarfishMediaAPIs.h` declares `Feed(const char*)`, two `Load(const char*,
callback)` overloads, `Seek(const char*)`, `flush()`, `setTimeToDecode(const
char*)`, `SetPlayRate(const char*)`, and `getCurrentPlaytime()`. These declarations
verify that the methods exist in the pinned SDK; none defines an AAC payload
schema, elementary-stream framing, AudioSpecificConfig/ADTS handling, decoder
ownership of the audio clock, or reset behavior. The declared
`smp::util::isSupportedAudio(string, int32_t, int32_t)` returns `void`, so it
cannot simply be treated as a Boolean capability probe.

No TV is available for the requested feed/clock/rate/seek experiments. Research
therefore concludes **compressed AAC remains unproven for this shared path**.
There is no basis to implement any of the requested AAC codec/configuration/
timing classes yet. The existing AAC decoder fallback remains the appropriate
behavior. This is the plan's conditional outcome, not a claim that Starfish
cannot decode AAC on any firmware.

SDK source: [buildroot-nc4 webos-a38c582 release](https://github.com/openlgtv/buildroot-nc4/releases/tag/webos-a38c582),
archive SHA-256 `04ad3311b48b4557a7002aef56ae2e167478e8e129f37daac04649bddf813616`.

## Firmware decoder investigation (2026-10-24)

The C3 tester confirmed that downstream 2.6.31 plays the previously failing
livestream with the bundled FDK dependency. This confirms a usable software
AAC path, but does not establish that firmware AAC libraries are absent.

Reviewing the actual Cobalt 23.lts.6 loaders identifies two narrower failure
possibilities worth testing before considering a different player backend:

- `starboard/shared/libfdkaac/libfdkaac_library_loader.cc` originally tries only
  `libfdk-aac.so`. It does not try versioned names such as `libfdk-aac.so.2`.
  Firmware could provide a runtime SONAME without the unversioned development
  symlink. No C3 filesystem inventory has yet confirmed this possibility.
- `starboard/shared/ffmpeg/ffmpeg_dynamic_load_dispatch_impl.cc` requires a
  matching loadable trio of `libavutil`, `libavcodec` and `libavformat`, even for
  the audio decoder. Failure to load any one rejects the dispatch. Its audio
  adapter also supports only the compiled specialization versions (540, 550/560,
  571 and 581), not arbitrary firmware FFmpeg versions.

The C3 capture reports `AudioDecoderUnavailable`, but does not retain the
individual dynamic-loader errors. It cannot distinguish a wrong filename,
missing dependency, architecture mismatch, inaccessible path, unsupported API
version, or a library without the required symbols. The official YouTube app's
AAC implementation has not been inspected; its success alone does not identify
which of these libraries or LG interfaces it uses.

### Next device experiment

Use an explicitly invoked probe in a separate ARMv7 process, launched in the
same app context, and report its bounded output in Diagnostics. First identify
firmware library paths, ELF architecture and dependencies without loading them.
Then test identified compatible candidates, recording the resolved library path,
`dlerror()` and required decoder symbols. Distinguish firmware paths from the
app's bundled copy so a successful test cannot accidentally validate the latter.
A separate process and timeout contain library constructor/ABI failures.

For a matching FDK API, decode the existing generated AAC fixture and verify
sample rate, channels and nonzero output before a playback trial. Loading a
library or finding symbols alone does not prove ABI compatibility. Test a real
livestream, VOD, repeated seeks, decoder recreation and audio/video sync before
preferring firmware automatically. Preserve the bundled decoder as fallback.

Starfish AAC remains a separate experiment requiring verified framing and
clock/reset semantics as described above. No runtime preference or upstream PR
was changed as part of this source investigation. Further conclusions require
results from the TV; there is no connected TV in this workspace.

### Diagnostic build 2.6.32

GREEN → Diagnostics → **Run capability test** now includes a firmware AAC
investigation. Allow up to 30 seconds and scroll to **Firmware AAC investigation**.
The report lists matching FDK/FFmpeg files in common system library directories
with their ELF architecture. It also tries the loader names `libfdk-aac.so.2`,
`libfdk-aac.so.1` and `libfdk-aac.so` to cover the process's normal search path.

Each FDK candidate is loaded in a separate process with a 1.5-second timeout and
bounded output. The probe records loader errors, missing API symbols and the
resolved library path. App-local libraries are explicitly skipped so the bundled
decoder cannot masquerade as a successful firmware test. Matching candidates
must decode the generated 48 kHz stereo AAC-LC fixture to nonzero PCM twice with
decoder recreation. No audio is played. A timeout/crash is reported per candidate;
core dumps are disabled for the probe process. FFmpeg results are inventory only.

This is an investigation of known public library paths, not an exhaustive search
of firmware or the official YouTube application's implementation. A successful
fixture decode still needs real playback/sync/seek validation. The bundled FDK
library remains installed and preferred for ordinary playback. No automatic
firmware selection, direct Starfish AAC feeding or root requirement was added.

Host coverage includes real FDK fixture decoding, missing libraries/symbols,
app-local exclusion, and process timeout/crash containment. The existing capability
bridge and UI regressions cover report delivery and the longer bounded wait.

### C3 firmware inventory result (2.6.32 tester screenshots)

The C3 report shows these public firmware libraries, all ELF32 with machine 40
(ARM):

- `/usr/lib/libavcodec.so.59` and `libavcodec.so.59.18.100`
- `/usr/lib/libavformat.so.59` and `libavformat.so.59.16.100`
- `/usr/lib/libavutil.so.57` and `libavutil.so.57.17.100`

These versions identify an FFmpeg 5-era ABI. The versioned FDK loader attempts
(`libfdk-aac.so.1` and `.2`) report no such file. The unversioned name resolves
to the application's bundled library and is correctly excluded. `[ok]` in this
report means the probe process completed, not that the candidate loaded.

The pinned Cobalt `starboard/shared/ffmpeg/BUILD.gn` compiles only libav 54/56
and FFmpeg avcodec 57/58 specializations. The audio factory has no specialization
for avcodec 59. Its current audio implementation calls `avcodec_decode_audio4`,
and the common dispatcher also loads `av_register_all`; a modern adapter needs
the newer packet send/frame receive API and matching library-version headers.
Merely adding `.59` to the filename list would not supply the missing ABI adapter.

This establishes that architecture alone is not the obstacle: the TV exposes
32-bit ARM FFmpeg libraries, but our existing integration does not support their
major version. It does not establish that LG's FFmpeg build includes a working
AAC decoder or identify the official YouTube app's implementation.

The next evidence-gated experiment is an isolated FFmpeg 59/59/57 probe using
matching headers: resolve required functions, report actual library versions,
look up AAC with `avcodec_find_decoder`, then decode the same generated AAC-LC
fixture with `avcodec_send_packet`/`avcodec_receive_frame`. Only a successful
on-TV decode should lead to a playback adapter and sync/seek trials. The bundled
FDK decoder remains installed and preferred; no runtime changes accompany this
inventory finding.

### FFmpeg diagnostic build 2.6.33

The capability test now runs an additional isolated probe against the exact C3
paths `/usr/lib/libavcodec.so.59` and `/usr/lib/libavutil.so.57`. No `libavformat`
is needed for the generated elementary AAC fixture. The probe checks major
versions before accessing any version-dependent structures, reports resolved
paths and rejects app-local libraries. FFmpeg 5.0 public headers, pinned to
`390d6853d0ef408007feb39c0040682c81c02751`, are scoped to a separate GN target;
existing Cobalt adapters and their headers are unchanged.

After `avcodec_find_decoder(AV_CODEC_ID_AAC)`, the probe uses packet send/frame
receive to decode 13 ADTS packets. It validates sample rate, channel count,
sample format, finite nonzero PCM, decoder recreation and EOS draining. Each
probe runs before app initialization in a disposable process with a 2.5-second
limit. It plays no sound and changes no playback preferences. A major-version,
missing-symbol, missing-decoder, load or decode failure is reported explicitly.

The genuine probe passed on the host using FFmpeg 5.0 libraries reporting
59.18.100/57.17.100, exactly matching the C3 inventory. Fault fixtures cover
missing libraries/functions/decoder, incompatible major versions, accidental
app-local loading, crash and timeout containment. The probe also cross-compiles
with the pinned webOS ARMv7 softfp SDK. Firmware behavior still requires the
user's on-TV result; a host pass does not establish LG AAC support.

Install the diagnostic build, fully close and reopen, then run **GREEN →
Diagnostics → Run capability test**. After up to 30 seconds, photograph the
**FFmpeg 59 AAC test** section. A successful result ends with
`decode=PASS firmware FFmpeg AAC; recreated twice and drained EOS`.
The existing bundled FDK library remains installed and preferred for playback.


## Firmware AAC playback adapter (2.6.34)

The C3 running firmware FFmpeg 59.18.100 / avutil 57.17.100 passed the
2.6.33 device probe: two complete decodes, 13 non-silent 48 kHz stereo frames
per pass, decoder recreation and EOS drain. This proves AAC-LC decoding on
that device; it does not establish playback sync or all AAC profiles.

2.6.34 prefers a private FFmpeg 59 adapter for AAC on the legacy audio path.
It dynamically loads the fixed `/usr/lib` libraries, verifies ABI majors and
required symbols, and uses packet timestamps in microseconds. PCM is converted
to interleaved float audio for Cobalt's existing renderer, clock and resampler.
Seeking recreates the context and cancels old scheduled outputs. EOS drains
before the renderer receives its terminal marker. Shared Opus/Starfish is unchanged.

Missing/incompatible firmware falls back to bundled FDK. Failure before the
first PCM output also falls back, replaying up to 32 startup packets. Once PCM
has been emitted, decoder errors are reported to Cobalt rather than replaying
already played audio. `YTAF_AAC_DECODER=fdk` forces the previous bundled decoder
for developer rollback. Both decoders stay packaged. Diagnostics distinguish
`Firmware-FFmpeg59` from `FDK-AAC`.

### C4 / webOS 26 feedback (2026-10-25)

A C4 on firmware 43.21.73 reportedly cannot play livestreams with the 2.6.36
firmware-only experiment, while 2.6.35 restores playback. Its Diagnostics summary
identifies the bundled FDK fallback. This is evidence that the fallback remains
necessary on this configuration; it does not identify whether firmware loading,
ABI compatibility or startup decoding failed. The firmware adapter remains
limited to the verified FFmpeg 59 / avutil 57 ABI. No arbitrary newer ABI is loaded
and no C4-specific timing offset is inferred from this result.

Normal package builds retain FDK. Firmware-only packages remain an explicit
manual experiment, and 2.6.35 remains the compatibility recommendation. See the
[device feedback and packaging decision](cold-start-firmware-aac-experiment.md#c4-compatibility-decision).

Host regression tests decode the actual fixture with 100 alternating seek
positions, checking every PCM timestamp and EOS, plus malformed input and
missing-library rejection. Actual C3 livestream playback, DVR seek, pause/resume,
long-run A/V sync and other AAC profiles still require on-device testing.
