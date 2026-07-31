import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  markPronunciationCandidatePlayed,
  selectPronunciationCandidate,
} from '../lib/pronunciation-review-draft.mjs';

const candidateIds = ['term-001-a', 'term-001-c'];

test('selecting a pronunciation candidate accepts the term once every candidate was heard', () => {
  const result = selectPronunciationCandidate({
    decision: 'pending',
    selectedCandidateId: null,
    playedCandidateIds: candidateIds,
  }, 'term-001-c', candidateIds);

  assert.equal(result.selectedCandidateId, 'term-001-c');
  assert.equal(result.decision, 'accepted');
});

test('finishing the last candidate accepts an existing selection without another decision input', () => {
  const result = markPronunciationCandidatePlayed({
    decision: 'pending',
    selectedCandidateId: 'term-001-c',
    playedCandidateIds: ['term-001-a'],
  }, 'term-001-c', candidateIds);

  assert.deepEqual(result.playedCandidateIds, candidateIds);
  assert.equal(result.decision, 'accepted');
});

test('explicit retake remains selected when playback later completes', () => {
  const result = markPronunciationCandidatePlayed({
    decision: 'retake',
    selectedCandidateId: 'term-001-c',
    playedCandidateIds: ['term-001-a'],
  }, 'term-001-c', candidateIds);

  assert.equal(result.decision, 'retake');
});
