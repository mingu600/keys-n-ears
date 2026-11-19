import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSong, sectionChords, songProgressions, chordAtTime, GENRES } from '../../src/library/schema.js';

const base = (over = {}) => ({ id: 'x', title: 'X', artist: 'A', genres: ['Pop'],
  key: { tonic: 'C', mode: 'major' }, bpm: 90, sections: [{ name: 'Verse', bars: [['C', 'G'], ['Am', 'F']] }], ...over });

test('GENRES has the 7 exact strings', () => {
  assert.deepEqual(GENRES, ['Pop', 'Rock', 'R&B/Soul', 'Jazz', 'K-pop', 'J-pop/Anime', 'Game']);
});
test('normalizeSong fills defaults', () => {
  const { song, errors } = normalizeSong(base());
  assert.deepEqual(errors, []);
  assert.equal(song.verified, false);
  assert.deepEqual(song.youtube, { id: null, offset: 0 });
  assert.deepEqual(song.hooks, []);
  assert.deepEqual(song.form, [{ section: 'Verse', start: null, chordTimes: null }]);
});
test('normalizeSong reports missing fields and does not throw', () => {
  const { errors } = normalizeSong({});
  assert.ok(errors.some(e => /id/.test(e)));
  assert.ok(errors.some(e => /title/.test(e)));
  assert.ok(errors.some(e => /artist/.test(e)));
  assert.ok(errors.some(e => /sections/.test(e)));
});
test('normalizeSong reports unparseable chords', () => {
  const { errors } = normalizeSong(base({ sections: [{ name: 'Verse', bars: [['C'], ['Bbmaj7#11']] }] }));
  assert.match(errors[0], /Verse bar 2: "Bbmaj7#11"/);
});
test('normalizeSong rejects unknown genre, bad form ref, bad hook size', () => {
  assert.ok(normalizeSong(base({ genres: ['Kpop'] })).errors.some(e => /genre/i.test(e)));
  assert.ok(normalizeSong(base({ form: [{ section: 'Bridge', start: null, chordTimes: null }] })).errors.some(e => /Bridge/.test(e)));
  const hook = { name: 'H', section: 'Verse', notes: [[60, 0, 1]], verified: false };
  assert.ok(normalizeSong(base({ hooks: [hook] })).errors.some(e => /hook/i.test(e)));
});
test('sectionChords splits beats', () => {
  const song = normalizeSong(base({ sections: [{ name: 'V', bars: [['C', 'G'], ['C:3', 'G']] }] })).song;
  const cs = sectionChords(song, 'V');
  assert.deepEqual(cs.map(c => [c.symbol, c.bar, c.beat, c.beats]),
    [['C', 0, 0, 2], ['G', 0, 2, 2], ['C', 1, 0, 3], ['G', 1, 3, 1]]);
  assert.equal(cs[0].chord.root, 'C');
});
test('songProgressions uses section key override', () => {
  const song = normalizeSong(base({ sections: [
    { name: 'A', bars: [['C', 'G', 'Am', 'F']] },
    { name: 'B', key: { tonic: 'A', mode: 'minor' }, bars: [['Am', 'F', 'C', 'G']] }] })).song;
  const p = songProgressions(song);
  assert.deepEqual(p[0].romans, ['I', 'V', 'vi', 'IV']);
  assert.deepEqual(p[1].romans, ['i', 'VI', 'III', 'VII']);
  assert.deepEqual(p[1].key, { tonic: 'A', mode: 'minor' });
  assert.equal(p[0].section, 'A');
});
test('chordAtTime', () => {
  const song = normalizeSong(base({ sections: [{ name: 'V', bars: [['C', 'G', 'Am']] }, { name: 'W', bars: [['F']] }],
    form: [{ section: 'V', start: 10, chordTimes: [10, 12, 14] }, { section: 'W', start: null, chordTimes: null }] })).song;
  assert.deepEqual(chordAtTime(song, 11), { formIndex: 0, chordIndex: 0, symbol: 'C' });
  assert.equal(chordAtTime(song, 14.5).chordIndex, 2);
  assert.equal(chordAtTime(song, 9), null);
});
test('normalizeSong tolerates malformed structure without throwing', () => {
  const ok = { id: 'x', title: 'X', artist: 'A', genres: ['Pop'], key: { tonic: 'C', mode: 'major' } };
  assert.doesNotThrow(() => normalizeSong({ id: 'x', sections: [null] }));
  assert.ok(normalizeSong({ ...ok, sections: [null] }).errors.length > 0);
  assert.ok(normalizeSong({ ...ok, sections: [{ name: 'V', bars: [null] }] }).errors.length > 0);
  assert.ok(normalizeSong({ ...ok, sections: [{ name: 'V', bars: 'C G' }] }).errors.length > 0);
  assert.ok(normalizeSong({ ...ok, sections: [{ name: 'V', bars: [['C']] }], form: [null] }).errors.length > 0);
  assert.ok(normalizeSong({ ...ok, sections: [{ name: 'V', bars: [['C']] }], hooks: [null] }).errors.length > 0);
  assert.doesNotThrow(() => normalizeSong(null));
});
test('normalizeSong reports bad key; songProgressions survives it', () => {
  const sections = [{ name: 'V', bars: [['C', 'G']] }];
  const raw = { id: 'x', title: 'X', artist: 'A', genres: ['Pop'], sections };
  assert.ok(normalizeSong(raw).errors.some(e => /key/.test(e)));
  assert.ok(normalizeSong({ ...raw, key: { tonic: 'H', mode: 'major' } }).errors.some(e => /key/.test(e)));
  assert.ok(normalizeSong({ ...raw, key: { tonic: 'C', mode: 'dorian' } }).errors.some(e => /key/.test(e)));
  const song = normalizeSong(raw).song;
  assert.deepEqual(songProgressions(song), [{ section: 'V', key: undefined, romans: [], family: null }]);
});
