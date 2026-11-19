import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upperVoiceMove } from '../../src/theory/voicing.js';

test('voice leading distance', () => {
  assert.equal(upperVoiceMove([48, 64, 67, 72], [53, 65, 69, 72]), 2);
  assert.equal(upperVoiceMove([60, 64, 67], [62, 74, 77]), 10);
  assert.equal(upperVoiceMove([60], [62, 64]), 0);
});
