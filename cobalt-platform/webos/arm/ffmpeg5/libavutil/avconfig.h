/* Diagnostic header configuration; no FFmpeg implementation is compiled here. */
#ifndef AVUTIL_AVCONFIG_H
#define AVUTIL_AVCONFIG_H
#if __BYTE_ORDER__ == __ORDER_BIG_ENDIAN__
#define AV_HAVE_BIGENDIAN 1
#else
#define AV_HAVE_BIGENDIAN 0
#endif
#define AV_HAVE_FAST_UNALIGNED 0
#endif
