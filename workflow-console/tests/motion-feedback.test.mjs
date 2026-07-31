import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildMotionFeedback,
  readLatestMotionFeedbackSummary,
  saveMotionFeedback,
} from '../lib/motion-feedback.mjs';

const createFixture = async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-motion-feedback-'));
  const formalRoot = path.join(workspaceRoot, 'project');
  const projectId = 'feedback-project';
  const usage = {
    schemaVersion: 'autovideo-motion-usage/v1',
    usageKey: `${projectId}:composition-digest`,
    projectId,
    compositionDigest: 'composition-digest',
    compositionFileCount: 7,
    recipes: [
      {libraryId: 'knowledge-explainer', recipeId: 'diagram-build', version: '1.0.0', cueIds: ['cue-1']},
      {libraryId: 'knowledge-explainer', recipeId: 'data-proof', version: '1.0.0', cueIds: ['cue-2']},
    ],
    humanReview: 'pending',
    feedback: null,
    recordedAt: '2026-07-20T10:00:00.000Z',
  };
  const logRelativePath = 'style-library/motion-library/usage-log.jsonl';
  await fs.mkdir(path.join(workspaceRoot, 'style-library', 'motion-library'), {recursive: true});
  await fs.mkdir(path.join(formalRoot, 'review'), {recursive: true});
  await fs.writeFile(path.join(workspaceRoot, logRelativePath), `${JSON.stringify(usage)}\n`, 'utf8');
  await fs.writeFile(path.join(formalRoot, 'review', 'motion-usage.json'), `${JSON.stringify({path: logRelativePath, usageKey: usage.usageKey, record: usage}, null, 2)}\n`, 'utf8');
  t.after(() => fs.rm(workspaceRoot, {recursive: true, force: true}));
  return {workspaceRoot, formalRoot, projectId, usage};
};

test('motion feedback is versioned, project-bound, and does not mutate lifecycle state', async (t) => {
  const fixture = await createFixture(t);
  const initial = await buildMotionFeedback(fixture);
  assert.equal(initial.available, true);
  assert.equal(initial.historyCount, 0);
  assert.equal(initial.policy.feedbackDoesNotPromoteRecipes, true);

  const first = await saveMotionFeedback({
    ...fixture,
    reviewer: 'human-reviewer',
    input: {
      usageKey: fixture.usage.usageKey,
      overallVerdict: 'reusable',
      recipeFeedback: [
        {recipeId: 'diagram-build', version: '1.0.0', verdict: 'reuse', suitableTopics: ['流程解释'], issues: [], notes: '关系建立清楚。'},
        {recipeId: 'data-proof', version: '1.0.0', verdict: 'tune', suitableTopics: ['数据证据'], issues: ['数字停留偏短'], notes: ''},
      ],
      notes: '保留基础风格，只调整右侧内容节奏。',
    },
  });
  assert.equal(first.review.revision, 1);
  assert.equal(first.review.humanReview, 'reviewed');
  assert.equal(first.review.lifecycleMutationApplied, false);
  assert.equal(first.historyCount, 1);

  const second = await saveMotionFeedback({
    ...fixture,
    reviewer: 'human-reviewer',
    input: {
      usageKey: fixture.usage.usageKey,
      overallVerdict: 'needs-tuning',
      recipeFeedback: [
        {recipeId: 'diagram-build', version: '1.0.0', verdict: 'tune', suitableTopics: ['三步流程'], issues: ['连线音效过密'], notes: ''},
        {recipeId: 'data-proof', version: '1.0.0', verdict: 'hold', suitableTopics: ['有来源的数据'], issues: ['需要更多样片'], notes: ''},
      ],
      notes: '第二轮审片结论。',
    },
  });
  assert.equal(second.review.revision, 2);
  assert.equal(second.historyCount, 2);
  assert.ok(second.review.supersedes);
  const receipt = JSON.parse(await fs.readFile(path.join(fixture.formalRoot, 'review', 'motion-feedback.json'), 'utf8'));
  assert.equal(receipt.latestRevision, 2);
  assert.equal(receipt.record.lifecycleMutationApplied, false);
});

test('motion feedback must cover the exact recipes used by the composition', async (t) => {
  const fixture = await createFixture(t);
  await assert.rejects(
    saveMotionFeedback({
      ...fixture,
      input: {
        usageKey: fixture.usage.usageKey,
        overallVerdict: 'reusable',
        recipeFeedback: [
          {recipeId: 'diagram-build', version: '1.0.0', verdict: 'reuse', suitableTopics: [], issues: [], notes: ''},
        ],
        notes: '',
      },
    }),
    /cover every recipe/,
  );
});

test('latest feedback summary ignores superseded revisions and remains advisory', async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-feedback-summary-'));
  t.after(() => fs.rm(workspaceRoot, {recursive: true, force: true}));
  const logPath = path.join(workspaceRoot, 'style-library', 'motion-library', 'feedback-log.jsonl');
  await fs.mkdir(path.dirname(logPath), {recursive: true});
  const record = (usageKey, revision, verdict, reviewedAt) => ({
    usageKey,
    revision,
    reviewedAt,
    lifecycleMutationApplied: false,
    recipeFeedback: [{
      recipeId: 'diagram-build',
      version: '1.0.0',
      verdict,
      suitableTopics: verdict === 'reuse' ? ['workflow'] : ['architecture'],
    }],
  });
  await fs.writeFile(logPath, [
    JSON.stringify(record('usage-a', 1, 'hold', '2026-07-20T10:00:00.000Z')),
    JSON.stringify(record('usage-a', 2, 'reuse', '2026-07-20T11:00:00.000Z')),
    JSON.stringify(record('usage-b', 1, 'tune', '2026-07-20T12:00:00.000Z')),
    '',
  ].join('\n'), 'utf8');
  const summary = await readLatestMotionFeedbackSummary({workspaceRoot});
  assert.equal(summary.latestUsageCount, 2);
  assert.equal(summary.feedback['diagram-build'].sampleCount, 2);
  assert.equal(summary.feedback['diagram-build'].hold, 0);
  assert.equal(summary.feedback['diagram-build'].reuse, 1);
  assert.equal(summary.feedback['diagram-build'].tune, 1);
  assert.equal(summary.policy.advisoryOnly, true);
  assert.equal(summary.policy.lifecycleMutationApplied, false);
});
