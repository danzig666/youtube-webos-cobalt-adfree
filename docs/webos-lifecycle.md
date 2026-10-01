# webOS lifecycle policy

`WebOsLifecycle` owns application event-loop transitions and emits explicit
Blur/Conceal/Reveal/Focus/Stop operations. SDL WILL/DID background and foreground
events and termination feed that policy. Duplicate events issue no operations;
missing WILL events are completed by DID events in the existing Cobalt order.
Starting, foreground, background, suspended, resuming and stopping are explicit
states. Stopping is terminal. Host tests cover 100 full background/resume cycles,
duplicates and omitted WILL events.

Media and graphics preparation/restoration continue through Cobalt's existing
Blur/Conceal/Reveal/Focus callbacks. The platform does not call unverified LG
methods, manually restore EGL objects, or impose an additional native media
shutdown. The existing starterless signal/freeze and SDL relaunch/SIGCONT patches
remain in place. `kSuspend` is a pure policy input for a future verified suspend
source; SDL currently supplies background/foreground events instead. No process
freeze is newly enabled.

Actual Home/return, relaunch, firmware suspension, repeated resume, closing and
reopening still require on-device validation. Host idempotence does not prove
firmware event ordering or native resource recovery.
