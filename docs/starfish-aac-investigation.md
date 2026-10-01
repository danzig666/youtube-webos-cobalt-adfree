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
- Cobalt's existing Linux factory retains FfmpegAudioDecoder for AAC. Legacy
  StarfishVideoDecoder supplies video separately. AAC fallback is preserved.
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
