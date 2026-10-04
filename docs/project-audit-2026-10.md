# Project audit — October 2026

Audit base: `0f836c31c0edf6e63ac58011990655b7e1837429` on `playback/host-tested-v2`.
Release: `v2.6.23-beta.1`. Cobalt 23.lts.6, Starboard 13.

## Confirmed fixes

| Area | Reproduced problem | Correction |
| --- | --- | --- |
| Playback speed | Brief buffering counted as a slow native rate; time spent backgrounded counted toward stall recovery | Measure rate only during ready playback and reset measurements across visibility/resume transitions |
| Settings | A missing key-release event could leave BACK or a dropdown's OK/BACK latched | Recover after 500 ms without events; continuing repeats and trailing releases remain consumed |
| Settings | Cursor clicks in the dimmed area could activate underlying YouTube controls | Keep pointer events inside the open settings modal |
| Settings | Diagnostics Up trapped focus in the report; a category heading could remain clipped after dropdown navigation | Return to the preceding action at the report's start; clear browser scrolling alongside the menu's own offset |
| Auto-login | Delayed synthetic keys could fire after leaving the account selector | Require the current attempt, current selector and enabled preference before each key |
| Return YouTube Dislike | Old requests and queued callbacks could restore disabled or previous-video overlays | Abort and invalidate requests/callbacks; remove injected counts on disable |
| Stop after video | The action could remain attached to a replaced media element | Follow the current element for the same video and reject stale EOS |
| Native HDR | Huge finite metadata could overflow integer conversion or send empty SEI to Starfish | Validate documented ranges in both backends and preserve independently valid fields |
| Legacy native EOS | Concurrent firmware and decoder completion could deliver EOS twice | Atomic completion ownership with callback/failure and concurrent-callback regressions |
| Packaging | Artifact packaging could combine a runtime with web assets from another commit or relabel its version | Check workflow/source/checksum provenance, use its exact source and archived assets, require its compiled version |
| IPK tooling | Negative ar member lengths could loop forever | Reject negative lengths in both archive readers |
| Logging | Relaunch payloads, preference values and raw errors could expose private information | Fixed error categories and bounded reporting; omit raw launch values and browsing identifiers |

## GUI consistency review

Browser checks cover General, Playback, Captions & titles, Remote, SponsorBlock and Diagnostics at 1280×720 and 1920×1080. Inter typography, focus colors, row styling, close-button alignment, panel bounds and dropdown bounds were reviewed. Category focus selects immediately; the header now correctly describes Right as “Options”. Diagnostics and dropdown navigation share the expected Back and wheel behavior.

These are browser checks, not C3 firmware validation. The existing on-TV photos confirm LG hardware queries, but do not prove every codec/profile combination or resolve the intermittent controls/SponsorBlock issue.

## Validation

- All 359 web unit/regression tests and production webpack build.
- Complete SDK-free native host suite, including real decoder, shared rate, initial/repeated seek, HDR boundary and concurrent EOS fixtures.
- Production-bundle playback simulation: 20 simulated minutes at each resolution, three sponsor skips, repeated hidden-focus recovery and GREEN/BACK isolation.
- Browser traversal of all six categories and their dropdowns; reader navigation, modal pointer isolation and category scroll reset.
- GitHub CI passed for compiled source `691153d2c456e0a8e2f2627508412f033fff639a`. The published original-ID and separate-ID IPKs were downloaded again and their SHA-256 checksums verified.
- Production npm dependency audit reported no advisories.
- Package identity tests, IPK parser tests, compatibility-generator tests and runtime artifact provenance/checksum tests.
- Both ARM Gold runtimes and original-ID/separate-ID IPKs are built and verified for the release. Build records record the exact compiled source SHA.

Commands: `npm --prefix webapp test`; `npm --prefix webapp run build -- --env production --optimization-minimize`; `bash scripts/test-native-host.sh /path/to/disposable-cobalt-23.lts.6`; `python3 scripts/test-playback-recovery-browser.py`; `python3 scripts/test-settings-browser.py`; `python3 scripts/test-starterless-package.py`; `python3 scripts/test-ipk-tools.py`; `python3 scripts/test-device-compatibility.py`; `python3 scripts/test-cobalt-artifact.py`.

The artifact packaging workflow now accepts an empty version or the exact runtime version only. Build a new runtime to change the version. Its metadata retains the existing fork `cobalt_source_sha` field and adds `upstream_cobalt_sha` to distinguish the actual Cobalt revision.

## Recommended next improvements

1. **Align the default branch and release source.** Ordinary CI now runs on the release-development branch too. Scheduled workflows still run from the default branch; main should receive the reviewed release code, or the project should deliberately change its default branch. Otherwise nightly builds do not validate the current release implementation.
2. **Automate browser interaction checks in CI.** Unit tests catch state regressions, but clipped headings and modal click-through needed real browser layout. Run the production bundle at both TV viewport sizes with keyboard, cursor and wheel scenarios.
3. **Make channel exceptions a directly selectable list.** The saved SponsorBlock exception manager still cycles through channels. Reuse the named-option pattern and give each saved channel an explicit remove action.
4. **Reduce background work.** Suspend caption discovery when default styling needs no custom rendering; add an independent DeArrow request watchdog, as used by other integrations. Measure before changing timer cadence.
5. **Unify playback focus decisions.** Seek shortcuts and ordinary control recovery should share one tested interpretation of hidden versus visible YouTube controls. Validate the first Left/Right after hidden focus without hijacking visible control navigation.
6. **Run sustained C3 playback tests.** Prioritize buffering, network starvation, live/DVR, speed changes, background/resume and natural EOS in one process. Investigate native stall recovery and legacy callback lifetime using traces before altering recovery behavior. Host simulations cannot reproduce all Cobalt event-delivery or firmware behavior.
7. **Finish localization and add an interface text-size preference.** Older controls have translations while newer sections and help remain English. Apply the same language coverage and test larger text without clipping rows or popups.

8. **Review upstream ARM build hardening.** The linker warns that BoringSSL’s `chacha-armv4.o` lacks a GNU-stack note, and `readelf -l cobalt` confirms an executable GNU_STACK segment. Audit the upstream assembly requirements, then correct stack annotations/link policy and validate on hardware before enforcing a non-executable stack. This is a recorded hardening gap, not a reproduced playback failure.

Legacy playback, shared-A/V rollback and explicit capability overrides remain available. This audit does not enable compressed AAC or infer HDR support from a decoder ceiling.
