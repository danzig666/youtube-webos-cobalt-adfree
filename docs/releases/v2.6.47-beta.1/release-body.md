Replaces the one-card-at-a-time pointer reveal with continuous edge panning. Keep the Magic Remote pointer near either row edge to keep scrolling; move inward to stop at any pixel position. Speed ramps up and increases closer to the edge. Gaps between tiles remain part of the row.

Passing tiles are no longer explicitly focused during panning, avoiding native focus snaps. Active row geometry is reused instead of repeatedly scanning all cards. Animation uses a single clock and clamps long frame delays to small movement increments. The setting shows frame count and largest frame gap for on-TV diagnosis.

Validation: 424 web tests; production build; browser checks at 720p/1080p for ordinary and virtual rows, sustained movement in both directions, partial tiles, row-end and input guards, zero injected navigation keys, bounded scans, clock offsets/delayed frames and native transform updates; source CI; ARM Gold builds and final package verification. Smoothness on actual TVs is not yet confirmed. Scrolling is limited to currently laid-out row content.

Install the same package identity already on your TV to retain settings. Both package identities and the bundled AAC fallback remain available.
