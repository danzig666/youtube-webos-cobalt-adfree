# Hungarian in-app voice search

In **YouTube's own Settings → Language**, choose **Magyar**. Then open YouTube
Search and select its microphone with OK or the Magic Remote cursor. The TV can
remain English; YouTube's menus and voice search will use Hungarian.
[YouTube language settings](https://support.google.com/youtube/answer/87604?hl=en).

The separate GREEN-menu voice-language selector and its request/recognizer
overrides have been removed. Existing saved override values are ignored and
discarded on the next settings save. YouTube controls recognition language.

## Confirmed on the C3

The tester confirmed audio capture and transcription with the original-ID
`youtube.leanback.v4` 2.6.39 package, then confirmed Hungarian recognition after
setting YouTube's language to Magyar. The separate-ID
`com.cobalt.youtube.adfree` package returned LG recording error 300 with zero
audio bytes on this TV. This suggests an app-identity restriction; it does not
define the general meaning of error 300. C4 microphone support is unverified.

The physical microphone button can still launch LG's system assistant, which
uses LG's own language settings. The EN label on YouTube's microphone screen
was not an operable language picker on the tested C3.

## Microphone implementation

The native microphone is adapted from RF1705 upstream commit
`34823b47e43ee11b907002eb82ff76bbe4040031`, including
[#116](https://github.com/RF1705/youtube-webos-cobalt-adfree/pull/116) and
[#118](https://github.com/RF1705/youtube-webos-cobalt-adfree/pull/118).
It borrows the app-named libhelpers LS2 connection and requests voiceconductor's
recordVoice PCM socket. This supplies mono 16-bit 16 kHz audio to Cobalt's
MediaRecorder path. YouTube/Google performs recognition.

Voice libraries load on demand. Buffers are bounded and cleared on close;
recording sessions last at most 30 seconds. Backgrounding or stopping the app
closes the microphone. Returning to the app permits a new capture without
reopening it automatically. Missing helper support or service permissions
produces a microphone error. Native capture and its cleanup are unchanged by
removing the language override.

The short Diagnostics summary shows native microphone state, a fixed failure
operation/numeric code, and delivered-byte/non-silent counters. It includes no
recordings, transcripts, search queries, recording tickets, socket paths or
authentication data. Hidden settings do not collect native reports at startup.

## Validation

- `npm --prefix webapp test`
- `npm --prefix webapp run build -- --env production`
- `python3 scripts/test-settings-browser.py`
- `bash scripts/test-webos-microphone.sh` for native capture changes
- `bash scripts/test-native-host.sh <Cobalt 23.lts.6 checkout>` for native changes
