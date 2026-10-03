// Only the bounded snapshot is parsed; recent logs and URLs never enter state.
export function nativePlaybackState(win) {
  try {
    const report = win.h5vcc?.system?.getYtafMediaReport?.();
    if (typeof report !== 'string') return null;
    const snapshot = report.slice(0, report.indexOf('Recent playback events') < 0 ? 2048 : report.indexOf('Recent playback events'));
    const identity = snapshot.match(/Session: (\d+) generation: (\d+)/);
    const position = snapshot.match(/Native presentation: ([\d.e+-]+) seconds/);
    const frames = snapshot.match(/Presented frames: (\d+)/);
    const rates = snapshot.match(/Playback rate: requested ([\d.e+-]+)x applied ([\d.e+-]+)x/);
    if (!identity || !position || !frames || !rates || /Current player: [^\n]*\(inactive\)/.test(snapshot)) return null;
    const result = {session:identity[1],generation:identity[2],shared:/Current player: Shared Starfish/.test(snapshot),
      position:Number(position[1]),frames:Number(frames[1]),requested:Number(rates[1]),applied:Number(rates[2])};
    return [result.position,result.frames,result.requested,result.applied].every(Number.isFinite) ? result : null;
  } catch (_) { return null; }
}
