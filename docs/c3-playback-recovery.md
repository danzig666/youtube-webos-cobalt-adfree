# Intermittent playback controls and SponsorBlock — 2.6.22

The C3 user reports that controls and SponsorBlock initially work, then both
become unreliable during uninterrupted playback. Playback continues and Back
still works; repeated keys can eventually expose the timeline. There is no TV
connected to this build environment. The physical failure remains unconfirmed.

## Reproduced defects and corrections

Three new regressions fail against 2.6.21 and pass with this change:

- A controls shell can retain a full-screen rectangle while its actual buttons
  and timeline are hidden. Reveal now inspects its actual children before
  treating controls as visible.
- YouTube can retain focus on a button after hiding controls. That focus no
  longer blocks reveal when all controls were confirmed hidden. Editable
  fields, visible controls, unrelated interactive focus, menus and unknown
  layout remain protected.
- Every SponsorBlock playback update cancelled the pending skip timer before
  scheduling a replacement. A synthetic busy-queue test delivers repeated
  updates/polls before the timer callback and reproduces a missed due skip.
  Polls and media updates now apply a due automatic skip directly. Future
  segments retain timed scheduling. Channel exclusions, stale requests, pause,
  prompts and category policies are still checked before seeking.

Ordinary arrows previously had no reveal recovery: the helper was only called
by the optional automatic-seek feature. An unconsumed arrow now reaches YouTube
first; after 80 ms the app checks whether the actual controls remain hidden and
uses the bounded existing Enter-pair reveal when appropriate. It never forces
CSS visibility, reloads the page or sends an extra activation to visible controls.
Navigation/media replacement invalidate queued recovery. The 0.5-second
automatic-seek debounce remains unchanged.

## Evidence available on the TV

Diagnostics now report foreground state, received key and timeupdate counts,
age of the last timeupdate and last advancing DOM position, maximum measured
script-timer delay, delayed-timer count, and control-reveal attempts. SponsorBlock
adds last actual poll age, poll error count and media replacement count. Errors
are counted without serializing their messages, URLs, identities or responses;
poll warnings are bounded. One independent one-second sampler distinguishes
recent deliveries from a timer handle that merely exists. Background/relaunch
delays are excluded. These counters do not restart or refresh YouTube.

A high timer delay indicates late JavaScript task delivery. Fresh polls with an
old advancing-position age suggest stale DOM playback time; native presentation
is already included separately in the report. Fresh polls with no skips should
be assessed against fetch/category/channel policy. These are diagnostic clues,
not evidence that any one condition caused the C3 report.

## Validation

- 332 web tests pass, including the three before/after failures, queued reveal
  cancellation, visible/editable focus protection, 20-minute bounded health
  sampling, missing progression, delayed delivery and background exclusion.
- The complete production bundle passes 20 simulated playback minutes at 720p
  and 1080p with three automatic sponsor skips, repeated retained-focus control
  recovery, visible-control protection and GREEN/BACK isolation.
- Production webpack compilation, six package tests and two container/tool
  tests pass. Both package IDs use locally built ARM Gold Cobalt runtimes.

Browser validation uses synthetic YouTube/media responses and virtual timers;
it does not reproduce actual C3 firmware, renderer timing or a native freeze.
A long-playback C3 retest is required before calling the intermittent issue fixed.
The supplied photos confirm ordinary LG queries identify OLED65C35LA, firmware
33.23.05, webOS SDK/platform 10.2.2, 4K OLED, HDR10 and Dolby Vision. They do not
establish codec/profile playback support; no automatic capability changes occur.
