import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChordSymbol } from '../../src/theory/parse.js';
import { toRoman, loopOf, loopFamily } from '../../src/theory/roman.js';

const C = { tonic: 'C', mode: 'major' }, Am = { tonic: 'A', mode: 'minor' };
const p = (s) => s.split(' ').map(parseChordSymbol);

test('diatonic and borrowed numerals', () => {
  assert.deepEqual(p('C G Am F Bb Ab Fm Bdim').map(c => toRoman(c, C)),
    ['I','V','vi','IV','♭VII','♭VI','iv','vii°']);
});
test('minor keys analysed in minor', () => {
  assert.deepEqual(p('Am F C G E7').map(c => toRoman(c, Am)), ['i','VI','III','VII','V7']);
});
test('secondary dominants', () => {
  assert.equal(toRoman(parseChordSymbol('D7'), C), 'V7/V');
  assert.equal(toRoman(parseChordSymbol('E'), C), 'V/vi');
  assert.equal(toRoman(parseChordSymbol('A7'), C, { suffix: false }), 'V/ii');
});
test('suffixes', () => {
  assert.equal(toRoman(parseChordSymbol('Fmaj7'), C), 'IVmaj7');
  assert.equal(toRoman(parseChordSymbol('Bm7b5'), C), 'viiø7');
  assert.equal(toRoman(parseChordSymbol('Dm9'), C), 'ii9');
  assert.equal(toRoman(parseChordSymbol('Dm7'), C), 'ii7');
  assert.equal(toRoman(parseChordSymbol('Dm7'), C, { suffix: false }), 'ii');
  assert.equal(toRoman(parseChordSymbol('F7'), { tonic: 'Bb', mode: 'major' }), 'V7');
  assert.equal(toRoman(parseChordSymbol('Bb'), { tonic: 'B♭', mode: 'major' }), 'I');
});
test('loop families merge rotations and relative minor', () => {
  const a = loopFamily(p('C G Am F'), C);
  const b = loopFamily(p('Am F C G'), Am);
  const c = loopFamily(p('F C G Am'), C);
  assert.equal(a.id, b.id); assert.equal(a.id, c.id);
  assert.equal(a.label.split('-').length, 4);
});
test('loopOf reduces repeats', () => {
  assert.equal(loopOf(p('C C G Am F C G Am F')).length, 4);
});
test('loop family bounds', () => {
  assert.equal(loopFamily(p('C'), C), null);
  assert.equal(loopFamily(p('C G Am F C G Am F C'), C), null);
});
