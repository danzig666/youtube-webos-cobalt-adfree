# LG C3 UI fixes — 2.6.1

The user reported eleven issues on an LG C3 OLED. This update addresses each:

| Report | Change |
| --- | --- |
| Empty blue pill | Removed startup hint; expired notifications and their empty containers are removed |
| QR toggle on every page | Toggle inserted into the General pane only |
| Custom comments unnecessary | Removed panel, client, parsing and integration; use YouTube comments |
| Off-centre X | Two CSS strokes centred inside the close control |
| Adblock does not stay enabled | Default true; explicit native durable save and read-back; valid off choice preserved |
| Caption size ineffective/no smaller options | Smaller sizes, loaded-option/read-back checks, and rendered-text styling without player API |
| BACK also closes video | Window capture consumes keydown/repeats/keypress/keyup, including after menu closure |
| Remote key cycling | Ten individual key rows, each with an action combobox |
| Diagnostics pagination | Whole bounded report auto-loaded into a scrollable read-only textbox |
| Unusable TV copy | Removed clipboard-copy action |
| Other cycling choices | All shared choices open an explicit option list supporting pointer, arrows/OK, wheel and BACK cancel |

## Persistence

`h5vcc.system.getYtafUiPreferences()` / `setYtafUiPreferences()` access only a
bounded 64 KiB app preference file in Starboard's storage directory. The filename
includes the package ID, keeping original-ID and separate-ID installs independent.
Writes use a private temporary file, fsync, atomic same-directory rename and exact
read-back. Only known preference keys are serialized, with no account storage.
Older browser preferences migrate on the next setting change; older runtimes
retain explicit localStorage getItem/setItem with save verification. Failed writes
leave live changes usable and show the existing session-only warning.

## Validation and limits

120 web tests and native host regressions pass. Browser integration checks at
1280×720 and 1920×1080 exercise actual UI code: category visibility, QR placement,
all numeric keys, explicit option selection/cancellation, diagnostics arrows and
wheel, BACK isolation, persisted toggles across reload, notification expiry and
close-icon positioning. Caption tests cover real text-style changes/restoration,
late font-module readiness, silently ignored font changes, and default restoration
without undoing manual changes. Cobalt-shaped CSS tests cover missing priority
getters and ignored setProperty priorities; cssText preserves important styling.

Both ARM Gold runtimes and IPKs are built and checked for exact production assets,
source SHA, manifest/package identity and dependencies. No LG TV is connected
here. The fixes are based on the C3 report, but actual Cobalt rendering, caption
selector compatibility, native persistence and physical remote input need C3
retesting. Unknown caption renderers remain unsupported instead of claiming success.
