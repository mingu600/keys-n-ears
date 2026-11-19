// Tap-sync helpers. Pure functions.
export function applyTaps(taps, chordCount) {
  const chordTimes = taps.slice(0, chordCount);
  let warning = null;
  if (taps.length < chordCount) warning = `Only ${taps.length} of ${chordCount} chords tapped.`;
  else if (taps.length > chordCount) warning = `${taps.length - chordCount} extra taps ignored.`;
  return { chordTimes, warning };
}

export function shiftOccurrence(prev, newStart) {
  const d = newStart - prev.start;
  return { start: newStart, chordTimes: prev.chordTimes.map(t => t + d) };
}
