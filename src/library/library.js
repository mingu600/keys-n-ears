// Library merge, packs, export/import. Pure except loadLibrary (browser, fetch + store).
import { GENRES, normalizeSong, hookSizeOk, HOOK_MIN, HOOK_MAX } from './schema.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

export function parsePack(text) {
  let p;
  try { p = JSON.parse(text); } catch (e) { return { ok: false, error: 'Not valid JSON.' }; }
  if (!p || p.app !== 'practice-hub') return { ok: false, error: 'Not a Practice Hub file.' };
  if (p.kind !== 'pack') return { ok: false, error: 'Not a content pack.' };
  if (p.version !== 1) return { ok: false, error: `Unsupported pack version ${p.version}.` };
  if (!p.id) return { ok: false, error: 'Pack has no id.' };
  const warnings = [];
  const songs = (Array.isArray(p.songs) ? p.songs : []).map(raw => {
    const { song, errors } = normalizeSong(raw);
    for (const e of errors) warnings.push(`song "${song.id ?? '?'}": ${e}`);
    return song;
  });
  const hooks = {};
  for (const [songId, list] of Object.entries(p.hooks ?? {})) {
    hooks[songId] = [];
    for (const h of Array.isArray(list) ? list : []) {
      if (hookSizeOk(h)) hooks[songId].push(h);
      else warnings.push(`hook "${h?.name}" for "${songId}" dropped: needs ${HOOK_MIN}-${HOOK_MAX} notes`);
    }
  }
  return { ok: true, pack: { ...p, songs, hooks }, warnings };
}

export function mergeLibrary(seeds, packs, userSongs) {
  const warnings = [];
  const byId = new Map(seeds.map(s => [s.id, clone(s)]));
  const ordered = [...packs].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const pack of ordered) {
    for (const s of pack.songs ?? []) byId.set(s.id, { ...clone(s), source: 'pack' });
    for (const [songId, hooks] of Object.entries(pack.hooks ?? {})) {
      const song = byId.get(songId);
      if (!song) { warnings.push(`pack ${pack.id}: no song "${songId}"`); continue; }
      song.hooks = song.hooks ?? [];
      for (const h of clone(hooks)) {
        const i = song.hooks.findIndex(x => x.name === h.name);
        if (i >= 0) song.hooks[i] = h; else song.hooks.push(h);
      }
    }
  }
  for (const u of userSongs) {
    byId.set(u.id, { ...clone(u), source: byId.has(u.id) ? 'seed-edited' : 'user' });
  }
  const songs = [...byId.values()].sort((a, b) => String(a.title).localeCompare(String(b.title)));
  return { songs, warnings };
}

export function filterByGenre(songs, genres) {
  if (!genres.length || GENRES.every(g => genres.includes(g))) return songs;
  return songs.filter(s => (s.genres ?? []).some(g => genres.includes(g)));
}

export function buildExport({ songs, kv, packs }) {
  const out = { app: 'practice-hub', version: 1, exportedAt: new Date().toISOString(), songs, kv };
  if (packs) out.packs = packs;
  return out;
}

export function parseImport(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { return { ok: false, error: 'Not valid JSON.' }; }
  if (!d || d.app !== 'practice-hub') return { ok: false, error: 'Not a Practice Hub file.' };
  if (d.version !== 1) return { ok: false, error: `Unsupported version ${d.version}.` };
  if (!Array.isArray(d.songs)) return { ok: false, error: 'Missing songs list.' };
  if (!d.kv || typeof d.kv !== 'object' || Array.isArray(d.kv)) return { ok: false, error: 'Missing settings (kv).' };
  if (d.packs !== undefined && !Array.isArray(d.packs)) return { ok: false, error: 'Invalid packs list.' };
  return { ok: true, data: d };
}

// Browser only: seeds from data/seeds, merged with packs and user songs from the store.
export async function loadLibrary(store) {
  const lib = { songs: [], errorsById: new Map(), warnings: [], reload };
  async function reload() {
    const names = await (await fetch('data/seeds/index.json')).json();
    const errorsById = new Map();
    const check = (raw) => {
      const { song, errors } = normalizeSong(raw);
      if (errors.length) errorsById.set(song.id ?? '?', errors);
      return song;
    };
    const seeds = [];
    for (const name of names) {
      const list = await (await fetch(`data/seeds/${name}`)).json();
      for (const raw of list) seeds.push(check(raw));
    }
    const users = (await store.getSongs()).map(check);
    const merged = mergeLibrary(seeds, (await store.getPacks()).map(r => r.pack), users);
    lib.songs = merged.songs;
    lib.warnings = merged.warnings;
    lib.errorsById = errorsById;
    return lib;
  }
  return reload();
}
