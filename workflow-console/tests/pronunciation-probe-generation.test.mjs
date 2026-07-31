import assert from 'node:assert/strict';
import {test} from 'node:test';

import {buildPronunciationProbeVariants} from '../lib/generators.mjs';
import {reconcilePronunciationTermDecision} from '../lib/pronunciation-review.mjs';

test('pronunciation probes apply approved context acronyms and keep the reviewed token selectable', () => {
  const entry = {
    token: 'Confluence',
    spokenAs: 'Confluence',
    status: 'needs-listening-review',
  };
  const guide = {
    entries: [
      {token: 'PDF', spokenAs: 'P D F', status: 'approved-default'},
      {token: 'HTML', spokenAs: 'H T M L', status: 'approved-default'},
      entry,
    ],
  };

  const variants = buildPronunciationProbeVariants({
    contextText: '来自 PDF、HTML 或 Confluence。',
    entry,
    guide,
  });

  assert.equal(variants.length, 2);
  assert.equal(variants[0].ttsText, '来自 P D F、H T M L 或 Confluence。');
  assert.equal(variants[1].ttsText, '来自 P D F、H T M L 或 “Confluence”。');
});

test('pronunciation probes add a project alias without mutating the source context', () => {
  const entry = {
    token: 'Self-RAG',
    spokenAs: 'Self R A G',
    status: 'needs-listening-review',
  };

  const variants = buildPronunciationProbeVariants({
    contextText: '事中是 Self-RAG，也就是自反思 RAG。',
    entry,
    guide: {
      entries: [
        {token: 'RAG', spokenAs: 'R A G', status: 'approved-default'},
        entry,
      ],
    },
  });

  assert.equal(variants.length, 2);
  assert.equal(variants[0].ttsText, '事中是 Self-RAG，也就是自反思 R A G。');
  assert.equal(variants[1].spokenAs, 'Self R A G');
  assert.equal(variants[1].ttsText, '事中是 Self R A G，也就是自反思 R A G。');
});

test('regeneration preserves listening evidence only for byte-identical candidates', () => {
  const priorTerm = {
    token: 'demo',
    decision: 'accepted',
    selectedCandidateId: 'demo-a',
    playedCandidateIds: ['demo-a', 'demo-b'],
    note: 'Earlier review',
  };
  const priorBinding = {
    candidates: [
      {id: 'demo-a', ttsTextSha256: 'text-a', audio: {sha256: 'audio-a'}},
      {id: 'demo-b', ttsTextSha256: 'text-b', audio: {sha256: 'audio-b'}},
    ],
  };
  const unchanged = reconcilePronunciationTermDecision({
    priorTerm,
    priorBinding,
    probe: {candidates: [
      {id: 'demo-a', ttsTextSha256: 'text-a', audio: {sha256: 'audio-a'}},
      {id: 'demo-b', ttsTextSha256: 'text-b', audio: {sha256: 'audio-b'}},
    ]},
  });
  assert.equal(unchanged.decision, 'accepted');
  assert.deepEqual(unchanged.playedCandidateIds, ['demo-a', 'demo-b']);

  const changed = reconcilePronunciationTermDecision({
    priorTerm,
    priorBinding,
    probe: {candidates: [
      {id: 'demo-a', ttsTextSha256: 'text-a-v2', audio: {sha256: 'audio-a-v2'}},
      {id: 'demo-b', ttsTextSha256: 'text-b', audio: {sha256: 'audio-b'}},
      {id: 'demo-c', ttsTextSha256: 'text-c', audio: {sha256: 'audio-c'}},
    ]},
  });
  assert.equal(changed.decision, 'pending');
  assert.equal(changed.selectedCandidateId, null);
  assert.deepEqual(changed.playedCandidateIds, ['demo-b']);
});
