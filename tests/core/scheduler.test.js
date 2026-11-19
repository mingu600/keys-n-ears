import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPool } from '../../src/theory/chords.js';
import {
  record, pickNext, weakest, weightFor, scoreFromTime, scoreFromAccuracy, withHint, SKIP_SCORE, TARGETS,
} from '../../src/core/scheduler.js';

test('score from time', () => {
  assert.equal(scoreFromTime(2000, 2000), 1 / 3);
  assert.equal(scoreFromTime(99999, 2000), 1);
  assert.equal(scoreFromTime(0, 2000), 0);
  assert.equal(TARGETS.chord, 2000);
});

test('score from accuracy', () => {
  assert.equal(scoreFromAccuracy(0.75), 0.25);
  assert.equal(scoreFromAccuracy(2), 0);
  assert.equal(scoreFromAccuracy(-1), 1);
});

test('hint floor and skip', () => {
  assert.equal(withHint(0.1), 0.7);
  assert.equal(withHint(0.9), 0.9);
  assert.equal(SKIP_SCORE, 1);
});

test('weights: unseen 3, hard > easy', () => {
  let s = record({}, 'chord:C', 0.1, 600);
  s = record(s, 'chord:F♯', 0.9, 5400);
  assert.equal(weightFor(s, 'chord:Db'), 3);
  assert.ok(weightFor(s, 'chord:F♯') > weightFor(s, 'chord:C'));
  assert.equal(s['chord:C'].lastMs, 600);
});

test('record updates EMA and lastAt', () => {
  let s = record({}, 'k', 1, 10, 123);
  assert.deepEqual(s.k, { n: 1, ema: 1, lastMs: 10, lastAt: 123 });
  s = record(s, 'k', 0, 20, 456);
  assert.equal(s.k.n, 2);
  assert.ok(Math.abs(s.k.ema - 0.65) < 1e-9);
  assert.equal(s.k.lastAt, 456);
});

test('weakest filters by prefix', () => {
  let s = record({}, 'chord:C', 0.9);
  s = record(s, 'prog:x', 1);
  assert.deepEqual(weakest(s, { prefix: 'chord:' }).map((e) => e.key), ['chord:C']);
});

test('scheduler: never repeats the same root+quality back to back', () => {
  const pool = buildPool({ families: ['triads'], slash: true });
  const opts = {
    keyOf: (c) => 'chord:' + c.id,
    tooSimilar: (a, b) => !!b && a.root === b.root && a.quality === b.quality,
  };
  let prev = null;
  for (let i = 0; i < 500; i++) {
    const next = pickNext(pool, {}, prev, opts);
    if (prev) assert.ok(!(next.root === prev.root && next.quality === prev.quality));
    prev = next;
  }
});
