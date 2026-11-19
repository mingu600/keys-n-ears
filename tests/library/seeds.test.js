import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { GENRES, normalizeSong, songProgressions } from '../../src/library/schema.js';
import { parsePack } from '../../src/library/library.js';

async function loadSeeds() {
  const files = JSON.parse(await readFile('data/seeds/index.json', 'utf8'));
  return (await Promise.all(files.map(f => readFile(`data/seeds/${f}`, 'utf8').then(JSON.parse)))).flat();
}

test('all seeds load cleanly', async () => {
  const songs = await loadSeeds();
  assert.equal(songs.length, 49);
  assert.equal(new Set(songs.map(s => s.id)).size, 49);
  for (const raw of songs) {
    const { song, errors } = normalizeSong(raw);
    assert.deepEqual(errors, [], raw.id);
    assert.equal(song.verified, false, raw.id);
    assert.equal(song.youtube.id, null, raw.id);
  }
  for (const g of GENRES) assert.ok(songs.filter(s => s.genres[0] === g).length >= 7, g);
});

test('most seed sections yield a loop family', async () => {
  const songs = await loadSeeds();
  const withFamily = songs.filter(raw => {
    const { song } = normalizeSong(raw);
    return songProgressions(song).some(p => p.family !== null);
  });
  assert.ok(withFamily.length >= Math.ceil(songs.length * 0.6), `${withFamily.length}/${songs.length}`);
});

test('no melodies in public seeds', async () => {
  const songs = await loadSeeds();
  for (const s of songs) assert.equal(s.hooks.length, 0, s.id);
});

test('private packs are valid when present', async (t) => {
  let names;
  try { names = (await readdir('private/packs')).filter(n => n.endsWith('.json')); } catch { return t.skip('no private packs'); }
  if (!names.length) return t.skip('no private packs');
  const seeds = await loadSeeds();
  for (const name of names) {
    const r = parsePack(await readFile(`private/packs/${name}`, 'utf8'));
    assert.equal(r.ok, true, `${name}: ${r.error}`);
    assert.deepEqual(r.warnings, [], name);
    const byId = new Map([...seeds, ...r.pack.songs].map(s => [s.id, s]));
    for (const [songId, list] of Object.entries(r.pack.hooks)) {
      const target = byId.get(songId);
      assert.ok(target, `${name}: unknown song ${songId}`);
      const sections = new Set((target.sections ?? []).map(s => s.name));
      for (const h of list) {
        assert.ok(sections.has(h.section), `${name}: ${songId} hook "${h.name}" names missing section "${h.section}"`);
        for (const [midi, start, dur] of h.notes) assert.ok(midi >= 48 && midi <= 96 && start >= 0 && dur > 0, `${name}: ${songId} bad note`);
      }
    }
    if (r.pack.id === 'seed-hooks') {
      const covered = Object.values(r.pack.hooks).filter(list => list.length >= 1).length;
      assert.ok(covered >= 1, `${name}: no songs have hooks`);
    }
  }
});
