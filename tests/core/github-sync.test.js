import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncPacks } from '../../src/core/github-sync.js';

const pack = (id) => JSON.stringify({ app: 'practice-hub', kind: 'pack', version: 1, id, songs: [], hooks: {} });
const cfg = { owner: 'o', repo: 'r', token: 't' };

function fakeFetch(files, { listStatus = 200 } = {}) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    if (url.endsWith('/contents/packs')) {
      return { ok: listStatus === 200, status: listStatus, json: async () => files.map(f => ({ name: f.name, sha: f.sha, url: `raw/${f.name}`, type: 'file' })) };
    }
    const f = files.find(x => url === `raw/${x.name}`);
    return { ok: true, status: 200, text: async () => f.body };
  };
  fn.calls = calls;
  return fn;
}
function fakeStore(packs = []) {
  const put = [];
  return { put, getPacks: async () => packs, putPack: async (p, sha) => { put.push({ id: p.id, sha }); } };
}

test('new pack is added', async () => {
  const store = fakeStore();
  const f = fakeFetch([{ name: 'a.json', sha: 's1', body: pack('a') }]);
  const r = await syncPacks(cfg, store, f);
  assert.deepEqual(r.added, ['a.json']);
  assert.deepEqual(store.put, [{ id: 'a', sha: 's1' }]);
  assert.equal(f.calls[0].opts.headers.Authorization, 'Bearer t');
});

test('unchanged sha is skipped; changed sha is updated', async () => {
  const store = fakeStore([{ id: 'a', sha: 's1', pack: {} }, { id: 'b', sha: 'old', pack: {} }]);
  const f = fakeFetch([
    { name: 'a.json', sha: 's1', body: pack('a') },
    { name: 'b.json', sha: 'new', body: pack('b') },
  ]);
  const r = await syncPacks(cfg, store, f);
  assert.deepEqual(r.skipped, ['a.json']);
  assert.deepEqual(r.updated, ['b.json']);
  assert.equal(store.put.length, 1);
});

test('invalid pack is reported and not stored', async () => {
  const store = fakeStore();
  const r = await syncPacks(cfg, store, fakeFetch([{ name: 'bad.json', sha: 'x', body: '{nope' }]));
  assert.equal(r.errors.length, 1);
  assert.equal(store.put.length, 0);
});

test('401 gives one clear error', async () => {
  const store = fakeStore();
  const r = await syncPacks(cfg, store, fakeFetch([], { listStatus: 401 }));
  assert.deepEqual(r.errors, ['Token rejected or repo not found']);
  assert.equal(store.put.length, 0);
});
