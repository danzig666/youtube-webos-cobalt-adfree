# Playback diagnostics on TV

Open the GREEN-button extras menu, select **Show / refresh playback report**
under Diagnostics, and use Previous/Next to read the report. Refresh takes a
new snapshot; there is no continuous polling while the menu is closed.

The report contains the packaged application version, repository source SHA,
Cobalt/Starboard versions, ARMv7 build architecture, numeric webOS release if
available, selected capability limits, shared-backend/rate policy, the latest
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
