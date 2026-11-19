import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMidiMessage, releaseSource } from '../../src/core/midi.js';

test('parse note on/off/pedal', () => {
  assert.deepEqual(parseMidiMessage([0x90, 60, 100]), { type: 'on', note: 60, velocity: 100 });
  assert.deepEqual(parseMidiMessage([0x91, 60, 0]), { type: 'off', note: 60, velocity: 0 });
  assert.deepEqual(parseMidiMessage([0x80, 60, 64]), { type: 'off', note: 60, velocity: 64 });
  assert.deepEqual(parseMidiMessage([0xB0, 64, 127]), { type: 'pedal', value: 127 });
  assert.equal(parseMidiMessage([0xB0, 7, 100]), null);
  assert.equal(parseMidiMessage([0xF8]), null);
});
test('releaseSource only drops that source', () => {
  const held = new Map([[60, 'midi'], [64, 'qwerty'], [67, 'midi']]);
  assert.deepEqual(releaseSource(held, 'midi').sort(), [60, 67]);
  assert.deepEqual([...held.keys()], [64]);
});
