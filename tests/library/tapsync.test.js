import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTaps, shiftOccurrence } from '../../src/library/tapsync.js';

test('applyTaps / shiftOccurrence', () => {
  assert.deepEqual(applyTaps([1, 2, 3], 3), { chordTimes: [1, 2, 3], warning: null });
  assert.ok(applyTaps([1, 2], 3).warning);
  const more = applyTaps([1, 2, 3, 4], 3);
  assert.deepEqual(more.chordTimes, [1, 2, 3]);
  assert.ok(more.warning);
  assert.deepEqual(shiftOccurrence({ start: 10, chordTimes: [10, 12] }, 50), { start: 50, chordTimes: [50, 52] });
});
