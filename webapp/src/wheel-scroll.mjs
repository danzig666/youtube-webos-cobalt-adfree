// Starboard delivers line deltas; browsers may deliver pixels or pages.
export function wheelScrollDelta(event, viewportHeight) {
  const raw = Number(event.deltaY);
  if (!Number.isFinite(raw)) return 0;
  const scale =
    event.deltaMode === 1
      ? 48
      : event.deltaMode === 2
        ? viewportHeight * 0.85
        : 1;
  return Math.max(
    -viewportHeight * 0.9,
    Math.min(viewportHeight * 0.9, raw * scale)
  );
}
