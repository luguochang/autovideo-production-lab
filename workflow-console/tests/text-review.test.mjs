import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {after, test} from 'node:test';

import {
  approveScreenTextReview,
  approveSubtitleReview,
  buildScreenTextReview,
  buildSubtitleReview,
  initializeScreenTextReview,
  initializeSubtitleReview,
  reopenTextReview,
  saveScreenTextReview,
  saveSubtitleReview,
  screenTextReviewChecklistKeys,
  subtitleReviewChecklistKeys,
} from '../lib/text-review.mjs';

const consoleRoot = path.resolve(import.meta.dirname, '..');
const testRoot = path.join(consoleRoot, 'data', `text-review-test-${process.pid}`);
const reviewStage = {status: 'needs-review'};
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sha256File = async (filePath) => sha256(await fs.readFile(filePath));

const writeJson = async (root, relativePath, value) => {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, serialize(value), 'utf8');
  return target;
};

const writeBytes = async (root, relativePath, value) => {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, value);
  return target;
};

const checklist = (keys, value = true) => Object.fromEntries(keys.map((key) => [key, value]));
const acceptedItems = (items) => items.map(({id}) => ({id, decision: 'accepted', note: ''}));

const makeSubtitleFixture = async (name) => {
  const formalRoot = path.join(testRoot, name);
  const projectId = `text-review-${name}`;
  await fs.rm(formalRoot, {recursive: true, force: true});
  const narrationLockPath = await writeJson(formalRoot, 'NarrationLock.json', {
    schemaVersion: 'autovideo-narration-lock/v1',
    projectId,
    normalizedSha256: sha256('First cue Second cue'),
  });
  const alignmentPath = await writeJson(formalRoot, 'audio/alignment.json', {
    schemaVersion: 'autovideo-alignment-locked/v1',
    projectId,
    cues: [
      {id: 'cue-001', start: 0, end: 1, text: 'First cue'},
      {id: 'cue-002', start: 1, end: 2, text: 'Second cue'},
    ],
  });
  const validationPath = await writeJson(formalRoot, 'captions/alignment-validation.json', {
    schemaVersion: 'autovideo-alignment-validation/v1',
    projectId,
    status: 'passed',
  });
  const srtPath = await writeBytes(
    formalRoot,
    'captions/narration.zh-CN.srt',
    '1\n00:00:00,000 --> 00:00:01,000\nFirst cue\n\n2\n00:00:01,000 --> 00:00:02,000\nSecond cue\n',
  );
  await writeJson(formalRoot, 'qa/subtitle-qa.json', {
    schemaVersion: 'autovideo-subtitle-qa/v1',
    projectId,
    machine: {
      status: 'passed',
      alignmentSha256: await sha256File(alignmentPath),
      validationSha256: await sha256File(validationPath),
      srtSha256: await sha256File(srtPath),
    },
  });
  return {formalRoot, projectId, narrationLockPath, alignmentPath, validationPath, srtPath};
};

const approveSubtitles = async (fixture) => {
  const initialized = await initializeSubtitleReview(fixture);
  const input = {
    checklist: checklist(subtitleReviewChecklistKeys),
    cues: acceptedItems(initialized.review.cues),
    notes: 'Every current cue was reviewed.',
  };
  await saveSubtitleReview({...fixture, stage: reviewStage, rawInput: input, reviewer: 'subtitle-reviewer'});
  return approveSubtitleReview({...fixture, stage: reviewStage, reviewer: 'subtitle-reviewer'});
};

const makeScreenFixture = async (name, {secondFrame = true} = {}) => {
  const fixture = await makeSubtitleFixture(name);
  await approveSubtitles(fixture);
  await writeJson(fixture.formalRoot, 'plan/shot-manifest.json', {
    schemaVersion: 'autovideo-shot-manifest/v1',
    projectId: fixture.projectId,
    shots: [
      {cueId: 'cue-001', sceneId: 'scene-001'},
      {cueId: 'cue-002', sceneId: 'scene-002'},
    ],
  });
  await writeBytes(fixture.formalRoot, 'production/hyperframes/index.html', '<main>composition</main>\n');
  const buildPath = await writeJson(fixture.formalRoot, 'production/hyperframes/data/composition-build.json', {
    schemaVersion: 'autovideo-composition-build/v1',
    projectId: fixture.projectId,
    sceneCount: 2,
    cueCount: 2,
  });
  await writeBytes(fixture.formalRoot, 'production/hyperframes/snapshots/cue-at-0.5s.png', 'frame-one');
  if (secondFrame) {
    await writeBytes(fixture.formalRoot, 'production/hyperframes/snapshots/cue-at-1.5s.png', 'frame-two');
  }
  await writeBytes(fixture.formalRoot, 'production/hyperframes/snapshots/contact-sheet.png', 'not-a-review-frame');
  const composition = {
    path: 'production/hyperframes',
    digest: sha256(`composition:${name}`),
    fileCount: secondFrame ? 4 : 3,
  };
  const checkPath = await writeJson(fixture.formalRoot, 'qa/hyperframes-check.json', {
    ok: true,
    strict: true,
    lint: {ok: true, errorCount: 0},
    runtime: {ok: true, errorCount: 0},
    layout: {ok: true, errorCount: 0},
    motion: {ok: true, errorCount: 0},
    contrast: {ok: true, errorCount: 0},
    snapshots: {enabled: true, files: [], times: []},
    autoVideo: {
      hyperframesVersion: '0.7.64',
      compositionDigest: composition.digest,
      compositionFileCount: composition.fileCount,
      buildReceiptSha256: await sha256File(buildPath),
    },
  });
  return {...fixture, composition, checkPath, buildPath};
};

const approveManualScreenText = async (fixture) => {
  const initialized = await initializeScreenTextReview(fixture);
  const input = {
    checklist: checklist(screenTextReviewChecklistKeys),
    frames: acceptedItems(initialized.review.frames),
    reviewMode: 'manual',
    notes: 'Every deterministic review frame was checked manually.',
  };
  await saveScreenTextReview({...fixture, stage: reviewStage, rawInput: input, reviewer: 'screen-reviewer'});
  await approveScreenTextReview({...fixture, stage: reviewStage, reviewer: 'screen-reviewer'});
  return {initialized, input};
};

after(async () => {
  await fs.rm(testRoot, {recursive: true, force: true});
});

test('subtitle review enforces checklist readiness, exact cue coverage, and revision notes', async () => {
  const fixture = await makeSubtitleFixture('subtitle-contract');
  const initialized = await initializeSubtitleReview(fixture);
  const accepted = acceptedItems(initialized.review.cues);

  const incomplete = await saveSubtitleReview({
    ...fixture,
    stage: reviewStage,
    rawInput: {checklist: checklist(subtitleReviewChecklistKeys, false), cues: accepted, notes: ''},
    reviewer: 'subtitle-reviewer',
  });
  assert.equal(incomplete.status, 'in-progress');

  await assert.rejects(
    () => saveSubtitleReview({
      ...fixture,
      stage: reviewStage,
      rawInput: {checklist: checklist(subtitleReviewChecklistKeys), cues: accepted.slice(0, 1), notes: ''},
    }),
    /cover every current item exactly once/i,
  );
  await assert.rejects(
    () => saveSubtitleReview({
      ...fixture,
      stage: reviewStage,
      rawInput: {checklist: checklist(subtitleReviewChecklistKeys), cues: [accepted[0], accepted[0]], notes: ''},
    }),
    /duplicate ids/i,
  );
  await assert.rejects(
    () => saveSubtitleReview({
      ...fixture,
      stage: reviewStage,
      rawInput: {
        checklist: checklist(subtitleReviewChecklistKeys),
        cues: [{...accepted[0], decision: 'revise', note: ''}, accepted[1]],
        notes: '',
      },
    }),
    /revision decision requires a note/i,
  );
});

test('subtitle approval is invalid when its reviewed draft hash changes', async () => {
  const fixture = await makeSubtitleFixture('subtitle-approval-hash');
  await approveSubtitles(fixture);
  const approved = await buildSubtitleReview(fixture);
  assert.equal(approved.review.status, 'approved');
  assert.equal(approved.approval.approvalScope, 'human-review');

  const reviewPath = path.join(fixture.formalRoot, 'qa', 'subtitle-human-review.json');
  const review = JSON.parse(await fs.readFile(reviewPath, 'utf8'));
  await fs.writeFile(reviewPath, serialize({...review, notes: 'Changed after approval.'}), 'utf8');

  const invalidated = await buildSubtitleReview(fixture);
  assert.notEqual(invalidated.review.status, 'approved');
  assert.equal(invalidated.approval, null);
});

test('screen review consumes a real autoVideo check, excludes contact sheets, covers every cue, and supports manual approval', async () => {
  const fixture = await makeScreenFixture('screen-manual');
  const {initialized} = await approveManualScreenText(fixture);
  assert.equal(initialized.review.frames.length, 2);
  assert.ok(initialized.review.frames.every((frame) => !frame.path.endsWith('contact-sheet.png')));
  assert.deepEqual(
    initialized.review.frames.flatMap((frame) => frame.cueIds).sort(),
    ['cue-001', 'cue-002'],
  );
  const frameSet = JSON.parse(await fs.readFile(path.join(fixture.formalRoot, 'qa', 'screen-text-frame-set.json'), 'utf8'));
  assert.equal(frameSet.schemaVersion, 'autovideo-screen-text-frame-set/v1');
  assert.equal(frameSet.hyperframesCheck.path, 'qa/hyperframes-check.json');
  assert.equal(frameSet.frames.length, 2);

  const approved = await buildScreenTextReview(fixture);
  assert.equal(approved.review.status, 'approved');
  assert.equal(approved.approval.reviewMode, 'manual');
  assert.equal(approved.approval.approvalScope, 'human-review');
});

test('screen frame-set generation fails when deterministic snapshots do not cover every cue', async () => {
  const fixture = await makeScreenFixture('screen-uncovered-cue', {secondFrame: false});
  await assert.rejects(
    () => initializeScreenTextReview(fixture),
    /do not cover every cue.*cue-002/i,
  );
});

test('explicit screen review regeneration replaces a stale frame set after composition rebuild', async () => {
  const fixture = await makeScreenFixture('screen-stale-frame-set');
  await initializeScreenTextReview(fixture);
  const frameSetPath = path.join(fixture.formalRoot, 'qa', 'screen-text-frame-set.json');
  const previous = JSON.parse(await fs.readFile(frameSetPath, 'utf8'));

  await writeBytes(fixture.formalRoot, 'production/hyperframes/snapshots/cue-at-0.5s.png', 'rebuilt-frame-one');
  const composition = {...fixture.composition, digest: sha256('rebuilt-composition')};
  await writeJson(fixture.formalRoot, 'qa/hyperframes-check.json', {
    ok: true,
    strict: true,
    autoVideo: {
      compositionDigest: composition.digest,
      compositionFileCount: composition.fileCount,
      buildReceiptSha256: await sha256File(fixture.buildPath),
    },
  });

  const regenerated = await initializeScreenTextReview({...fixture, composition});
  const current = JSON.parse(await fs.readFile(frameSetPath, 'utf8'));
  assert.equal(regenerated.review.frames.length, 2);
  assert.equal(current.composition.digest, composition.digest);
  assert.notEqual(current.hyperframesCheck.sha256, previous.hyperframesCheck.sha256);
  assert.notEqual(current.frames[0].sha256, previous.frames[0].sha256);
});

test('ocr-assisted screen review rejects a missing OCR report while manual review remains available', async () => {
  const fixture = await makeScreenFixture('screen-ocr-missing');
  const initialized = await initializeScreenTextReview(fixture);
  await assert.rejects(
    () => saveScreenTextReview({
      ...fixture,
      stage: reviewStage,
      rawInput: {
        checklist: checklist(screenTextReviewChecklistKeys),
        frames: acceptedItems(initialized.review.frames),
        reviewMode: 'ocr-assisted',
        notes: 'OCR was requested.',
      },
      reviewer: 'screen-reviewer',
    }),
    /ocr is unavailable or stale/i,
  );
  const view = await buildScreenTextReview(fixture);
  assert.equal(view.ocr.status, 'unavailable');
  assert.equal(view.review.reviewMode, 'manual');
});

test('ocr report mutation invalidates an OCR-assisted screen approval', async () => {
  const fixture = await makeScreenFixture('screen-ocr-mutated');
  const initialized = await initializeScreenTextReview(fixture);
  const frameSetPath = path.join(fixture.formalRoot, 'qa', 'screen-text-frame-set.json');
  const frameSet = JSON.parse(await fs.readFile(frameSetPath, 'utf8'));
  const checkSha256 = await sha256File(fixture.checkPath);
  const ocrPath = await writeJson(fixture.formalRoot, 'qa/ocr-report.json', {
    schemaVersion: 'autovideo-ocr-report/v1',
    projectId: fixture.projectId,
    status: 'passed',
    generatedAt: new Date().toISOString(),
    engine: {name: 'PaddleOCR', version: 'test-1.0.0', runtime: 'test', license: 'Apache-2.0'},
    compositionDigest: fixture.composition.digest,
    frameSetDigest: frameSet.frameSetDigest,
    hyperframesCheckSha256: checkSha256,
    bindings: {
      composition: fixture.composition,
      frameSet: {path: 'qa/screen-text-frame-set.json', sha256: await sha256File(frameSetPath), digest: frameSet.frameSetDigest},
      hyperframesCheck: frameSet.hyperframesCheck,
    },
    confidencePolicy: {minimum: 0.55, lowConfidenceDisposition: 'unresolved'},
    unresolvedCount: 0,
    issues: [],
    frames: frameSet.frames.map((frame) => ({
      id: frame.id,
      path: frame.path,
      sha256: frame.sha256,
      status: 'passed',
      recognizedText: 'Frame text',
      detectionCount: 1,
      minimumConfidence: 0.99,
      elapsedMs: 1,
      detections: [{text: 'Frame text', confidence: 0.99, polygon: [[0, 0], [10, 0], [10, 10], [0, 10]]}],
      issues: [],
    })),
  });
  const input = {
    checklist: checklist(screenTextReviewChecklistKeys),
    frames: acceptedItems(initialized.review.frames),
    reviewMode: 'ocr-assisted',
    notes: 'Every current frame and OCR result was reviewed.',
  };
  await saveScreenTextReview({...fixture, stage: reviewStage, rawInput: input, reviewer: 'screen-reviewer'});
  await approveScreenTextReview({...fixture, stage: reviewStage, reviewer: 'screen-reviewer'});
  assert.equal((await buildScreenTextReview(fixture)).review.status, 'approved');

  const ocr = JSON.parse(await fs.readFile(ocrPath, 'utf8'));
  await fs.writeFile(ocrPath, serialize({...ocr, auditNote: 'Changed after approval.'}), 'utf8');

  const invalidated = await buildScreenTextReview(fixture);
  assert.equal(invalidated.ocr.status, 'passed');
  assert.equal(invalidated.review.status, 'stale');
  assert.equal(invalidated.approval, null);
});

test('reopening a text review archives and removes its formal approval', async (t) => {
  await t.test('subtitle approval', async () => {
    const fixture = await makeSubtitleFixture('subtitle-reopen');
    const approved = await approveSubtitles(fixture);
    const approvalPath = path.join(fixture.formalRoot, 'qa', 'subtitle-human-approval.json');
    const approvalBytes = await fs.readFile(approvalPath);

    await reopenTextReview({formalRoot: fixture.formalRoot, stageId: 'subtitle-review'});

    await assert.rejects(() => fs.access(approvalPath), {code: 'ENOENT'});
    const historyDir = path.join(fixture.formalRoot, 'qa', 'history');
    const archived = (await fs.readdir(historyDir)).filter((name) => name.endsWith('subtitle-human-approval.json'));
    assert.equal(archived.length, 1);
    assert.deepEqual(await fs.readFile(path.join(historyDir, archived[0])), approvalBytes);
    assert.equal(approved.approval.status, 'approved');
  });

  await t.test('screen approval', async () => {
    const fixture = await makeScreenFixture('screen-reopen');
    await approveManualScreenText(fixture);
    const approvalPath = path.join(fixture.formalRoot, 'qa', 'screen-text-human-approval.json');
    const approvalBytes = await fs.readFile(approvalPath);

    await reopenTextReview({formalRoot: fixture.formalRoot, stageId: 'screen-text-review'});

    await assert.rejects(() => fs.access(approvalPath), {code: 'ENOENT'});
    const historyDir = path.join(fixture.formalRoot, 'qa', 'history');
    const archived = (await fs.readdir(historyDir)).filter((name) => name.endsWith('screen-text-human-approval.json'));
    assert.equal(archived.length, 1);
    assert.deepEqual(await fs.readFile(path.join(historyDir, archived[0])), approvalBytes);
  });
});

test('screen approval project, scope, and binding tampering invalidate approval', async (t) => {
  const cases = [
    ['project identity', (approval) => ({...approval, projectId: 'another-project'})],
    ['approval scope', (approval) => ({...approval, approvalScope: 'technical-only'})],
    ['evidence bindings', (approval) => ({
      ...approval,
      bindings: {
        ...approval.bindings,
        composition: {...approval.bindings.composition, digest: sha256('tampered-composition-binding')},
      },
    })],
  ];
  for (const [label, mutate] of cases) {
    await t.test(label, async () => {
      const fixture = await makeScreenFixture(`screen-tampered-${label.replaceAll(' ', '-')}`);
      await approveManualScreenText(fixture);
      const approvalPath = path.join(fixture.formalRoot, 'qa', 'screen-text-human-approval.json');
      const approval = JSON.parse(await fs.readFile(approvalPath, 'utf8'));
      await fs.writeFile(approvalPath, serialize(mutate(approval)), 'utf8');

      const invalidated = await buildScreenTextReview(fixture);
      assert.equal(invalidated.review.status, 'ready-for-approval');
      assert.equal(invalidated.approval, null);
    });
  }
});

test('screen approval is invalidated by composition, check, or frame changes', async (t) => {
  await t.test('composition digest changes', async () => {
    const fixture = await makeScreenFixture('screen-stale-composition');
    await approveManualScreenText(fixture);
    const changedComposition = {...fixture.composition, digest: sha256('changed-composition')};
    const check = JSON.parse(await fs.readFile(fixture.checkPath, 'utf8'));
    check.autoVideo.compositionDigest = changedComposition.digest;
    await fs.writeFile(fixture.checkPath, serialize(check), 'utf8');
    await assert.rejects(
      () => buildScreenTextReview({...fixture, composition: changedComposition}),
      /frame-set manifest is missing, stale, or malformed/i,
    );
  });

  await t.test('HyperFrames check receipt changes', async () => {
    const fixture = await makeScreenFixture('screen-stale-check');
    await approveManualScreenText(fixture);
    const check = JSON.parse(await fs.readFile(fixture.checkPath, 'utf8'));
    check.auditNonce = 'new-check-receipt';
    await fs.writeFile(fixture.checkPath, serialize(check), 'utf8');
    await assert.rejects(
      () => buildScreenTextReview(fixture),
      /frame-set manifest is missing, stale, or malformed/i,
    );
  });

  await t.test('review frame bytes change', async () => {
    const fixture = await makeScreenFixture('screen-stale-frame');
    await approveManualScreenText(fixture);
    await fs.appendFile(
      path.join(fixture.formalRoot, 'production', 'hyperframes', 'snapshots', 'cue-at-0.5s.png'),
      '-changed',
    );
    await assert.rejects(
      () => buildScreenTextReview(fixture),
      /screen-text frame changed after sampling/i,
    );
  });
});
