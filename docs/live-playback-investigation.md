# Live playback evidence gate

## Host-verifiable facts

Native tracing now records bounded structured capability queries, audio/video
factory inputs, shared/legacy selection, first packets, Load/LoadCompleted,
first accepted Feed, first frame, seek, EOS and unload. Shared input records
backward timestamp discontinuities without changing admission behavior.
Events use a numeric session and generation; capability queries have session 0
because they precede player creation. Factory attempts and legacy decoder
instances have separate IDs. Legacy generations describe diagnostic context,
not proof that firmware identifies stale callbacks after a retained seek.

At most 128 structured stderr lines are emitted per process (96 routine and
32 reserved for errors/unload/native EOS; capability queries can use at most 16
routine lines), in addition to the existing bounded
shared trace. A synchronized ring always retains the last 100 typed events.
`CopyMediaDiagnosticEvents()` exposes that ring internally. No on-TV UI/export
bridge has been implemented yet. Reports never ingest free-form input or
vendor callback strings. Legacy vendor error text has also been removed from
logs; numeric event/error context remains.

The shared Opus planner rejects `first_decoded_audio_us > target_us`, inadequate
seek pre-roll, unsupported trimming and timestamp overflow. A live stream whose
first timestamp is positive while its requested startup target remains zero
would hit that gate. Host tests establish the condition; they do not establish
that a failing YouTube livestream actually supplies that sequence.

## Hypotheses requiring a failing TV trace

- Startup target and the initial live timestamp may use different origins.
- AAC or non-WebM selection may take the legacy path.
- A discontinuity or changed initialization segment may invalidate timing.
- Network starvation may encounter the current 20-second presentation timeout.

No live playback behavior is changed based on these hypotheses. Direct
MediaSource append/discontinuity instrumentation at the Cobalt demuxer layer
and buffering classification remain follow-up work once native traces locate
the gap. Do not assume finite duration, terminal EOS or one initialization
segment for live input.

## Required device scenarios

Use a fresh process for each initial failure capture so the stderr budget is
available. Capture session IDs, generation, codec, requested target, first audio
and video timestamps, load/feed/frame boundaries, discontinuity and error
category. Never collect signed video URLs, account identifiers or credentials.

Test plain live, DVR startup/backward seek/return to edge, quality switching,
observable ad transitions, timestamp resets, temporary starvation and recovery,
and a long session. A repair requires an observed failing sequence, a host
regression for its state/timing rule, ARM/Gold validation and the device replay.
