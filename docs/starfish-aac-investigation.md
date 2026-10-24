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
