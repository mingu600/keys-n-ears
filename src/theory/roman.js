// Roman-numeral analysis and loop families. Pure functions.
import { parseNote } from './chords.js';

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
// Off-scale intervals -> [degree index, accidental].
const OFF_MAJOR = { 1: [1, '♭'], 3: [2, '♭'], 6: [4, '♭'], 8: [5, '♭'], 10: [6, '♭'] };
const OFF_MINOR = { 1: [1, '♭'], 4: [2, '♯'], 6: [4, '♭'], 9: [5, '♯'], 11: [6, '♯'] };

const MAJOR_TYPES = new Set(['maj', '7', '9', '13', '7b9', '7#9']);
const SEVENTH_TYPES = new Set(['7', '9', '13', '7b9', '7#9']);
const MAJOR_CLASS = new Set(['maj', 'maj7', '7', '6', 'add9', '9', 'maj9', '13', '7b9', '7#9']);
const MINOR_CLASS = new Set(['m', 'm7', 'm6', 'madd9', 'm9', 'm11']);
const DIM_CLASS = new Set(['dim', 'm7b5', 'dim7']);

// Suffix shown after the numeral (case, °, ø, + already carry the rest).
const SUFFIX = {
  maj: '', m: '', maj7: 'maj7', m7: '7', 7: '7', sus2: 'sus2', sus4: 'sus4', add9: 'add9',
  dim: '', m7b5: '7', aug: '', dim7: '7', 6: '6', m6: '6', '7sus4': '7sus4', madd9: 'add9',
  9: '9', m9: '9', maj9: 'maj9', m11: '11', 13: '13', '7b9': '7♭9', '7#9': '7♯9',
};

export function triadClass(quality) {
  if (MAJOR_CLASS.has(quality)) return 'M';
  if (MINOR_CLASS.has(quality)) return 'm';
  if (DIM_CLASS.has(quality)) return 'd';
  return 'o';
}

const mod12 = (n) => ((n % 12) + 12) % 12;
const scaleOf = (mode) => (mode === 'minor' ? MINOR_SCALE : MAJOR_SCALE);

// Triad class of the diatonic triad built on scale degree index `i`.
function diatonicClass(scale, i) {
  const at = (k) => scale[k % 7] + (k >= 7 ? 12 : 0);
  const third = at(i + 2) - at(i), fifth = at(i + 4) - at(i);
  if (third === 4 && fifth === 7) return 'M';
  if (third === 3 && fifth === 7) return 'm';
  if (third === 3 && fifth === 6) return 'd';
  return 'o';
}

// Bare numeral (case + ° / +) for an interval above the tonic and a triad class.
function bareNumeral(rel, cls, mode, quality) {
  const scale = scaleOf(mode);
  let idx = scale.indexOf(rel), acc = '';
  if (idx < 0) [idx, acc] = (mode === 'minor' ? OFF_MINOR : OFF_MAJOR)[rel];
  let n = NUMERALS[idx];
  if (cls === 'm' || cls === 'd') n = n.toLowerCase();
  if (cls === 'd') n += quality === 'm7b5' ? 'ø' : '°';
  if (quality === 'aug') n += '+';
  return acc + n;
}

export function toRoman(chord, key, { suffix = true } = {}) {
  const { pc: tonicPc } = parseNote(key.tonic);
  const scale = scaleOf(key.mode);
  const rel = mod12(parseNote(chord.root).pc - tonicPc);
  const q = chord.quality;

  if (MAJOR_TYPES.has(q)) {
    const degree = scale.indexOf(rel);
    const diatonic = degree >= 0 && diatonicClass(scale, degree) === 'M';
    if (!diatonic) {
      const targetIdx = scale.indexOf(mod12(rel - 7));
      if (targetIdx >= 0 && diatonicClass(scale, targetIdx) !== 'd') {
        const targetCls = diatonicClass(scale, targetIdx);
        const target = NUMERALS[targetIdx];
        const targetNum = targetCls === 'm' ? target.toLowerCase() : target;
        const v = 'V' + (suffix && SEVENTH_TYPES.has(q) ? '7' : '');
        return targetIdx === 0 ? v : `${v}/${targetNum}`;
      }
    }
  }
  const base = bareNumeral(rel, triadClass(q), key.mode, q);
  return suffix ? base + SUFFIX[q] : base;
}

export function loopOf(chords) {
  const tok = (c) => `${parseNote(c.root).pc}${triadClass(c.quality)}`;
  const kept = [];
  for (const c of chords) {
    if (kept.length && tok(kept[kept.length - 1]) === tok(c)) continue;
    kept.push(c);
  }
  const t = kept.map(tok), n = t.length;
  for (let period = 1; period < n; period++) {
    if (n % period === 0 && t.every((x, i) => x === t[i % period])) return kept.slice(0, period);
  }
  return kept;
}

export function loopFamily(chords, key) {
  if (chords.length < 2 || chords.length > 8) return null;
  const { pc } = parseNote(key.tonic);
  const base = key.mode === 'minor' ? mod12(pc + 3) : pc;
  const tokens = chords.map(c => ({
    rel: mod12(parseNote(c.root).pc - base), cls: triadClass(c.quality), q: c.quality,
  }));
  const str = (t) => `${t.rel}${t.cls}`;
  let best = null, bestKey = null;
  for (let r = 0; r < tokens.length; r++) {
    const rot = tokens.slice(r).concat(tokens.slice(0, r));
    const k = rot.map(str).join('-');
    if (bestKey === null || k < bestKey) { best = rot; bestKey = k; }
  }
  const label = best.map(t => bareNumeral(t.rel, t.cls, 'major', t.cls === 'o' ? 'sus' : t.q)).join('-');
  return { id: bestKey, label };
}
