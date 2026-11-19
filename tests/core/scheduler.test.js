import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPool } from '../../src/theory/chords.js';
import { record, pickNext, slowest, weightFor } from '../../src/core/scheduler.js';

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
