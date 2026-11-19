// Chord spelling, chord pool generation, and matching held notes to a chord.
// Pure functions only: no DOM, no audio. Tested in tests/chords.test.js.

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

// Each tone: [semitones above root, letter steps above root].
// Letter steps give correct spelling (e.g. Eb minor third is Gb, not F#).
export const QUALITIES = {
  maj:  { symbol: '',     family: 'triads', tones: [[0, 0], [4, 2], [7, 4]] },
  m:    { symbol: 'm',    family: 'triads', tones: [[0, 0], [3, 2], [7, 4]] },
  maj7: { symbol: 'maj7', family: 'sevenths', tones: [[0, 0], [4, 2], [7, 4], [11, 6]] },
  m7:   { symbol: 'm7',   family: 'sevenths', tones: [[0, 0], [3, 2], [7, 4], [10, 6]] },
  7:    { symbol: '7',    family: 'sevenths', tones: [[0, 0], [4, 2], [7, 4], [10, 6]] },
  sus2: { symbol: 'sus2', family: 'color', tones: [[0, 0], [2, 1], [7, 4]] },
  sus4: { symbol: 'sus4', family: 'color', tones: [[0, 0], [5, 3], [7, 4]] },
  add9: { symbol: 'add9', family: 'color', tones: [[0, 0], [4, 2], [7, 4], [14, 1]] },
  dim:  { symbol: 'dim',  family: 'diminished', tones: [[0, 0], [3, 2], [6, 4]] },
  m7b5: { symbol: 'm7♭5', family: 'diminished', tones: [[0, 0], [3, 2], [6, 4], [10, 6]] },
  aug:  { symbol: 'aug',  family: 'diminished', tones: [[0, 0], [4, 2], [8, 4]] },
  dim7: { symbol: 'dim7', family: 'diminished', tones: [[0, 0], [3, 2], [6, 4], [9, 6]] },
  6:    { symbol: '6',    family: 'color', tones: [[0, 0], [4, 2], [7, 4], [9, 5]] },
  m6:   { symbol: 'm6',   family: 'color', tones: [[0, 0], [3, 2], [7, 4], [9, 5]] },
  '7sus4': { symbol: '7sus4', family: 'color', tones: [[0, 0], [5, 3], [7, 4], [10, 6]] },
  madd9: { symbol: 'madd9', family: 'color', tones: [[0, 0], [3, 2], [7, 4], [14, 1]] },
  // Extended chords: `essential` lists the semitones that must be held
  // (shell/rootless voicings are fine); strict mode requires every tone.
  9:    { symbol: '9',    family: 'extended', tones: [[0, 0], [4, 2], [7, 4], [10, 6], [14, 1]], essential: [4, 10, 14] },
  m9:   { symbol: 'm9',   family: 'extended', tones: [[0, 0], [3, 2], [7, 4], [10, 6], [14, 1]], essential: [3, 10, 14] },
  maj9: { symbol: 'maj9', family: 'extended', tones: [[0, 0], [4, 2], [7, 4], [11, 6], [14, 1]], essential: [4, 11, 14] },
  m11:  { symbol: 'm11',  family: 'extended', tones: [[0, 0], [3, 2], [7, 4], [10, 6], [14, 1], [17, 3]], essential: [3, 10, 17] },
  13:   { symbol: '13',   family: 'extended', tones: [[0, 0], [4, 2], [7, 4], [10, 6], [14, 1], [21, 5]], essential: [4, 10, 21] },
  '7b9': { symbol: '7♭9', family: 'extended', tones: [[0, 0], [4, 2], [7, 4], [10, 6], [13, 1]], essential: [4, 10, 13] },
  '7#9': { symbol: '7♯9', family: 'extended', tones: [[0, 0], [4, 2], [7, 4], [10, 6], [15, 1]], essential: [4, 10, 15] },
};

export const FAMILIES = {
  triads: 'Triads (C, Cm)',
  sevenths: '7ths (Cmaj7, Cm7, C7)',
  color: 'Color (sus2, sus4, add9)',
  diminished: 'Diminished (dim, m7♭5, aug)',
  extended: 'Extended (9, m9, maj9, 11, 13, alt)',
};

// Roots as pop charts usually spell them.
const MAJOR_ROOTS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const MINOR_ROOTS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
const MINOR_LIKE = new Set(['m', 'm7', 'dim', 'm7b5', 'dim7', 'm6', 'madd9', 'm9', 'm11']);

// Qualities that get slash-chord (inversion) variants.
const INVERTIBLE = new Set(['maj', 'm', 'maj7', 'm7', '7']);

export function parseNote(name) {
  const letter = LETTERS.indexOf(name[0]);
  if (letter < 0) throw new Error(`Bad note name: ${name}`);
  let acc = 0;
  for (const ch of name.slice(1)) {
    if (ch === '♯' || ch === '#') acc += 1;
    else if (ch === '♭' || ch === 'b') acc -= 1;
    else throw new Error(`Bad note name: ${name}`);
  }
  return { letter, pc: (LETTER_PC[letter] + acc + 12) % 12, name: LETTERS[letter] + accidentalString(acc) };
}

function accidentalString(acc) {
  if (acc > 0) return '♯'.repeat(acc);
  if (acc < 0) return '♭'.repeat(-acc);
  return '';
}

// Spell the note `semis` semitones and `steps` letters above `rootName`.
export function spellInterval(rootName, semis, steps) {
  const root = parseNote(rootName);
  const letter = (root.letter + steps) % 7;
  const targetPc = (root.pc + semis) % 12;
  const acc = ((targetPc - LETTER_PC[letter] + 18) % 12) - 6;
  return LETTERS[letter] + accidentalString(acc);
}

// Build one chord object.
// inversion: 0 = root position (no slash), 1 = 3rd in bass, 2 = 5th, 3 = 7th.
export function makeChord(rootName, quality, inversion = 0) {
  const q = QUALITIES[quality];
  if (!q) throw new Error(`Unknown quality: ${quality}`);
  if (inversion >= q.tones.length) throw new Error(`Inversion ${inversion} too high for ${quality}`);
  const rootPc = parseNote(rootName).pc;
  const tones = q.tones.map(([semis, steps]) => ({
    name: spellInterval(rootName, semis, steps),
    pc: (rootPc + semis) % 12,
    semis,
  }));
  const base = rootName + q.symbol;
  const bassTone = inversion > 0 ? tones[inversion] : null;
  return {
    id: bassTone ? `${base}/${bassTone.name}` : base,
    symbol: bassTone ? `${base}/${bassTone.name}` : base,
    root: rootName,
    quality,
    inversion,
    tones,
    pcs: new Set(tones.map((t) => t.pc)),
    essential: q.essential ? new Set(q.essential.map((semis) => (rootPc + semis) % 12)) : null,
    bassPc: bassTone ? bassTone.pc : null,
    bassName: bassTone ? bassTone.name : null,
  };
}

// Slash chord over any bass note, including non-chord tones (F/G).
export function withBass(chord, bassName) {
  const bass = parseNote(bassName);
  const name = bass.name;
  const label = `${chord.root}${QUALITIES[chord.quality].symbol}/${name}`;
  return { ...chord, id: label, symbol: label, inversion: 0, bassPc: bass.pc, bassName: name };
}

// All chords for the chosen families. `slash` adds inversions as slash chords.
export function buildPool({ families, slash }) {
  const pool = [];
  for (const [quality, q] of Object.entries(QUALITIES)) {
    if (!families.includes(q.family)) continue;
    const roots = MINOR_LIKE.has(quality) ? MINOR_ROOTS : MAJOR_ROOTS;
    for (const root of roots) {
      pool.push(makeChord(root, quality, 0));
      if (slash && INVERTIBLE.has(quality)) {
        for (let inv = 1; inv < q.tones.length; inv++) pool.push(makeChord(root, quality, inv));
      }
    }
  }
  return pool;
}

// Does the set of held MIDI notes play this chord?
// - Held pitch classes must all belong to the chord (or its foreign bass note).
// - Octave doublings are fine.
// - Required tones: the chord's `essential` set when it has one (unless strict),
//   otherwise every tone. Lenient mode lets 4+ note chords drop the perfect 5th.
// - Slash chords need the slash note as the lowest note. Plain chords allow any inversion.
export function matches(chord, heldNotes, { lenient = true, strict = false } = {}) {
  const notes = [...heldNotes];
  if (notes.length === 0) return false;
  const heldPcs = new Set(notes.map((n) => n % 12));
  for (const pc of heldPcs) {
    if (!chord.pcs.has(pc) && pc !== chord.bassPc) return false;
  }

  if (chord.essential && !strict) {
    for (const pc of chord.essential) if (!heldPcs.has(pc)) return false;
  } else {
    const rootPc = chord.tones[0].pc;
    const canDropFifth = lenient && chord.tones.length >= 4;
    for (const t of chord.tones) {
      if (heldPcs.has(t.pc)) continue;
      const isPerfectFifth = t.semis === 7 && t.pc !== rootPc;
      if (canDropFifth && isPerfectFifth) continue;
      return false;
    }
  }

  if (chord.bassPc !== null) {
    const lowest = Math.min(...notes);
    if (lowest % 12 !== chord.bassPc) return false;
  }
  return true;
}

// A concrete voicing to show when the player asks for a hint.
// Bass note in octave 3 for slash chords, chord tones stacked up from octave 4.
export function revealVoicing(chord) {
  const midi = [];
  const rootMidi = 60 + chord.tones[0].pc;
  for (const t of chord.tones) midi.push(rootMidi + (t.semis % 12));
  if (chord.bassPc !== null) midi.push(48 + chord.bassPc);
  return midi;
}
