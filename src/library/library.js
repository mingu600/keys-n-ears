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
  const ordered = [...packs].sort((a, b) => String(a?.createdAt).localeCompare(String(b?.createdAt)));
  for (const pack of ordered) {
    if (!pack || typeof pack !== 'object' || !pack.id || (pack.songs != null && !Array.isArray(pack.songs))
      || (pack.hooks != null && (typeof pack.hooks !== 'object' || Array.isArray(pack.hooks)))) {
      warnings.push(`pack ${pack?.id ?? '?'}: malformed, skipped`);
      continue;
    }
    try {
    for (const s of pack.songs ?? []) {
      if (!s || typeof s !== 'object' || !s.id) { warnings.push(`pack ${pack.id}: song without id skipped`); continue; }
      byId.set(s.id, { ...clone(s), source: 'pack' });
    }
    for (const [songId, hooks] of Object.entries(pack.hooks ?? {})) {
      const song = byId.get(songId);
      if (!song) { warnings.push(`pack ${pack.id}: no song "${songId}"`); continue; }
      song.hooks = song.hooks ?? [];
      for (const h of clone(hooks)) {
        const i = song.hooks.findIndex(x => x.name === h.name);
        if (i >= 0) song.hooks[i] = h; else song.hooks.push(h);
      }
    }
    } catch (e) { warnings.push(`pack ${pack.id}: malformed, partly skipped (${e.message})`); }
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

export function buildExport({ songs, kv, packs, local }) {
  const out = { app: 'practice-hub', version: 1, exportedAt: new Date().toISOString(), songs, kv };
  if (packs) out.packs = packs;
  if (local) out.local = local;
  return out;
}

// Export never carries the GitHub token; import never overwrites the one already stored.
export function withoutToken(data) {
  const out = { ...data, kv: { ...(data.kv ?? {}) } };
  if (out.kv.contentSync && typeof out.kv.contentSync === 'object') {
    const { token, ...rest } = out.kv.contentSync;
    out.kv.contentSync = rest;
  }
  return out;
}

export function keepToken(data, currentSync) {
  const kv = { ...(data.kv ?? {}) };
  if (currentSync?.token) {
    const theirs = kv.contentSync && typeof kv.contentSync === 'object' ? kv.contentSync : {};
    kv.contentSync = { ...currentSync, ...theirs, token: currentSync.token };
  }
  return { ...data, kv };
}

export function parseImport(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { return { ok: false, error: 'Not valid JSON.' }; }
  if (!d || d.app !== 'practice-hub') return { ok: false, error: 'Not a Practice Hub file.' };
  if (d.version !== 1) return { ok: false, error: `Unsupported version ${d.version}.` };
  if (!Array.isArray(d.songs)) return { ok: false, error: 'Missing songs list.' };
  if (!d.kv || typeof d.kv !== 'object' || Array.isArray(d.kv)) return { ok: false, error: 'Missing settings (kv).' };
  if (d.packs !== undefined && !Array.isArray(d.packs)) return { ok: false, error: 'Invalid packs list.' };
  if (d.local !== undefined && (!d.local || typeof d.local !== 'object' || Array.isArray(d.local))) return { ok: false, error: 'Invalid local section.' };
  return { ok: true, data: d };
}

// Only these localStorage keys travel in a backup.
export const LOCAL_KEYS = ['chord-drill:v2'];

// Pure: pick the allowed keys out of a `local` section; values must be objects (parsed JSON).
export function pickLocal(local) {
  const out = {};
  for (const k of LOCAL_KEYS) {
    const v = local?.[k];
    if (v && typeof v === 'object') out[k] = v;
  }
  return out;
}

// Browser only: seeds from data/seeds, merged with packs and user songs from the store.
export async function loadLibrary(store) {
  const lib = { songs: [], errorsById: new Map(), warnings: [], reload };
  async function reload() {
    const errorsById = new Map(), warnings = [];
    const check = (raw) => {
      try {
        const { song, errors } = normalizeSong(raw);
        if (errors.length) errorsById.set(song.id ?? '?', errors);
        return song;
      } catch (e) {
        errorsById.set(raw?.id ?? '?', [`could not be read: ${e.message}`]);
        return null;
      }
    };
    const getJson = async (url) => {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };
    const seeds = [];
    let names = [];
    try { names = await getJson('data/seeds/index.json'); if (!Array.isArray(names)) throw new Error('index is not a list'); }
    catch (e) { warnings.push(`seed index: ${e.message}`); names = []; }
    for (const name of names) {
      try {
        const list = await getJson(`data/seeds/${name}`);
        if (!Array.isArray(list)) throw new Error('not a list of songs');
        for (const raw of list) { const s = check(raw); if (s) seeds.push(s); }
      } catch (e) { warnings.push(`seed file ${name}: ${e.message}`); }
    }
    const users = (await store.getSongs()).map(check).filter(Boolean);
    const packs = (await store.getPacks()).map(r => r?.pack).map(p => (p && Array.isArray(p.songs)
      ? { ...p, songs: p.songs.map(s => (s && typeof s === 'object' && s.id ? check(s) : s)).filter(s => s !== null) }
      : p));
    const merged = mergeLibrary(seeds, packs, users);
    merged.warnings.unshift(...warnings);
    lib.songs = merged.songs;
    lib.warnings = merged.warnings;
    lib.errorsById = errorsById;
    return lib;
  }
  return reload();
}
