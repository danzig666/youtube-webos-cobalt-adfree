Pointer row scrolling now uses pixel offsets with a damped spring instead of sending YouTube arrow-key navigation. Hovering a partly visible card moves the row only far enough to reveal it, leaving part of the neighbouring tile visible. The same movement works to the left and right, following PlxNative's nearest-reveal behavior.

Virtual rows retain YouTube's existing transform as a base. Native updates stop our animation, and remote keys restore native styles before handing control back. Hovering never activates a video; a stationary pointer does not keep advancing the row. Playback/menu guards and the saved setting remain in place.

Validation: 424 web tests; production build; browser checks at 720p and 1080p covering intermediate smooth positions, partial tiles, leftward return, zero injected arrow events, native-transform preservation, key handoff and updates during motion; source CI; ARM Gold builds and final package verification. Live YouTube behavior still needs TV confirmation.

Install the same package identity already on your TV to retain its settings. Both package identities and the bundled AAC fallback remain available.
