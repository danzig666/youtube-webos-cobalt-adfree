# YouTube webOS Cobalt AdFree

[![CI](https://github.com/RF1705/youtube-webos-cobalt-adfree/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/RF1705/youtube-webos-cobalt-adfree/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/danzig666/youtube-webos-cobalt-adfree?include_prereleases&label=latest%20release)](https://github.com/danzig666/youtube-webos-cobalt-adfree/releases)
[![Downloads](https://img.shields.io/github/downloads/danzig666/youtube-webos-cobalt-adfree/total?label=downloads)](https://github.com/danzig666/youtube-webos-cobalt-adfree/releases)

Unofficial Cobalt-based YouTube modification for LG webOS TVs with ad blocking and SponsorBlock support.

**Current corrective build: [v2.6.4-beta.1](https://github.com/danzig666/youtube-webos-cobalt-adfree/releases/tag/v2.6.4-beta.1)**

- [Separate-ID IPK — installs alongside YouTube](https://github.com/danzig666/youtube-webos-cobalt-adfree/releases/download/v2.6.4-beta.1/com.cobalt.youtube.adfree_2.6.4_arm.ipk)
- [Original-ID IPK — replaces official YouTube](https://github.com/danzig666/youtube-webos-cobalt-adfree/releases/download/v2.6.4-beta.1/youtube.leanback.v4_2.6.4_arm.ipk)

Update the same package ID you already use, then fully close and reopen the app.
This build corrects caption-size changes and repeated Magic Remote dropdown
clicks, adds black caption backing and a black outline for custom sizes, and
retains the 2.6.3 playback fixes. Physical C3 validation still needs a retest;
see the release notes for checks and limits.

> This project is unofficial and is not affiliated with YouTube, Google, LG or webOS.

## Features

- YouTube for LG webOS TVs
- Advertisement blocking
- SponsorBlock support with permanent per-channel exceptions
- Return YouTube Dislike support
- Automatic account selection on startup
- Playback speed selector (0.5×–2×) with native rate feedback
- Local playback-position saving and optional immediate/briefly delayed seeking
- Optional Shorts visibility
- Sleep timer (15 / 30 / 60 / 90 minutes)
- Remote help, optional numeric shortcuts and remembered settings position
- Video quality setting: Safe (1080p SDR), 4K SDR, or 4K HDR
- Optional autostart integration
- Installable `.ipk` package

The configuration screen can be opened with the **GREEN** button on the LG remote.
While a video is playing, press **1** to decrease playback speed or **3** to increase it. Press **0** to toggle subtitles. **Reset playback speed to 1×** can be assigned to any numeric key under **Remote**.

### Video quality

Press **GREEN**, open **Playback → Video quality**, and press **OK** to open the options:

- **Safe · 1080p SDR (default)** — H.264 up to 1080p60.
- **4K · SDR** — also enables VP9 and AV1 up to 2160p60.
- **4K · HDR** — also enables HDR10/HLG for those UHD codecs.

The selection is saved on the TV. **Fully close and reopen the app** to apply a
change; going to Home may leave the app running. Choose a mode supported by your
TV. If playback fails, switch back to Safe and restart. The menu shows the active
mode and whether a restart is pending. This requires the updated native runtime;
updating only the injected web assets cannot enable the setting on older builds.
No root access, SSH or environment-variable configuration is needed.

For developer testing, `YTAF_VIDEO_CAPS` still takes precedence over the saved
selection; the menu identifies when that override is active.

### SponsorBlock channel exceptions

While watching a channel, press **GREEN**, scroll to **SponsorBlock channel
exceptions**, and choose **Never skip SponsorBlock on this channel**. The
exception saves automatically by channel ID and applies immediately to every
SponsorBlock category, including future videos from that channel. It does not
change ad blocking. Choose **Enable SponsorBlock on this channel** to undo it.

Use **Next saved channel exception** and **Remove selected channel exception**
to manage exceptions even when that channel is not playing. The list is bounded
to 200 channels. If the menu reports that saving failed, the exception applies
only for the current app session. Preferences are separate for the two app IDs
and can be lost if app data is cleared or the app is uninstalled.

A channel must be identified from player metadata matching the current video.
When exceptions exist, SponsorBlock waits for that metadata before skipping;
an unknown channel is never guessed from an old video or display name. Channel
detection against the live YouTube TV UI still needs TV validation.

### Sleep timer and remote controls

In **GREEN → Sleep timer**, press **OK** to choose 15, 30, 60 or 90 minutes.
The menu shows time remaining; **Cancel sleep timer** turns it off immediately.
The timer pauses the current video, including after resume if its deadline
passed while the app was suspended. It does not turn off the TV and does not
persist across a full app restart.

**Show remote help** explains the controls. **Numeric playback shortcuts**
lets you turn the `0 / 1 / 3` shortcuts off. These shortcuts leave text-entry
fields alone and are active only on a playback page. Playback-speed requests
still depend on the native runtime's rate policy and TV support.

Settings reopen at your last focused item during the same app session. The
header reports saved preferences or warns when changes only apply for this
session because storage is unavailable.

The implemented batch and follow-up ideas are documented in
[the usability roadmap](docs/usability-improvements.md).

## Installation

Download the current `.ipk` from the GitHub releases page and install it using Homebrew Channel, webOS Device Manager, `ares-cli`, or the webOS app install service on rooted devices.

Releases provide **both package variants until sign-in with the separate ID is
confirmed on TVs**. Both contain the same features and use the same version:

| Variant | App ID | Installation behavior |
| --- | --- | --- |
| Original ID | `youtube.leanback.v4` | **Replaces official YouTube**; retains the identity used by earlier builds for sign-in/phone pairing compatibility |
| Separate ID | `com.cobalt.youtube.adfree` | Installs alongside official YouTube as **YouTube Cobalt AdFree** |

Choose by the app ID in the IPK filename. The original-ID launcher title is
**YouTube AdFree (Original ID)** so the two variants are distinguishable.
Installing the separate package does not restore an official app already
replaced by an older build; reinstall the official app from LG's store if needed.

### Sign-in and phone pairing

The normal YouTube TV **Sign in** screen is retained. The separate app has its
own application storage; accounts and settings from the official app or an
older replacement build are not migrated. Sign in again inside this app.

**Sign-in and phone pairing with the separate ID have not been verified on a
TV.** Earlier upstream releases switched to the official ID specifically to
restore phone pairing. A separate ID may therefore affect phone pairing or
sign-in; this build does not claim to resolve that compatibility issue.

### Downloads and Homebrew Channel

Use this fork's [release page](https://github.com/danzig666/youtube-webos-cobalt-adfree/releases)
for both IPK variants. The upstream Homebrew catalog distributes the
replacement app under the official ID; do not use that catalog when you want
to keep the official YouTube app installed.

## Building

Clone the repository:

```sh
git clone https://github.com/RF1705/youtube-webos-cobalt-adfree.git
cd youtube-webos-cobalt-adfree
```

The current Cobalt runtime is built directly for webOS and packaged without an LG Cobalt starter binary. Build helpers and platform patches are contained in `cobalt-platform/` and `scripts/`.

Relevant build scripts include:

- `scripts/build-starterless-cobalt-docker.sh` — builds Cobalt for webOS
- `scripts/package-starterless-cobalt.sh` — creates the application package
- `scripts/build-sdl-webos-docker.sh` — builds the SDL webOS platform dependency

## Development

The web application sources are in `webapp/`.

Run the webapp tests with:

```sh
cd webapp
npm install
npm test
```

## Compatibility

Compatibility depends on the webOS version, TV platform, firmware and Cobalt/Starboard runtime. Please use the issue tracker for current device reports and compatibility problems.

## License

See the repository license files for the licensing terms of the project and its components.

## Building both release variants

Use the same `YTAF_PACKAGE_ID` for the native build and its package step:

```sh
for app_id in youtube.leanback.v4 com.cobalt.youtube.adfree; do
  YTAF_PACKAGE_ID="$app_id" scripts/build-starterless-cobalt-docker.sh
  YTAF_PACKAGE_ID="$app_id" scripts/package-starterless-cobalt.sh
done
```

Keep your normal SDK, build-directory and runtime-library configuration for both
commands. The default ID remains `com.cobalt.youtube.adfree`. Each native build
embeds its selected ID for both Starfish backends; packaging checks that the
runtime contains that identity. Renaming an existing IPK or changing only its
manifest is not sufficient. Release both IPKs with per-variant build metadata
and checksums until separate-ID sign-in/pairing has device evidence.

### Additional playback controls (2.3.0)

Open the **GREEN** menu for SponsorBlock per-category **Auto skip / Ask first /
Markers only / Off**, configurable **0–9 remote shortcuts**, and **Stop after this
video**. Stop-after-video pauses subsequent autoplay until **Continue playback**;
use Cancel to disarm it before the ending. Existing SponsorBlock choices and
0/1/3 shortcut defaults are preserved. Channel exceptions override segment modes.
See [usability behavior and validation limits](docs/usability-improvements.md).
Backup/restore is not included. On-TV behavior still needs device validation.

### Captions and DeArrow (2.4.0)

The GREEN menu now offers **caption startup behavior, preferred language and
text size**. Defaults preserve YouTube settings; manual changes take priority.
**DeArrow** is optional and off by default: choose **Titles only** or **Titles
and thumbnails**, and use **Show original titles and thumbnails** to pause it.
Enabling it sends visible video IDs to DeArrow's public services. Unsupported
cards and missing submissions keep their originals. See the
[integration details and TV validation limits](docs/caption-dearrow-integration.md).

### Wheel scrolling and comments

The Magic Remote wheel scrolls the GREEN settings menu, including option lists,
help and diagnostics. Use YouTube's own comments interface; the separate app
comments reader was removed in 2.6.1 following LG C3 feedback.

### Blue settings interface (2.6.2)

The GREEN menu has a calm navy/blue design with larger labels and six categories:
General, Playback, Captions & titles, Remote, SponsorBlock and Diagnostics.
Use Up/Down to choose a category, Right to enter it, Left to return to categories,
and OK to select or change a setting. BACK or the close button dismisses settings.
The Magic Remote wheel scrolls the current category. Choices open combobox-style
lists: select an option directly with the pointer or use Up/Down and OK. BACK
cancels an open list first, then closes settings on a new press without closing
the video. Remote lists every numeric key with its own action selector.
Diagnostics automatically displays one complete, scrollable read-only textbox.
There is no clipboard-copy or report pagination control.

Adblocking defaults to enabled. Menu preferences save to a bounded private file
in ordinary app storage, separately for each package ID; existing preferences
migrate from browser storage on the next change. Caption sizes include Extra
small, Small, Normal, Large and Extra large, with YouTube default to remove app
text styling. Actual caption rendering on the C3 still needs a retest.

See [interface design and validation](docs/blue-interface.md).

### Playback position, seeking and speed (2.6.2)

In **GREEN → Playback**, **Remember playback position on this TV** defaults on.
The app retains up to 100 unfinished VOD positions for 90 days, saving at most
once every ten seconds during playback and again on pause, completed seeking or
exit. Positions are local to this TV and package ID, shared by accounts using
that install, and are not synchronized to YouTube. **Clear saved playback
positions** removes them. Live/DVR, Shorts and unconfirmed video metadata are
excluded. YouTube's own nonzero resume point and explicit timestamp links take
precedence. Uninstalling the app can remove its saved positions.

**Left / Right seeking** offers **YouTube default (confirm with OK)**,
**Quickly (80 ms after last press)**, and **After short pause (300 ms)**. Automatic modes use
10-second steps during playback or on the timeline, preserving arrows in other
controls. Both automatic modes combine rapid repeated presses into one seek; OK applies
it early and BACK cancels it. Opening settings or changing videos cancels it.

**Playback speed** offers **YouTube choice** (default) and **0.5× through 2×**.
A custom speed applies to the current video only and is attempted after native
playback begins. Each new video and app launch starts normally; saved custom
rates from older releases are cleared. Speed changes show a toast. Actual native
frame progress and speed are monitored, including during buffering. Rejected,
ineffective or stalled speeds restore 1× and clear the preference.
**Reset playback speed to 1×** is available in Playback and as a selectable
Remote key action. Reset reaches the shared native worker even during buffering
and preserves a user pause. Custom rates are currently restricted to the shared
A/V backend; legacy playback retains 1× because it has a separate audio clock.
Firmware support still needs TV confirmation. Developer `YTAF_PLAYBACK_RATES`
overrides remain authoritative.

Magic Remote option lists close when changing category and accept pointer
release directly. The complete pointer/mouse gesture is consumed so dismissal
cannot toggle switches underneath. An outside click dismisses the list; a second
click activates the underlying control. Repeated clicks on the opener and mixed
Enter/mouse activation leave the list open; the next deliberate gesture selects
an option without a one-second wait. Custom caption size has one stylesheet
owner and a stable baseline across cue/window replacement. Caption text has a
black backing, with a black outline at custom sizes. YouTube default removes
app font-size, line-height and outline rules while retaining the black backing.
See [caption/dropdown correction and validation limits](docs/lg-c3-caption-picker-fixes.md).

The 2.6.3 runtime retains early `currentTime` requests until an actual seekable
range exists, including after metadata. Regression tests reproduce the previous
empty-range clamp to zero using the real DOM seek method. Local resume requests
retry finitely and report success only once playback reaches the saved position.
Diagnostics show resume status and actual native presentation timestamps. YouTube's video geometry
and Cobalt's native text accessor are preserved rather than continuously
rewritten. GREEN can restore a removed settings node. Diagnostics include app
media and SponsorBlock state to help investigate intermittent disappearing
controls; that reported physical-TV failure is not confirmed resolved here.
