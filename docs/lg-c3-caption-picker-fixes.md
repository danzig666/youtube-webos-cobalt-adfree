# LG C3 caption and Magic Remote correction — 2.6.4

User report against 2.6.3: caption size changes immediately after appearing,
YouTube default has no black backing, custom text needs a black outline, and
repeated cursor clicks can open and immediately dismiss dropdowns.

## Captions

The app previously requested the player caption font API and independently
scaled caption DOM nodes. It also captured each replacement node's baseline
again. These paths could compete and magnify an API-generated size. A single
persistent stylesheet now controls custom sizes using one stable natural
baseline. Generic caption rules cover fresh cues before mutation delivery;
observation runs before paint. Inline styles are never rewritten, so returning
to default respects the latest YouTube size. Default has no app size/outline
rule. All rendered caption text gets a dark backing; custom sizes also get a
Cobalt-compatible eight-direction black outline. See
[caption integration](caption-dearrow-integration.md) for renderer limitations.

## Dropdown input

The outside-click handler previously classified follow-up pointer/mouse events
on the opening control as outside clicks. Mixed Enter/pointer activation could
open, dismiss and reopen the same list. The opener now consumes its trailing
pointer/mouse sequence while retaining the list. Keyboard-open release events
cannot select the initially focused option. A deliberate next pointer/mouse
press or keyboard action enables selection. New presses clear stale synthesized
click suppression, so repeated selection/reopening needs no one-second pause.
The document-level release guard still blocks clicks retargeted to switches
under a dismissed popup, and category/menu closure removes the list.

## Validation and limits

180 web regressions pass. Real settings UI browser checks at 720p and 1080p
cover mixed Enter/mouse opening, repeat opener clicks, rapid reopen/selection,
click-through isolation, backing/outline and each rendered frame across cue and
window replacement. Both application IDs use the same correction. Native media
code is unchanged. Physical LG C3 validation is unavailable here; no claim of
on-device confirmation or of resolving the separate disappearing-controls
report is made.
