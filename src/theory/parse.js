// Chord symbol parser. Pure: no DOM, no browser globals.
import { QUALITIES, makeChord, withBass, parseNote } from './chords.js';

// Suffix (accidentals normalised to # / b) -> quality key.
const SUFFIXES = {
  '': 'maj', m: 'm', min: 'm', '-': 'm',
  maj7: 'maj7', M7: 'maj7', 'Δ7': 'maj7', 'Δ': 'maj7',
  m7: 'm7', min7: 'm7', '-7': 'm7',
  7: '7',
  dim: 'dim', '°': 'dim',
  dim7: 'dim7', '°7': 'dim7',
  m7b5: 'm7b5', 'ø': 'm7b5', 'ø7': 'm7b5',
  aug: 'aug', '+': 'aug',
  sus2: 'sus2', sus4: 'sus4', sus: 'sus4',
  '7sus4': '7sus4', '7sus': '7sus4',
  add9: 'add9', add2: 'add9', madd9: 'madd9',
  6: '6', m6: 'm6',
  9: '9', m9: 'm9', maj9: 'maj9', M9: 'maj9',
  m11: 'm11', 13: '13',
  '7b9': '7b9', '7#9': '7#9',
};

const NOTE_RE = /^[A-G][#♯b♭]?$/;
const SYMBOL_RE = /^([A-G][#♯b♭]?)([^/]*)(?:\/(.*))?$/;

export function parseChordSymbol(str) {
  try {
    if (typeof str !== 'string') return null;
    const m = SYMBOL_RE.exec(str.trim());
    if (!m) return null;
    const [, root, rawSuffix, bass] = m;
    const suffix = rawSuffix.replace(/♯/g, '#').replace(/♭/g, 'b');
    if (!Object.hasOwn(SUFFIXES, suffix)) return null;
    const quality = SUFFIXES[suffix];
    if (!QUALITIES[quality]) return null;
    const rootName = parseNote(root).name;
    if (bass === undefined) return makeChord(rootName, quality, 0);
    if (!NOTE_RE.test(bass)) return null;
    const bassPc = parseNote(bass).pc;
    const base = makeChord(rootName, quality, 0);
    const idx = base.tones.findIndex((t) => t.pc === bassPc);
    if (idx >= 0) return makeChord(rootName, quality, idx);
    return withBass(base, bass);
  } catch {
    return null;
  }
}
