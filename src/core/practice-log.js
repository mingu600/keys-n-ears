// Practice minutes per local day. Pure: no window/document/navigator.
// log: { 'YYYY-MM-DD': [minuteOfDay, ...] } with unique, sorted minute indexes.

const pad = (n) => String(n).padStart(2, '0');

export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function minuteIndex(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// Returns the same log object when the minute is already recorded, else a new one.
export function addActivity(log, at) {
  const key = dayKey(at);
  const idx = minuteIndex(at);
  const day = log[key] ?? [];
  if (day.includes(idx)) return log;
  return { ...log, [key]: [...day, idx].sort((a, b) => a - b) };
}

export function minutesOn(log, date) {
  return (log[dayKey(date)] ?? []).length;
}

// ---------- song status (kv `songStatus`) ----------
export const STATUSES = ['new', 'learning', 'can play'];

// Returns a new map with the song's status and/or lastPracticed updated.
// Omitted `status` keeps the existing one (default 'new').
export function touchSong(map, id, at, status) {
  const prev = map[id] ?? {};
  return { ...map, [id]: { status: status ?? prev.status ?? 'new', lastPracticed: at.toISOString() } };
}

// Song ids with a lastPracticed time, newest first.
export function recentSongIds(map, n = 3) {
  return Object.entries(map)
    .filter(([, v]) => v && typeof v.lastPracticed === 'string')
    .sort((a, b) => (a[1].lastPracticed < b[1].lastPracticed ? 1 : -1))
    .slice(0, n)
    .map(([id]) => id);
}

// Read-modify-write against a store ({get, set}) so concurrent writers' entries survive.
// Re-reads kv right before writing; returns the written map.
export async function updateSongStatus(store, id, at, status) {
  const current = (await store.get('songStatus')) ?? {};
  const next = touchSong(current, id, at, status);
  await store.set('songStatus', next);
  return next;
}
