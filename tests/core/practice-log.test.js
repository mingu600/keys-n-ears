import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addActivity, minutesOn } from '../../src/core/practice-log.js';

test('addActivity counts unique minutes per day', () => {
  let log = {};
  log = addActivity(log, new Date(2026, 10, 18, 9, 0, 5));
  log = addActivity(log, new Date(2026, 10, 18, 9, 0, 50));
  log = addActivity(log, new Date(2026, 10, 18, 9, 2, 0));
  assert.equal(minutesOn(log, new Date(2026, 10, 18)), 2);
  assert.equal(minutesOn(log, new Date(2026, 10, 19)), 0);
});

import { touchSong, recentSongIds } from '../../src/core/practice-log.js';
test('touchSong keeps status; recentSongIds sorts newest first', () => {
  let m = {};
  m = touchSong(m, 'a', new Date('2026-11-01T10:00:00Z'), 'learning');
  m = touchSong(m, 'b', new Date('2026-11-02T10:00:00Z'));
  m = touchSong(m, 'a', new Date('2026-11-03T10:00:00Z'));
  assert.equal(m.a.status, 'learning');
  assert.equal(m.b.status, 'new');
  assert.deepEqual(recentSongIds(m, 2), ['a', 'b']);
  assert.deepEqual(recentSongIds({ x: { status: 'new' } }), []);
});

import { updateSongStatus } from '../../src/core/practice-log.js';
test('updateSongStatus re-reads kv so other entries survive', async () => {
  const kv = { songStatus: { other: { status: 'can play', lastPracticed: '2026-11-01T00:00:00.000Z' } } };
  const store = { get: async (k) => kv[k], set: async (k, v) => { kv[k] = v; } };
  await updateSongStatus(store, 'a', new Date('2026-11-02T00:00:00Z'), 'learning');
  assert.equal(kv.songStatus.other.status, 'can play');
  assert.equal(kv.songStatus.a.status, 'learning');
  kv.songStatus = { ...kv.songStatus, late: { status: 'new', lastPracticed: '2026-11-03T00:00:00.000Z' } }; // written elsewhere meanwhile
  await updateSongStatus(store, 'a', new Date('2026-11-04T00:00:00Z'));
  assert.ok(kv.songStatus.late && kv.songStatus.other);
  assert.equal(kv.songStatus.a.status, 'learning');
});
