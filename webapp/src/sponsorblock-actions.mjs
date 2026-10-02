export const sponsorBlockActionOptions = [
  { value: 'auto', label: 'Auto skip' },
  { value: 'ask', label: 'Ask first' },
  { value: 'markers', label: 'Markers only' },
  { value: 'off', label: 'Off' }
];
export function sponsorBlockAction(category, legacyKey, read) {
  const actions = read('sponsorBlockActions');
  const value =
    actions && typeof actions === 'object' && !Array.isArray(actions)
      ? actions[category]
      : null;
  if (sponsorBlockActionOptions.some((option) => option.value === value))
    return value;
  return read(legacyKey) ? 'auto' : 'off';
}
export function segmentKey(segment) {
  return `${segment.category}:${segment.segment[0]}:${segment.segment[1]}`;
}
// An automatic skip must not jump over a segment that requires a decision.
export function automaticSkipTarget(
  segments,
  time,
  proposedEnd,
  actionFor,
  approved
) {
  let end = proposedEnd;
  for (const segment of segments) {
    if (actionFor(segment.category) !== 'ask' || approved[segmentKey(segment)])
      continue;
    const [start, stop] = segment.segment;
    if (stop <= time + 0.15 || start >= end) continue;
    if (start <= time + 0.05) return null;
    end = Math.min(end, start);
  }
  return end > time ? end : null;
}
