import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLibrary, parsePack, filterByGenre, buildExport, parseImport } from '../../src/library/library.js';

test('mergeLibrary overlays seeds with user songs', () => {
  const { songs } = mergeLibrary([{ id: 'a', title: 'B' }, { id: 'b', title: 'A' }], [], [{ id: 'a', title: 'B2' }, { id: 'c', title: 'C' }]);
  assert.deepEqual(songs.map(s => [s.id, s.source ?? null]), [['b', null], ['a', 'seed-edited'], ['c', 'user']]);
});
test('mergeLibrary packs: hooks merge by name, later pack wins, user edit wins', () => {
  const seeds = [{ id: 'a', title: 'A', hooks: [{ name: 'Chorus', notes: [] }] }];
  const h = (name, n) => ({ name, notes: Array.from({ length: n }, (_, i) => [60 + i, i, 1]) });
  const p1 = { id: 'p1', createdAt: '2026-11-01', songs: [], hooks: { a: [h('Chorus', 5), h('Riff', 4)], zzz: [h('X', 4)] } };
  const p2 = { id: 'p2', createdAt: '2026-11-02', songs: [], hooks: { a: [h('Chorus', 6)] } };
  const r = mergeLibrary(seeds, [p2, p1], []);
  const a = r.songs[0];
  assert.deepEqual(a.hooks.map(x => [x.name, x.notes.length]), [['Chorus', 6], ['Riff', 4]]);
  assert.match(r.warnings[0], /pack p1: no song "zzz"/);
  assert.equal(seeds[0].hooks.length, 1);
  assert.equal(seeds[0].hooks[0].notes.length, 0);
  const r2 = mergeLibrary(seeds, [p1], [{ id: 'a', title: 'A', hooks: [] }]);
  assert.deepEqual(r2.songs[0].hooks, []);
});
test('mergeLibrary pack songs replace seeds with source pack', () => {
  const r = mergeLibrary([{ id: 'a', title: 'A' }], [{ id: 'p', createdAt: '1', songs: [{ id: 'a', title: 'A pack' }, { id: 'n', title: 'N' }], hooks: {} }], []);
  assert.deepEqual(r.songs.map(s => [s.id, s.source]), [['a', 'pack'], ['n', 'pack']]);
});
test('parsePack rejects bad packs and drops bad hooks', () => {
  assert.equal(parsePack('{').ok, false);
  assert.equal(parsePack('{"app":"practice-hub","kind":"backup","version":1,"id":"x"}').ok, false);
  assert.equal(parsePack('{"app":"practice-hub","kind":"pack","version":2,"id":"x"}').ok, false);
  assert.equal(parsePack('{"app":"practice-hub","kind":"pack","version":1}').ok, false);
  const long = { name: 'L', notes: Array.from({ length: 30 }, (_, i) => [60, i, 1]) };
  const r = parsePack(JSON.stringify({ app: 'practice-hub', kind: 'pack', version: 1, id: 'x', createdAt: '2026-11-18', songs: [], hooks: { a: [long] } }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.pack.hooks.a, []);
  assert.equal(r.warnings.length, 1);
});
test('parsePack keeps songs with errors and warns', () => {
  const r = parsePack(JSON.stringify({ app: 'practice-hub', kind: 'pack', version: 1, id: 'x', createdAt: '1', songs: [{ id: 's' }], hooks: {} }));
  assert.equal(r.ok, true);
  assert.equal(r.pack.songs.length, 1);
  assert.ok(r.warnings.length >= 1);
});
test('filterByGenre', () => {
  const songs = [{ id: 1, genres: ['Pop'] }, { id: 2, genres: ['Jazz', 'Rock'] }];
  assert.equal(filterByGenre(songs, []).length, 2);
  assert.deepEqual(filterByGenre(songs, ['Rock']).map(s => s.id), [2]);
  const all = ['Pop', 'Rock', 'R&B/Soul', 'Jazz', 'K-pop', 'J-pop/Anime', 'Game'];
  assert.equal(filterByGenre(songs, all).length, 2);
});
test('parseImport rejects bad input', () => {
  assert.equal(parseImport('not json').ok, false);
  assert.equal(parseImport('{"app":"other","version":1}').ok, false);
  assert.equal(parseImport('{"app":"practice-hub","version":99,"songs":[],"kv":{}}').ok, false);
  assert.equal(parseImport('{"app":"practice-hub","version":1,"songs":{},"kv":{}}').ok, false);
  const e = buildExport({ songs: [], kv: {} });
  assert.equal(e.app, 'practice-hub');
  assert.equal(parseImport(JSON.stringify(e)).ok, true);
});
