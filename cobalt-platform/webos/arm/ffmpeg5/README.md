# FFmpeg 5.0 public headers for the firmware AAC probe

Source: https://github.com/FFmpeg/FFmpeg/tree/390d6853d0ef408007feb39c0040682c81c02751
(tag `n5.0`; libavcodec 59.18.100, libavutil 57.17.100).

This is the public include closure of `libavcodec/avcodec.h`, used only by the
isolated diagnostic translation unit. Original headers are unchanged, except
`libavutil/avconfig.h` is a local configuration selecting compiler byte order
and conservative unaligned access. No FFmpeg implementation or shared library
is bundled. Runtime symbols are loaded from the TV only after checking the
required major versions. The existing Cobalt adapters use their own headers.

Copyright notices remain in each header. `COPYING.LGPLv2.1` is included in the
IPK under `content/licenses/ffmpeg5-headers.txt`.
