# Early Home and Shorts ad filtering

Adapted [RF1705 PR #119](https://github.com/RF1705/youtube-webos-cobalt-adfree/pull/119),
commit `763786419abd3aa12111f71766939222e45bcf49`.

The preload filters JSON before YouTube consumes the initial Home feed, later
continuations, player responses and Shorts data. It removes whole ad-slot,
masthead and nested rich-item/tile entries before clearing ad-specific fields.
This avoids leaving empty tiles after their ad markers have been deleted.
Sponsored shopping QR overlays are filtered early using their separate setting.

Ad blocking defaults **on**. A deliberately saved off setting is respected;
updating does not reset the user's preferences. Cached guide reapplication uses
the current switches and preserves its original unfiltered cache, so changing
Shorts/ad preferences does not permanently discard cached entries.

The shared filter also serves older runtimes without preload. When preload is
active, the main bundle does not add a second parser/filter pass. Our existing
Cobalt-compatible DOM observer and passive ad CSS remain as fallbacks. Playback
and watch-time tracking, resume metadata, SponsorBlock channel metadata, optional
display filters and Home refresh are preserved. No native player changes or
root access are involved.

Validation: 421 web tests, production webpack build, and real-browser settings
checks at 720p/1080p. Regressions cover filtering before the main bundle,
continuations, nested ad tiles, independent saved switches, cached guide
reapplication, metadata preservation and the older-runtime fallback. TV testing
of this adaptation is still pending.
