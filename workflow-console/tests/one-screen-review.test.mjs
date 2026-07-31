import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, test} from 'node:test';
import {
  buildOneScreenReview,
  listOneScreenProjectSummaries,
  saveOneScreenReview,
} from '../lib/one-screen-review.mjs';

const roots = [];
const project = {
  id: 'one-screen-fixture',
  title: 'One-screen fixture',
  ratio: '16:9',
  resolution: '1920x1080',
  fps: 30,
  formalProjectPath: 'fixture',
};

const writeJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), {recursive: true});
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const makeFixture = async ({mode = 'one-screen-master-board', qaStatus = 'passed'} = {}) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-one-screen-'));
  roots.push(root);
  await writeJson(path.join(root, 'production', 'hyperframes', 'data', 'composition-build.json'), {
    compilerVersion: '1.8.0',
    timeline: {duration: 6},
    continuity: {
      mode,
      fixedHostPose: 'question',
      oneScreenStepCount: 2,
      transition: 'progressive-reveal-no-replacement',
    },
  });
  await writeJson(path.join(root, 'production', 'hyperframes', 'data', 'shot-manifest.json'), {
    shots: [
      {cueId: 'cue-001', start: 0, end: 3, narration: '第一段。', screenText: {text: '第一段'}},
      {cueId: 'cue-002', start: 3, end: 6, narration: '第二段。', screenText: {text: '第二段'}},
    ],
  });
  await writeJson(path.join(root, 'NarrationLock.json'), {frozenPath: 'input/narration.txt'});
  await fs.mkdir(path.join(root, 'input'), {recursive: true});
  await fs.writeFile(path.join(root, 'input', 'narration.txt'), '第一段。第二段。\n', 'utf8');
  await writeJson(path.join(root, 'qa', 'one-screen-mvp-report.json'), {status: qaStatus, checks: {hyperframes: 'passed'}});
  await fs.mkdir(path.join(root, 'renders'), {recursive: true});
  await fs.writeFile(path.join(root, 'renders', `${project.id}-internal-review.mp4`), 'video fixture');
  await fs.mkdir(path.join(root, 'review'), {recursive: true});
  await fs.writeFile(path.join(root, 'review', 'one-screen-master-storyboard.png'), 'storyboard fixture');
  await fs.mkdir(path.join(root, 'captions'), {recursive: true});
  await fs.writeFile(path.join(root, 'captions', 'narration.zh-CN.srt'), 'fixture captions');
  return root;
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, {recursive: true, force: true})));
});

test('one-screen project listing excludes legacy and non-formal projects', async () => {
  const oneScreenRoot = await makeFixture();
  const legacyRoot = await makeFixture({mode: 'continuous-world'});
  const projectsById = new Map([
    [project.id, project],
    ['legacy', {...project, id: 'legacy', title: 'Legacy'}],
    ['draft', {...project, id: 'draft', title: 'Draft', formalProjectPath: null}],
  ]);
  const rootsById = new Map([[project.id, oneScreenRoot], ['legacy', legacyRoot]]);
  const result = await listOneScreenProjectSummaries({
    candidates: [...projectsById.values()],
    getProject: async (id) => projectsById.get(id),
    formalRootFor: (item) => rootsById.get(item.id),
  });
  assert.deepEqual(result, [{projectId: project.id, title: project.title, qaStatus: 'passed', reviewDecision: 'pending'}]);
});

test('approval requires passed QA and a completed full-timeline watch', async () => {
  const pendingQaRoot = await makeFixture({qaStatus: 'pending'});
  await assert.rejects(
    saveOneScreenReview({project, formalRoot: pendingQaRoot, input: {decision: 'approve', watchedToEnd: true}}),
    /Automated QA must pass/,
  );

  const passedRoot = await makeFixture();
  await assert.rejects(
    saveOneScreenReview({project, formalRoot: passedRoot, input: {decision: 'approve', watchedToEnd: false}}),
    /full video/,
  );
  const receipt = await saveOneScreenReview({
    project,
    formalRoot: passedRoot,
    input: {decision: 'approve', watchedToEnd: true, reviewer: 'fixture-reviewer'},
  });
  assert.equal(receipt.decision, 'approve');
  assert.equal(receipt.humanReviewPerformed, true);
  assert.equal(receipt.fullTimelineWatched, true);
  assert.equal(receipt.publicReleaseBlocked, true);
  assert.equal(receipt.bindings.qa.path, 'qa/one-screen-mvp-report.json');
});

test('revision feedback requires a note and binds its timestamp to the matching visual cue', async () => {
  const root = await makeFixture();
  await assert.rejects(
    saveOneScreenReview({project, formalRoot: root, input: {decision: 'revise', timestampSeconds: 4}}),
    /requires a note/,
  );
  const receipt = await saveOneScreenReview({
    project,
    formalRoot: root,
    input: {decision: 'revise', timestampSeconds: 4, notes: '第二个节点文字需要精简。'},
  });
  assert.equal(receipt.issues[0].cueId, 'cue-002');
  assert.equal(receipt.issues[0].elementId, 'visual-cue-002');
  assert.equal(receipt.issues[0].timestampSeconds, 4);

  const view = await buildOneScreenReview({project, formalRoot: root});
  assert.equal(view.review.decision, 'revise');
  assert.equal(view.steps.length, 2);
});
