// Song schema: normalisation, chord lookup, progressions. Pure functions.
import { parseChordSymbol } from '../theory/parse.js';
import { parseNote } from '../theory/chords.js';
import { loopOf, loopFamily, toRoman } from '../theory/roman.js';

export const GENRES = ['Pop', 'Rock', 'R&B/Soul', 'Jazz', 'K-pop', 'J-pop/Anime', 'Game'];
export const HOOK_MIN = 4, HOOK_MAX = 16;

export const hookSizeOk = (hook) =>
  Array.isArray(hook?.notes) && hook.notes.length >= HOOK_MIN && hook.notes.length <= HOOK_MAX;

// "C:3" -> { symbol: 'C', beats: 3 }; "C" -> { symbol: 'C', beats: null }.
function splitSymbol(raw) {
  const s = String(raw);
  const i = s.lastIndexOf(':');
  if (i > 0) {
    const beats = Number(s.slice(i + 1));
    if (Number.isFinite(beats) && beats > 0) return { symbol: s.slice(0, i), beats };
  }
  return { symbol: s, beats: null };
}

const beatsPerBar = (song) => {
  const n = song.timeSignature?.[0];
  return Number.isFinite(n) && n > 0 ? n : 4;
};

export function validKey(key) {
  if (!key || typeof key !== 'object' || (key.mode !== 'major' && key.mode !== 'minor')) return false;
  try { parseNote(String(key.tonic)); return true; } catch { return false; }
}

export function normalizeSong(raw) {
  const errors = [];
  const r = raw && typeof raw === 'object' ? raw : {};
  const song = {
    ...r,
    hooks: Array.isArray(r.hooks) ? r.hooks.map(h => (h && typeof h === 'object' ? { ...h, verified: h.verified ?? false } : h)) : [],
    youtube: { id: r.youtube?.id ?? null, offset: r.youtube?.offset ?? 0 },
    verified: r.verified ?? false,
  };
  const sections = Array.isArray(r.sections) ? r.sections.filter(s => s && typeof s === 'object') : [];
  if (Array.isArray(r.sections) && sections.length !== r.sections.length) errors.push('section is not an object');
  if (!validKey(r.key)) errors.push('missing or invalid key');
  if (!r.id) errors.push('missing id');
  if (!r.title) errors.push('missing title');
  if (!r.artist) errors.push('missing artist');
  const genres = Array.isArray(r.genres) ? r.genres : [];
  for (const g of genres) if (!GENRES.includes(g)) errors.push(`unknown genre "${g}"`);
  if (!sections.length) errors.push('no sections');

  for (const sec of sections) {
    if (sec.key != null && !validKey(sec.key)) errors.push(`${sec.name}: invalid key`);
    if (!Array.isArray(sec.bars)) { errors.push(`${sec.name}: bars must be a list`); continue; }
    sec.bars.forEach((bar, i) => {
      if (!Array.isArray(bar)) { errors.push(`${sec.name} bar ${i + 1}: not a list of chords`); return; }
      for (const raw of bar) {
        const { symbol } = splitSymbol(raw);
        if (!parseChordSymbol(symbol)) errors.push(`${sec.name} bar ${i + 1}: "${symbol}"`);
      }
    });
  }

  const names = new Set(sections.map(s => s.name));
  song.form = Array.isArray(r.form)
    ? r.form.map(f => (f && typeof f === 'object'
      ? { section: f.section, start: f.start ?? null, chordTimes: f.chordTimes ?? null }
      : { section: undefined, start: null, chordTimes: null }))
    : sections.map(s => ({ section: s.name, start: null, chordTimes: null }));
  for (const f of song.form) if (!names.has(f.section)) errors.push(`form references missing section "${f.section}"`);

  for (const h of song.hooks) {
    if (!hookSizeOk(h)) errors.push(`hook "${h?.name}" must have ${HOOK_MIN}-${HOOK_MAX} notes`);
  }
  return { song, errors };
}

export function sectionChords(song, sectionName) {
  const sec = (song.sections ?? []).find(s => s?.name === sectionName);
  if (!sec || !Array.isArray(sec.bars)) return [];
  const perBar = beatsPerBar(song);
  const out = [];
  sec.bars.forEach((bar, barIdx) => {
    if (!Array.isArray(bar)) return;
    const items = bar.map(splitSymbol);
    const fixed = items.reduce((n, it) => n + (it.beats ?? 0), 0);
    const free = items.filter(it => it.beats == null).length;
    const share = free ? Math.max(perBar - fixed, 0) / free : 0;
    let beat = 0;
    for (const it of items) {
      const beats = it.beats ?? share;
      out.push({ symbol: it.symbol, chord: parseChordSymbol(it.symbol), bar: barIdx, beat, beats });
      beat += beats;
    }
  });
  return out;
}

export function songProgressions(song) {
  return (song.sections ?? []).filter(Boolean).map(sec => {
    const key = sec.key ?? song.key;
    if (!validKey(key)) return { section: sec.name, key, romans: [], family: null };
    const chords = sectionChords(song, sec.name).map(c => c.chord).filter(Boolean);
    return {
      section: sec.name,
      key,
      romans: chords.map(c => toRoman(c, key)),
      family: loopFamily(loopOf(chords), key),
    };
  });
}

// The chord sounding at video time t, from synced form occurrences.
export function chordAtTime(song, t) {
  let best = null;
  (song.form ?? []).forEach((occ, formIndex) => {
    if (!Array.isArray(occ.chordTimes)) return;
    occ.chordTimes.forEach((time, chordIndex) => {
      if (time <= t && (!best || time >= best.time)) best = { time, formIndex, chordIndex };
    });
  });
  if (!best) return null;
  const chords = sectionChords(song, song.form[best.formIndex].section);
  return { formIndex: best.formIndex, chordIndex: best.chordIndex, symbol: chords[best.chordIndex]?.symbol ?? null };
}
