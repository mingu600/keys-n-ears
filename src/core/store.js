// IndexedDB store (browser only). Database "practice-hub" v1: songs, packs, kv.
import { parseImport, buildExport } from '../library/library.js';

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx) => new Promise((res, rej) => {
  tx.oncomplete = () => res();
  tx.onerror = () => rej(tx.error);
  tx.onabort = () => rej(tx.error ?? new Error('transaction aborted'));
});

export async function openStore() {
  const db = await new Promise((res, rej) => {
    const open = indexedDB.open('practice-hub', 1);
    open.onupgradeneeded = () => {
      const d = open.result;
      d.createObjectStore('songs', { keyPath: 'id' });
      d.createObjectStore('packs', { keyPath: 'id' });
      d.createObjectStore('kv');
    };
    open.onsuccess = () => res(open.result);
    open.onerror = () => rej(open.error);
  });
  const os = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);

  async function readKv() {
    const tx = db.transaction('kv');
    const s = tx.objectStore('kv');
    const [keys, values] = await Promise.all([req(s.getAllKeys()), req(s.getAll())]);
    return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
  }

  return {
    getSongs: () => req(os('songs').getAll()),
    putSong: (song) => req(os('songs', 'readwrite').put(song)),
    deleteSong: (id) => req(os('songs', 'readwrite').delete(id)),
    getPacks: () => req(os('packs').getAll()),
    putPack: (pack, sha = null) => req(os('packs', 'readwrite').put({ id: pack.id, sha, pack })),
    deletePack: (id) => req(os('packs', 'readwrite').delete(id)),
    get: (key) => req(os('kv').get(key)),
    set: (key, value) => req(os('kv', 'readwrite').put(value, key)),
    async exportAll() {
      const [songs, packs, kv] = await Promise.all([req(os('songs').getAll()), req(os('packs').getAll()), readKv()]);
      return buildExport({ songs, kv, packs });
    },
    // Validates first; writes in one transaction so a failure leaves nothing half-imported.
    async importAll(data, { mode = 'merge' } = {}) {
      const parsed = parseImport(JSON.stringify(data));
      if (!parsed.ok) throw new Error(parsed.error);
      const { songs, kv, packs = [] } = parsed.data;
      const tx = db.transaction(['songs', 'packs', 'kv'], 'readwrite');
      const done_ = done(tx);
      try {
        if (mode === 'replace') for (const n of ['songs', 'packs', 'kv']) tx.objectStore(n).clear();
        for (const s of songs) tx.objectStore('songs').put(s);
        for (const p of packs) tx.objectStore('packs').put(p);
        for (const [k, v] of Object.entries(kv)) tx.objectStore('kv').put(v, k);
      } catch (e) { tx.abort(); await done_.catch(() => {}); throw e; }
      await done_;
    },
  };
}
