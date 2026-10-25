# Hungarian in-app voice search

Under **GREEN → General → Voice search language**, choose **Hungarian / Magyar**.
Then open YouTube Search and select its microphone using the remote's OK button
or cursor. Wake the Magic Remote first. The TV can remain in English.

The other choices are YouTube default and English. Preferences persist through
the existing private app store. This setting does not translate the GREEN menu
or change webOS settings. The physical microphone button can still open LG's
system assistant; that assistant retains LG's own speech language configuration.

## Implementation

The native microphone is adapted from RF1705 upstream commit
`34823b47e43ee11b907002eb82ff76bbe4040031`, including the capture and shutdown work
in [#116](https://github.com/RF1705/youtube-webos-cobalt-adfree/pull/116) and
[#118](https://github.com/RF1705/youtube-webos-cobalt-adfree/pull/118).
It borrows the app-named libhelpers connection and requests voiceconductor's
recordVoice PCM socket. This supplies mono 16-bit 16 kHz audio to Cobalt's
existing microphone/MediaRecorder path. It does not call LG's English recognizer.

Recognition remains with YouTube/Google. No separate speech server, API key or
offline recognition model is introduced. Audio is sent through YouTube's normal
voice-search route only when the user starts a search; it is not saved to disk
or included in logs. Native buffers are bounded, preserve sample alignment and
unread data, and are cleared on close. Recording sessions have a 30-second limit.

The preload applies an explicit `hu-HU` language when a Web Speech recognizer
starts. For YouTube/Google voice HTTP requests, it replaces existing language
query fields, YouTube client `hl`, and supported JSON recognition-language
fields, and supplies Accept-Language. Fetch and XHR hooks preserve unrelated
queries, authentication, binary audio, request credentials and abort signals.
They leave ordinary playback/search/feed requests unchanged. Unknown settings
fall back to YouTube default. Nothing initiates recording automatically.

Voice libraries are resolved on demand with guarded symbols; they do not become
new eager GLib/LS2 loader dependencies. JSON-C 0.18 is statically linked from the
pinned SDK and its MIT notice is packaged. The app does not create extra LS2
roles or require root. Missing helpers, permissions or service support fail
capture normally. Shared-dispatch tasks time out before starting; cancelled tasks
cannot retain stack references. If a dispatcher stalls during cleanup, subscribed
userdata stays alive until cancellation can run. A new capture uses fresh state.
Backgrounding or stopping the application closes the microphone and prevents
hidden recording. Returning to the app permits a new capture without reopening
the microphone automatically.

## Diagnostics and limits

Focus the voice-language control after a search to see the requested language
and native microphone state. Diagnostics includes fixed recognition-attempt and
voice-request counters. It never includes audio, transcriptions, search
queries, recording tickets, socket paths, authorization or service URLs. Reading
the voice control does not collect a native report during hidden-menu startup.

Counters show that an override was requested, not that the recognition service
accepted it or produced Hungarian text. Service-selected language can depend on
the YouTube client and endpoint. A protobuf-only or changed recognition request
may need further adaptation. Actual Hungarian recognition and microphone access
on the C3/C4 still require a TV test. Upstream's capture test was on a Nano85;
it does not establish C3/C4 support.

## Validation

- `npm --prefix webapp test`: recognizer language, endpoint/metadata isolation,
  fetch/XHR/Request handling, binary streaming, abort signals, persistence,
  duplicate installation, locked APIs and diagnostic privacy.
- `bash scripts/test-webos-microphone.sh`: real socket PCM, overflow, reopen,
  delayed tickets/replies, shared dispatcher interruption, bounded close/open,
  native helper ABI and lazy library symbol resolution.
- `bash scripts/test-native-host.sh <Cobalt 23.lts.6 checkout>`: full host suite
  with the overlay applied twice. Requires pkg-config, GLib/json-c headers.
- `python3 scripts/test-voice-search-browser.py`: actual production UI at 720p
  and 1080p; cursor choice and persistence, mocked Hungarian voice request with
  English browser locale, unchanged audio, and no hidden startup report.
- `python3 scripts/test-settings-browser.py`: all categories and dropdowns.
- ARMv7 softfp C++14 compilation of the native capture/library sources and
  inspection for eager GLib/LS2 references. Full Gold workflow checks remain
  separate from on-TV speech recognition validation.

The bundled AAC fallback and existing legacy/shared playback paths are retained.
