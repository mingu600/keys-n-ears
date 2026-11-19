import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMidiMessage, releaseSource, releaseHeld, connectedPorts } from '../../src/core/midi.js';

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

test('releaseHeld releases everything, or only one source, reporting sources', () => {
  const mk = () => new Map([[60, 'midi'], [64, 'qwerty'], [67, 'midi']]);
  const all = mk();
  assert.deepEqual(releaseHeld(all, undefined), [
    { note: 60, source: 'midi' }, { note: 64, source: 'qwerty' }, { note: 67, source: 'midi' },
  ]);
  assert.equal(all.size, 0);
  const some = mk();
  assert.deepEqual(releaseHeld(some, 'qwerty'), [{ note: 64, source: 'qwerty' }]);
  assert.deepEqual([...some.keys()], [60, 67]);
  assert.deepEqual(releaseHeld(new Map(), undefined), []);
});

test('connectedPorts keeps only connected ports', () => {
  const m = new Map([['a', { id: 'a', state: 'connected' }], ['b', { id: 'b', state: 'disconnected' }]]);
  assert.deepEqual(connectedPorts(m).map((p) => p.id), ['a']);
  assert.deepEqual(connectedPorts(null), []);
});

import { pickInputs, isTextEntryTarget } from '../../src/core/midi.js';
test('pickInputs falls back to all when the saved id is not connected', () => {
  const all = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(pickInputs(all, 'all'), all);
  assert.deepEqual(pickInputs(all, 'b'), [{ id: 'b' }]);
  assert.deepEqual(pickInputs(all, 'gone'), all);
  assert.deepEqual(pickInputs([], 'gone'), []);
});
test('isTextEntryTarget: only text-entry controls block note keys', () => {
  assert.equal(isTextEntryTarget({ tagName: 'INPUT', type: 'text' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'INPUT', type: 'password' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTextEntryTarget({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(isTextEntryTarget({ tagName: 'SELECT' }), false);
  assert.equal(isTextEntryTarget(null), false);
});
