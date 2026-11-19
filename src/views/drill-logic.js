// Pure helpers for the drill's song-based pool and voice-leading mode.
import { sectionChords } from '../library/schema.js';
import { upperVoiceMove } from '../theory/voicing.js';

// Unique chords (by id) across every section of the songs; unparseable symbols are skipped.
export function poolFromSongs(songs) {
  const seen = new Map();
  for (const song of songs) {
    for (const sec of song.sections ?? []) {
      for (const c of sectionChords(song, sec.name)) {
        if (c.chord && !seen.has(c.chord.id)) seen.set(c.chord.id, c.chord);
      }
    }
  }
  return [...seen.values()];
}

// The first section's parseable chords, in order.
export function progressionPrompt(song) {
  const first = (song.sections ?? [])[0];
  if (!first) return [];
  const out = [];
  for (const c of sectionChords(song, first.name).map((x) => x.chord).filter(Boolean)) {
    if (out.length && out[out.length - 1].id === c.id) continue; // repeated chord: nothing new to play
    out.push(c);
  }
  return out;
}

export function voiceLeadOk(prevNotes, nextNotes, maxMove = 4) {
  return upperVoiceMove(prevNotes, nextNotes) <= maxMove;
}
