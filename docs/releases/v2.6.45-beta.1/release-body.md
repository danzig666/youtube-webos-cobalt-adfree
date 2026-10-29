Fixes a pointer scrolling bug: after focusing a video card, moving within that card was ignored, so approaching the row edge never started navigation. The edge is now checked on movement within the focused card. Leaving the edge cancels pending navigation without repeatedly restarting it while moving inside the same edge zone.

Validation: 424 web tests; production build; browser checks at 720p and 1080p covering centre-to-edge movement on the same card, cancellation before dispatch, virtual-row navigation, row ends, stationary-pointer bounds and playback/menu guards; source CI; ARM Gold builds and final package verification. Actual YouTube navigation still needs confirmation on a TV.

Install the same package identity already on your TV to retain its settings. Both package identities and the bundled AAC fallback remain available.
