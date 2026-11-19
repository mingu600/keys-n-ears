import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poolFromSongs, progressionPrompt, voiceLeadOk } from '../../src/views/drill-logic.js';

test('poolFromSongs dedupes and skips bad symbols', () => {
  const songs = [{ sections: [{ name: 'V', bars: [['C', 'G'], ['C', 'Bbmaj7#11']] }], timeSignature: [4, 4] }];
  assert.deepEqual(poolFromSongs(songs).map(c => c.id).sort(), ['C', 'G']);
});
test('progressionPrompt returns the first section chords, skipping unparseable', () => {
  const song = { timeSignature: [4, 4], sections: [
    { name: 'A', bars: [['C', 'G'], ['Am', 'Bbmaj7#11'], ['F']] },
    { name: 'B', bars: [['Dm']] },
  ] };
  assert.deepEqual(progressionPrompt(song).map(c => c.id), ['C', 'G', 'Am', 'F']);
  assert.deepEqual(progressionPrompt({ sections: [] }), []);
});
test('voiceLeadOk threshold', () => {
  assert.ok(voiceLeadOk([48, 64, 67, 72], [53, 65, 69, 72]));
  assert.ok(!voiceLeadOk([60, 64, 67], [62, 74, 77]));
});

test('progressionPrompt collapses consecutive repeated chords', () => {
  const song = { timeSignature: [4, 4], sections: [{ name: 'A', bars: [['C', 'C'], ['C', 'G'], ['G', 'C']] }] };
  assert.deepEqual(progressionPrompt(song).map(c => c.id), ['C', 'G', 'C']);
});
