import assert from 'node:assert/strict';
import test from 'node:test';
import {deriveDeliveryReviewFrameTimes} from '../lib/generators.mjs';

test('delivery review frames scale to the rendered duration', () => {
  assert.deepEqual(deriveDeliveryReviewFrameTimes(31.808), {
    cover: 2,
    start: 2,
    middle: 15.904,
    end: 31.308,
  });
  assert.deepEqual(deriveDeliveryReviewFrameTimes(4), {
    cover: 0.4,
    start: 0.4,
    middle: 2,
    end: 3.6,
  });
});

test('delivery review frame times reject invalid durations', () => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => deriveDeliveryReviewFrameTimes(value), /positive finite number/i);
  }
});
