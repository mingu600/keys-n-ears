// Picks the next chord, favouring chords you are slow on or haven't seen.
// Stats are a plain object: { [chordId]: { n, ema } } where ema is a moving
// average of response time in ms. Pure functions; tested in tests/scheduler.test.js.

export const PENALTY_MS = 10000; // recorded time for skips and reveals
const EMA_ALPHA = 0.35;
const TARGET_MS = 2000; // "fast enough" reference time
const UNSEEN_WEIGHT = 3;

export function record(stats, chordId, ms) {
  const prev = stats[chordId];
  const next = prev
    ? { n: prev.n + 1, ema: prev.ema + EMA_ALPHA * (ms - prev.ema) }
    : { n: 1, ema: ms };
  return { ...stats, [chordId]: next };
}

export function weightFor(stats, chordId) {
  const s = stats[chordId];
  if (!s) return UNSEEN_WEIGHT;
  const ratio = s.ema / TARGET_MS;
  return Math.min(8, 0.25 + ratio * ratio);
}

// rand is injectable so tests are deterministic.
export function pickNext(pool, stats, previous, rand = Math.random) {
  const candidates = pool.filter((c) => !isTooSimilar(c, previous));
  const list = candidates.length > 0 ? candidates : pool;
  const weights = list.map((c) => weightFor(stats, c.id));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r < 0) return list[i];
  }
  return list[list.length - 1];
}

// Avoid back-to-back chords with the same root and quality (e.g. C then C/E),
// so a still-held previous chord can't count as the answer.
function isTooSimilar(a, b) {
  return !!b && a.root === b.root && a.quality === b.quality;
}

export function slowest(stats, count = 5) {
  return Object.entries(stats)
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => b.ema - a.ema)
    .slice(0, count);
}
