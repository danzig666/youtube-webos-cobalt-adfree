# Playback diagnostics on TV

Open the GREEN-button extras menu, select **Show / refresh playback report**
under Diagnostics, and use Previous/Next to read the report. Refresh takes a
new snapshot; there is no continuous polling while the menu is closed.

The report contains the packaged application version, repository source SHA,
Cobalt/Starboard versions, ARMv7 build architecture and allowlisted kernel architecture (from uname), numeric webOS release if
available, active capability limits, saved video preference for the next launch,
whether a developer override is active, shared-backend/rate policy, the latest
native player's latest accepted input configuration/generation/rates/queue occupancy, and at most
100 structured playback events. Unknown fields stay unknown. The legacy
player's independent audio decoder is not observed by the video backend;
its audio configuration is reported as unknown. The newer player snapshot
rejects late updates from earlier sessions/generations and survives ring eviction.
Queue values describe queued input, not private firmware buffer occupancy.

**Copy diagnostic report** schedules SDL clipboard access on the Starboard
application thread and confirms read-back before displaying “Report copied.”
If the compositor/runtime has no usable clipboard, copying reports unavailable;
the paged report remains readable. Copying never writes to a network service,
GitHub, a user profile, or a permanent file. Clipboard interoperability on an
actual webOS compositor still needs device validation.

The build adds a small H5VCC binding (`h5vcc.system.getYtafMediaReport`, copy
request/status, and numeric MediaSource tracing) to Cobalt's existing bindings.
Older native builds display an explanatory unavailable message. Other Cobalt
platforms return unavailable rather than referencing webOS platform symbols.
The bridge reads no account, advertising ID, navigator/user-agent, cookies,
headers, video URLs, DOM browsing state, or firmware callback strings. Only
numeric WEBOS_VERSION values from the fixed `/etc/webos-release` file are
accepted; arbitrary contents and unknown environment override strings are
excluded. Application version/SHA come from checked build metadata.

Host regressions cover report bounds, validation of numeric trace arguments,
stale-generation snapshots, ring/log budgets, remote activation once per press,
clipboard confirmation/failure, and sampled MediaSource traces. ARM checks and
the full Gold build validate native/IDL integration. Host tests cannot establish
on-device playback or clipboard availability.

## Video quality preference

The GREEN menu's Video quality choice is native-backed. The H5VCC bridge exposes
`getYtafVideoCapabilitySetting()` (saved/active tier and override status) and
`setYtafVideoCapabilitySetting(value)` (0 Safe, 1 UHD SDR, 2 UHD HDR). Invalid
values are rejected; failed writes restore the previous visible selection.
The webapp does not keep a competing localStorage copy.

The native preference is the bounded, canonical tier name in
`ytaf-video-capabilities` under Starboard's app storage directory. Writes use a
mode-0600 temporary file, fsync and same-directory rename. The previous file
remains intact on failed writes. Missing, unreadable or malformed data selects
Safe. This uses the app's ordinary storage permissions, not root or SSH.

Capabilities are latched at first query before playback. Saving a preference
does not alter existing or later players in that process; a full app restart
applies it. An explicit YTAF_VIDEO_CAPS environment override wins, including
invalid overrides that fail closed to Safe. Diagnostics and the menu distinguish
the active tier from the saved next-launch preference.

### Video setting validation (2026-10-02)

Implementation source `57700400c8fba1ae1c8029bf8185920d757b8723` passes all
47 webapp tests, native host suites and ARM source checks. Preference tests use
real file I/O and separate processes to check saved-mode persistence, unchanged
active policy before restart, invalid/corrupt inputs, unavailable storage and
environment precedence. UI tests exercise the actual choice and remote handlers,
including save failure, pending restart, overrides and repeated synthesized clicks.

The Gold ARM build regenerated and compiled Cobalt bindings and linked successfully.
The final IPK passes exact payload validation (executable/source SHA, current web
assets, all three SDK runtime libraries, appinfo and non-root permissions).

- IPK: `output/youtube.leanback.v4_2.0.2_arm.ipk`.
- IPK SHA-256: `6c14c164a1097e49fb4b1398455f4e56c9b3853f14b4867285d903e0252edadf`.
- ELF SHA-256: `6b6ec4033a0f20a976ea732ecc1bf9135c8ca2beb643699f1d6064cf6e1c39cb`.
- Runtime archive: `output/cobalt-23.lts.6-sb13-gold-5770040.tar.xz`.
- Logs: `output/video-setting-*.log`.

This replaces the local IPK at the same filename; the previous reviewed package
is retained in `output/pre-video-setting/`. No TV was available, so actual UHD/HDR
playback and firmware behavior remain unverified. No stable release was published.
