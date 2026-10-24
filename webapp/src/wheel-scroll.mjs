// Starboard delivers line deltas; browsers may deliver pixels or pages.
export function wheelScrollDelta(event, viewportHeight, maximumStep = viewportHeight * 0.9) {
  const raw = Number(event.deltaY);
  if (!Number.isFinite(raw)) return 0;
  const scale =
    event.deltaMode === 1
      ? 48
      : event.deltaMode === 2
        ? viewportHeight * 0.85
        : 1;
  return Math.max(
    -maximumStep,
    Math.min(maximumStep, raw * scale)
  );
}
