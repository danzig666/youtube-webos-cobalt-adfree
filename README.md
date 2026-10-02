# YouTube webOS Cobalt AdFree

[![CI](https://github.com/RF1705/youtube-webos-cobalt-adfree/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/RF1705/youtube-webos-cobalt-adfree/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/RF1705/youtube-webos-cobalt-adfree?label=latest%20release)](https://github.com/RF1705/youtube-webos-cobalt-adfree/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/RF1705/youtube-webos-cobalt-adfree/total?label=downloads)](https://github.com/RF1705/youtube-webos-cobalt-adfree/releases)

Unofficial Cobalt-based YouTube modification for LG webOS TVs with ad blocking and SponsorBlock support.

> This project is unofficial and is not affiliated with YouTube, Google, LG or webOS.

## Features

- YouTube for LG webOS TVs
- Advertisement blocking
- SponsorBlock support
- Return YouTube Dislike support
- Automatic account selection on startup
- Playback speed support
- Optional Shorts visibility
- Video quality setting: Safe (1080p SDR), 4K SDR, or 4K HDR
- Optional autostart integration
- Installable `.ipk` package

The configuration screen can be opened with the **GREEN** button on the LG remote.
While a video is playing, press **1** to decrease playback speed or **3** to increase it. Press **0** to toggle subtitles.

### Video quality

Press **GREEN**, select **Video quality**, and press **OK** to cycle through:

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
