// Picks the next item, favouring ones you are weak on or haven't seen.
// Stats are a plain object: { [key]: { n, ema, lastMs, lastAt } } where ema is a
// moving average of a 0..1 "difficulty" score (0 = easy, 1 = hard).
// Keys are namespaced: chord:<id>, prog:<familyId>, hook:<songId>/<i>, rhythm:<id>, style:<id>.
// Pure functions; tested in tests/core/scheduler.test.js.

export const TARGETS = { chord: 2000, progressionChord: 2000, hookNote: 1000 };
export const SKIP_SCORE = 1;
const HINT_FLOOR = 0.7;
const EMA_ALPHA = 0.35;
const UNSEEN_WEIGHT = 3;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export const scoreFromTime = (ms, targetMs) => clamp(ms / (3 * targetMs), 0, 1);
export const scoreFromAccuracy = (acc) => clamp(1 - acc, 0, 1);
export const withHint = (score) => Math.max(score, HINT_FLOOR);

export function record(stats, key, score, rawMs, now = Date.now()) {
  const prev = stats[key];
  const ema = prev ? prev.ema + EMA_ALPHA * (score - prev.ema) : score;
  return { ...stats, [key]: { n: (prev?.n ?? 0) + 1, ema, lastMs: rawMs, lastAt: now } };
}

export function weightFor(stats, key) {
  const s = stats[key];
  if (!s) return UNSEEN_WEIGHT;
  return 0.25 + 7.75 * s.ema * s.ema;
}

// rand is injectable so tests are deterministic.
export function pickNext(items, stats, previous, { keyOf = (i) => i.id, tooSimilar = () => false } = {}, rand = Math.random) {
  const candidates = items.filter((i) => !tooSimilar(i, previous));
  const list = candidates.length > 0 ? candidates : items;
  const weights = list.map((i) => weightFor(stats, keyOf(i)));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r < 0) return list[i];
  }
  return list[list.length - 1];
}

export function weakest(stats, { prefix = '', count = 5 } = {}) {
  return Object.entries(stats)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, s]) => ({ key, n: s.n, ema: s.ema, lastMs: s.lastMs }))
    .sort((a, b) => b.ema - a.ema)
    .slice(0, count);
}
