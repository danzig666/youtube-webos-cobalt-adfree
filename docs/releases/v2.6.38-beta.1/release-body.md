Adds Magic Remote microphone capture and a Hungarian voice-search preference that can be used while the TV remains in English. **This is a TV test build: actual Hungarian recognition on C3/C4 still needs confirmation.** The Homebrew catalog remains on compatibility release 2.6.37 during testing.

1. Install the same app-ID variant you already use and fully close/reopen the app.
2. Open **GREEN → General → Voice search language → Hungarian / Magyar**.
3. Open **YouTube Search** and select its **microphone icon** using OK or the Magic Remote cursor. Wake the remote first, then speak Hungarian.
4. Check whether YouTube returns the Hungarian words correctly. Afterward, focus the voice-language setting to see the last requested language and microphone status. Diagnostics has the fixed attempt/request counters too.

The remote's physical microphone button may open LG's system assistant; that assistant retains its own TV speech settings. The app setting does not translate the GREEN menu or change the TV's language.

- Adapts upstream microphone capture (#116/#118), using raw mono 16-bit/16 kHz audio from LG voiceconductor and the existing app-named LS2 connection.
- Supplies `hu-HU` to speech recognizers and supported YouTube/Google voice request language fields/headers. English and YouTube default remain selectable. No extra API key or speech provider is introduced.
- Leaves ordinary playback/feed requests unchanged and preserves binary audio, credentials and abort signals. It does not save audio, transcripts, recording tickets or service URLs in diagnostics.
- Loads voice libraries only when needed, with guarded symbols and bounded shared-dispatch waits. Backgrounding/stopping the app closes capture; returning does not restart recording automatically. Each session is capped at 30 seconds.
- Retains bundled AAC fallback, the firmware AAC path, legacy/shared playback, existing startup improvements and all saved preferences. **This is not the firmware-only 2.6.36 experiment.**

Both IPKs are attached: `com.cobalt.youtube.adfree_2.6.38_arm.ipk` installs alongside official YouTube; `youtube.leanback.v4_2.6.38_arm.ipk` replaces it. SHA-256 checksums and individual build records accompany them.

Validation: 427 web tests, complete native host suite including real socket PCM/overflow/reopen, late service tickets/replies, a stopped shared dispatcher, background recording guards and lazy API/ABI handling; ten packaging tests; production UI/cursor/persistence and mocked Hungarian requests at 720p/1080p with an unchanged English locale; full ARM Gold builds and inspection of both final IPKs for native identity/source, voice/preload code, AAC fallback, runtime libraries and licenses.

Request counters establish that a language override was requested; they do not prove the service accepted it or recognized Hungarian. Upstream capture was tested on a Nano85. C3/C4 microphone permissions/helper ABI and actual service recognition must be checked on a TV. No microphone recording or Hungarian service response was captured in host testing.

Source: `bdf6409132f1a21ab6bd4045cb9a093dd7f05bf5` · [CI](https://github.com/danzig666/youtube-webos-cobalt-adfree/actions/runs/40222492848) · [ARM build](https://github.com/danzig666/youtube-webos-cobalt-adfree/actions/runs/40222495009)
