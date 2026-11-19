// Voice-leading distance helpers. Pure functions.

// Largest nearest-neighbour move among the upper voices (bass note dropped).
export function upperVoiceMove(prevNotes, nextNotes) {
  const prev = [...prevNotes].sort((a, b) => a - b).slice(1);
  const next = [...nextNotes].sort((a, b) => a - b).slice(1);
  if (prev.length < 1 || next.length < 1) return 0;
  let max = 0;
  for (const n of next) {
    const d = Math.min(...prev.map(q => Math.abs(n - q)));
    if (d > max) max = d;
  }
  return max;
}
