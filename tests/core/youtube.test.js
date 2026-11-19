import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeId } from '../../src/core/youtube.js';

test('parseYouTubeId handles common forms', () => {
  const id = 'dQw4w9WgXcQ';
  assert.equal(parseYouTubeId(`https://www.youtube.com/watch?v=${id}`), id);
  assert.equal(parseYouTubeId(`https://youtu.be/${id}`), id);
  assert.equal(parseYouTubeId(`https://www.youtube.com/embed/${id}`), id);
  assert.equal(parseYouTubeId(`https://www.youtube.com/shorts/${id}`), id);
  assert.equal(parseYouTubeId(id), id);
  assert.equal(parseYouTubeId(`https://www.youtube.com/watch?v=${id}&t=42s`), id);
  assert.equal(parseYouTubeId('hello'), null);
});
