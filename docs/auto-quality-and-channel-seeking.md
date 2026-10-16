# Higher-quality Auto startup and channel seeking — 2.6.28

## Higher-quality Auto startup

GREEN → Playback → Higher-quality Auto startup is optional and off by default.
When YouTube's preferred quality is Auto, the controller briefly requests the
highest recognized level in `getAvailableQualityLevels()`. Once playback reports
that level, it returns the range to Auto. A ten-second hand-back limit also
returns control to Auto if the requested quality does not arrive. Missing APIs
or levels have a separate bounded ten-second startup window, without a permanent
poll. Codec/HDR policy and available streams are not modified.

The idea and player APIs come from LawfulGremlin's
[`v2` branch](https://github.com/LawfulGremlin/youtube-webos-cobalt/tree/7a85ee9f4b7553b8416f118154ff4924c772d4be), specifically
[`e11ea278a7`](https://github.com/LawfulGremlin/youtube-webos-cobalt/commit/e11ea278a7) and
[`3b5ce08dd2`](https://github.com/LawfulGremlin/youtube-webos-cobalt/commit/3b5ce08dd2).
This adaptation adds an opt-in setting, explicit quality ranking, bounded startup,
video/element identity checks, background cleanup and diagnostic status.

Remote/cursor input releases the temporary pin before YouTube handles a manual
selection, including selecting the same highest quality. An independently changed
preferred quality is respected. There is one attempt per video/media session;
adaptive quality notifications do not repeatedly pin it. Old callbacks never
change quality on a different video or media element. Disabling the option
releases a pin that still belongs to the current video. Player API failures are
contained and the settings status explains a failed return to Auto. No account
information, URLs or browsing history are added to diagnostics.

This is a startup preference, not a guarantee of 4K or uninterrupted playback.
YouTube's adaptation, the connection, selected capability profile and TV firmware
still determine what can play. No TV was available for this implementation.

## Channel + / − quick seek

Left/Right pass through to YouTube's normal controls. Channel + (427 / ChannelUp)
previews ten seconds forward; Channel − (428 / ChannelDown) previews ten seconds
backward. The existing native SDL → Starboard mapping already supplies these
codes (`kSbKeyChannelUp=0x1ab`, `kSbKeyChannelDown=0x1ac`). Page Up/Down are not
aliases, so reader scrolling remains independent.

The visible target updates on keydown. Repeated taps accumulate into one seek;
playback changes 0.5 seconds after the final release by default. Playback settings
also offer 0.8 seconds, 1 second and Off. A held button defers seeking until
release; missing releases recover after two seconds. OK commits; BACK cancels.
A native arrow press cancels a pending channel preview and reaches YouTube.

`channelSeekBehavior` replaces the old Left/Right `seekBehavior` setting. Saved
0.5/0.8/1-second modes migrate to the channel shortcut; the previous YouTube arrow
mode initializes the new channel shortcut at 0.5 seconds. Explicit new channel-Off
choices persist. Native Left/Right never read the earlier preference.

Settings, interactive controls, Shorts and recommendation shelves cannot claim
channel seeking. Pending requests recheck focus and video identity at commit.
The existing seekable-range/DVR clamps, preview, key-release handling and native
controls reveal are retained.

## Validation

- `npm --prefix webapp test`: 401 passing tests, including startup timeout,
  same-quality manual choices, navigation, background and setting persistence.
- Production bundle browser checks at 1280×720 and 1920×1080:
  `scripts/test-auto-quality-browser.py`, `scripts/test-playback-recovery-browser.py`,
  `scripts/test-settings-browser.py`, `scripts/test-fork-adaptations-browser.py`.
- Long-playback regression covers 20 simulated minutes, SponsorBlock, native
  arrows, channel preview/delay, recommendation navigation and GREEN/BACK.
- Native host, packaging and exact-source ARM IPK checks remain required.

Browser player/media/timing APIs are explicit fixtures; these checks do not claim
on-TV validation of the quality switch or physical Channel + / − delivery.
