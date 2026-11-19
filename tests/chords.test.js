import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spellInterval, makeChord, buildPool, matches, revealVoicing } from '../src/chords.js';
import { record, pickNext, slowest, weightFor } from '../src/scheduler.js';

test('spells chord tones with correct letters', () => {
  assert.equal(spellInterval('E♭', 3, 2), 'G♭');
  assert.equal(spellInterval('F♯', 4, 2), 'A♯');
  assert.equal(spellInterval('B♭', 11, 6), 'A');
  assert.equal(spellInterval('C', 10, 6), 'B♭');
  assert.equal(spellInterval('G♯', 6, 4), 'D');
});

test('slash chord symbols use the spelled bass note', () => {
  assert.equal(makeChord('D', 'maj', 1).symbol, 'D/F♯');
  assert.equal(makeChord('C', 'm', 1).symbol, 'Cm/E♭');
  assert.equal(makeChord('E♭', 'maj7', 3).symbol, 'E♭maj7/D');
  assert.equal(makeChord('G', '7', 0).symbol, 'G7');
});

test('matches root position and any inversion for plain chords', () => {
  const c = makeChord('C', 'maj');
  assert.ok(matches(c, [60, 64, 67]));
  assert.ok(matches(c, [64, 67, 72]));
  assert.ok(matches(c, [48, 60, 64, 67, 72])); // doublings
});

test('rejects missing or extra notes', () => {
  const c = makeChord('C', 'maj');
  assert.ok(!matches(c, [60, 64]));
  assert.ok(!matches(c, [60, 64, 67, 69]));
  assert.ok(!matches(c, []));
});

test('lenient mode lets 7th chords drop the 5th', () => {
  const g7 = makeChord('G', '7');
  assert.ok(matches(g7, [43, 59, 65])); // G B F
  assert.ok(!matches(g7, [43, 59, 65], { lenient: false }));
  assert.ok(!matches(makeChord('C', 'maj'), [60, 64])); // triads still need the 5th
});

test('diminished 5th is never optional', () => {
  const bm7b5 = makeChord('B', 'm7b5');
  assert.ok(!matches(bm7b5, [59, 62, 69])); // B D A, missing F
  assert.ok(matches(bm7b5, [59, 62, 65, 69]));
});

test('slash chords need the slash note lowest', () => {
  const dOverFs = makeChord('D', 'maj', 1);
  assert.ok(matches(dOverFs, [54, 62, 66, 69]));
  assert.ok(!matches(dOverFs, [50, 54, 57]));
});

test('enharmonic input still matches (pitch classes only)', () => {
  assert.ok(matches(makeChord('F♯', 'maj'), [66, 70, 73]));
});

test('reveal voicing is a valid answer', () => {
  for (const chord of buildPool({ families: ['triads', 'sevenths', 'color', 'diminished'], slash: true })) {
    assert.ok(matches(chord, revealVoicing(chord), { lenient: false }), chord.symbol);
  }
});

test('pool sizes', () => {
  assert.equal(buildPool({ families: ['triads'], slash: false }).length, 24);
  assert.equal(buildPool({ families: ['triads'], slash: true }).length, 72);
  assert.equal(buildPool({ families: ['sevenths'], slash: true }).length, 144);
});

test('scheduler: slow chords get more weight than fast ones', () => {
  let stats = {};
  stats = record(stats, 'C', 800);
  stats = record(stats, 'F♯', 6000);
  assert.ok(weightFor(stats, 'F♯') > weightFor(stats, 'C'));
  assert.equal(slowest(stats, 1)[0].id, 'F♯');
});

test('scheduler: never repeats the same root+quality back to back', () => {
  const pool = buildPool({ families: ['triads'], slash: true });
  let prev = null;
  for (let i = 0; i < 500; i++) {
    const next = pickNext(pool, {}, prev);
    if (prev) assert.ok(!(next.root === prev.root && next.quality === prev.quality));
    prev = next;
  }
});
