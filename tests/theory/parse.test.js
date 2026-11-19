import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChordSymbol } from '../../src/theory/parse.js';

test('parses common symbols', () => {
  for (const [s, q] of [['C','maj'],['F#m7b5','m7b5'],['Gsus4','sus4'],['Cadd9','add9'],['E7','7'],
                        ['Gm9','m9'],['F13','13'],['C7#9','7#9'],['Bbmaj7','maj7'],['Ebm','m'],['C°7','dim7']])
    assert.equal(parseChordSymbol(s).quality, q, s);
});

test('parses alias groups', () => {
  for (const [s, q] of [['C-','m'],['Cmin7','m7'],['CΔ7','maj7'],['CM7','maj7'],['C-7','m7'],['C°','dim'],
                        ['Cø','m7b5'],['Cø7','m7b5'],['C+','aug'],['Csus','sus4'],['C7sus','7sus4'],
                        ['Cadd2','add9'],['Cmadd9','madd9'],['C6','6'],['Cm6','m6'],['CM9','maj9'],
                        ['Cm11','m11'],['C7♭9','7b9'],['C♯m','m'],['D♭7','7']])
    assert.equal(parseChordSymbol(s).quality, q, s);
});

test('slash chords: inversion vs foreign bass', () => {
  assert.equal(parseChordSymbol('Bb/D').inversion, 1);
  const fg = parseChordSymbol('F/G');
  assert.equal(fg.bassName, 'G');
  assert.equal(fg.symbol, 'F/G');
  assert.equal(fg.id, 'F/G');
  assert.equal(parseChordSymbol('Gb/Bb').symbol, 'G♭/B♭');
});

test('unparseable returns null', () => {
  for (const s of ['', 'H7', 'Cmaj7#11', 'C/', 'xyz']) assert.equal(parseChordSymbol(s), null, s);
  assert.equal(parseChordSymbol(undefined), null);
});
