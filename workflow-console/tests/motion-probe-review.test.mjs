import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  listMotionProbes,
  resolveMotionProbeFile,
  saveMotionProbeReview,
  visualCheckKeys,
} from '../lib/motion-probe-review.mjs';

const writeJson = async (target, value) => {
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const createFixture = async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-motion-probes-'));
  t.after(() => fs.rm(workspaceRoot, {recursive: true, force: true}));
  const libraryRoot = path.join(workspaceRoot, 'style-library', 'motion-library');
  await writeJson(path.join(libraryRoot, 'knowledge-explainer-v1.json'), {
    recipes: [
      {id: 'keyword-handoff', version: '1.0.0', status: 'candidate', purpose: 'Keyword handoff'},
      {id: 'diagram-build', version: '1.0.0', status: 'candidate', purpose: 'Diagram build'},
    ],
  });
  await writeJson(path.join(libraryRoot, 'knowledge-explainer.lifecycle.json'), {
    entries: [
      {recipeId: 'keyword-handoff', recipeVersion: '1.0.0', definitionSha256: 'definition-keyword-v1', state: 'candidate'},
      {recipeId: 'diagram-build', recipeVersion: '1.0.0', definitionSha256: 'definition-diagram-v1', state: 'candidate'},
    ],
  });

  const canonicalId = 'E01-keyword-handoff-probe';
  const canonicalRoot = path.join(workspaceRoot, 'experiments', canonicalId);
  const canonicalVideoPath = `experiments/${canonicalId}/renders/keyword-handoff-probe.mp4`;
  const canonicalContactPath = `experiments/${canonicalId}/snapshots/contact-sheet.jpg`;
  await fs.mkdir(path.join(canonicalRoot, 'renders'), {recursive: true});
  await fs.mkdir(path.join(canonicalRoot, 'snapshots'), {recursive: true});
  await fs.writeFile(path.join(workspaceRoot, canonicalVideoPath), 'video-v1');
  await fs.writeFile(path.join(workspaceRoot, canonicalContactPath), 'contact-v1');
  await writeJson(path.join(canonicalRoot, 'lifecycle-evidence.draft.json'), {
    schemaVersion: 'autovideo-motion-recipe-lifecycle-evidence/v1',
    recipeId: 'keyword-handoff',
    recipeVersion: '1.0.0',
    requestedState: 'probe-passed',
    probe: {
      kind: 'motion-probe',
      durationSeconds: 6,
      invariantAudit: {passed: true, checks: {lightApricotBackground: true}},
      stills: [{path: canonicalContactPath}],
      motionProbe: {path: canonicalVideoPath},
      hyperframesCheck: {ok: true, strict: true, findingCount: 0},
      officialReuseObserved: [{kind: 'official-motion-rule', id: 'scale-swap-transition'}],
      visualReview: null,
    },
    gateResults: [{id: 'probe.visual-review', passed: false, details: null}],
    blockedReasons: ['missing-visual-review'],
  });

  const legacyId = 'E02-diagram-build-probe';
  const legacyRoot = path.join(workspaceRoot, 'experiments', legacyId);
  await fs.mkdir(path.join(legacyRoot, 'renders'), {recursive: true});
  await fs.mkdir(path.join(legacyRoot, 'snapshots'), {recursive: true});
  await fs.writeFile(path.join(legacyRoot, 'renders', 'diagram-build-probe.mp4'), 'legacy-video-v1');
  await fs.writeFile(path.join(legacyRoot, 'snapshots', 'contact-sheet.jpg'), 'legacy-contact-v1');
  await writeJson(path.join(legacyRoot, 'lifecycle-evidence.draft.json'), {
    schemaVersion: 'autovideo-recipe-lifecycle-evidence/v1',
    recipeId: 'diagram-build@1.0.0',
    render: 'renders/diagram-build-probe.mp4',
    stillContactSheet: 'snapshots/contact-sheet.jpg',
  });
  await writeJson(path.join(legacyRoot, 'INVARIANT_AUDIT.json'), {
    status: 'candidate',
    composition: {width: 1920, height: 1080, rootDurationSeconds: 6},
    brandShell: {background: '#F2DFC7', hostAssetPath: '.media/images/host.png', hostZone: 'host.left', captionZone: 'caption'},
    camera: {scope: 'content-world-only', contentZone: 'content.right'},
    automatedEvidence: {
      strictCheck: {ok: true, strict: true, findingCount: 0},
      render: {path: 'renders/diagram-build-probe.mp4', durationSeconds: 6},
      contactSheet: 'snapshots/contact-sheet.jpg',
    },
  });
  await writeJson(path.join(legacyRoot, 'SOURCE_RECEIPT.json'), {
    recipe: {id: 'diagram-build', version: '1.0.0'},
    sources: [{id: 'flowchart', kind: 'official-registry-block'}],
  });

  return {workspaceRoot, canonicalId, canonicalRoot, canonicalVideoPath, legacyId, legacyRoot};
};

const allChecks = (value) => Object.fromEntries(visualCheckKeys.map((key) => [key, value]));

test('probe catalog recognizes canonical and legacy evidence without promoting either recipe', async (t) => {
  const fixture = await createFixture(t);
  const probes = await listMotionProbes(fixture);
  assert.equal(probes.length, 2);
  const canonical = probes.find((probe) => probe.id === fixture.canonicalId);
  const legacy = probes.find((probe) => probe.id === fixture.legacyId);
  assert.equal(canonical.canonicalEvidence, true);
  assert.equal(legacy.canonicalEvidence, false);
  assert.equal(legacy.recipeId, 'diagram-build');
  assert.equal(canonical.technicalReady, true);
  assert.equal(legacy.technicalReady, true);
  assert.equal(canonical.status, 'candidate');
  assert.equal(legacy.status, 'candidate');
});

test('early receipt with render QA and direct invariant audit is technically ready', async (t) => {
  const fixture = await createFixture(t);
  const root = fixture.legacyRoot;
  await writeJson(path.join(root, 'lifecycle-evidence.draft.json'), {
    schemaVersion: 'autovideo-recipe-lifecycle-evidence/v1',
    projectId: fixture.legacyId,
    recipeId: 'diagram-build@1.0.0',
    evidenceStatus: 'draft',
    candidateOnly: true,
    strictCheck: 'check.strict.log',
    render: 'renders/diagram-build-probe.mp4',
    renderQa: 'RENDER_QA.json',
    stillContactSheet: 'snapshots/contact-sheet.jpg',
  });
  await writeJson(path.join(root, 'INVARIANT_AUDIT.json'), {
    schemaVersion: 'autovideo-motion-probe-invariant-audit/v1',
    passed: true,
    checks: {
      landscape16x9: true,
      lightApricotBackground: true,
      hostLeft: true,
      contentRight: true,
      captionPersistent: true,
      contentWorldOnlyCamera: true,
    },
  });
  await writeJson(path.join(root, 'RENDER_QA.json'), {
    artifact: {path: 'renders/diagram-build-probe.mp4', durationSeconds: 6},
    checks: {strictHyperframesCheckPassed: true},
  });

  const probe = (await listMotionProbes(fixture)).find((item) => item.id === fixture.legacyId);
  assert.equal(probe.canonicalEvidence, false);
  assert.equal(probe.evidenceFormat, 'legacy');
  assert.equal(probe.technicalReady, true);
  assert.equal(probe.durationSeconds, 6);
  assert.equal(probe.strictCheck.ok, true);
  assert.equal(probe.invariantAudit.passed, true);
  assert.equal(probe.status, 'candidate');
});

test('canonical review is versioned, hash-bound, and becomes stale after rerender', async (t) => {
  const fixture = await createFixture(t);
  const pending = await saveMotionProbeReview({
    ...fixture,
    input: {probeId: fixture.canonicalId, decision: 'pending', checks: allChecks(false), notes: ''},
    reviewer: 'human-reviewer',
  });
  assert.equal(pending.review.revision, 1);
  assert.equal(pending.review.lifecycleMutationApplied, false);
  assert.equal(pending.evidenceUpdate.updated, true);

  const passed = await saveMotionProbeReview({
    ...fixture,
    input: {probeId: fixture.canonicalId, decision: 'passed', checks: allChecks(true), notes: 'Visual review complete.'},
    reviewer: 'human-reviewer',
  });
  assert.equal(passed.review.revision, 2);
  const evidence = JSON.parse(await fs.readFile(path.join(fixture.canonicalRoot, 'lifecycle-evidence.draft.json'), 'utf8'));
  assert.equal(evidence.probe.visualReview.status, 'passed');
  assert.equal(evidence.gateResults.find((gate) => gate.id === 'probe.visual-review').passed, true);
  assert.deepEqual(evidence.blockedReasons, []);

  await fs.appendFile(path.join(fixture.workspaceRoot, fixture.canonicalVideoPath), '-rerendered');
  const [probeAfterRerender] = (await listMotionProbes(fixture)).filter((probe) => probe.id === fixture.canonicalId);
  assert.equal(probeAfterRerender.review, null);
  assert.equal(probeAfterRerender.reviewStale, true);
  assert.equal(probeAfterRerender.latestReview.revision, 2);
});

test('legacy review writes an independent receipt and never rewrites legacy lifecycle evidence', async (t) => {
  const fixture = await createFixture(t);
  const originalEvidence = await fs.readFile(path.join(fixture.legacyRoot, 'lifecycle-evidence.draft.json'), 'utf8');
  const result = await saveMotionProbeReview({
    ...fixture,
    input: {probeId: fixture.legacyId, decision: 'failed', checks: allChecks(false), notes: 'Connector rhythm is too abrupt.'},
  });
  assert.equal(result.evidenceUpdate.updated, false);
  assert.equal(result.evidenceUpdate.reason, 'legacy-evidence-format');
  assert.equal(await fs.readFile(path.join(fixture.legacyRoot, 'lifecycle-evidence.draft.json'), 'utf8'), originalEvidence);
  const receipt = JSON.parse(await fs.readFile(path.join(fixture.legacyRoot, 'review', 'probe-human-review.json'), 'utf8'));
  assert.equal(receipt.review.decision, 'failed');
  assert.equal(receipt.lifecycleMutationApplied, false);
});

test('failed reviews require notes and probe file access is allowlisted', async (t) => {
  const fixture = await createFixture(t);
  await assert.rejects(
    saveMotionProbeReview({...fixture, input: {probeId: fixture.canonicalId, decision: 'failed', checks: allChecks(false), notes: ''}}),
    /actionable review note/,
  );
  const resolved = await resolveMotionProbeFile({...fixture, probeId: fixture.canonicalId, relativePath: fixture.canonicalVideoPath});
  assert.equal(resolved.target, path.join(fixture.workspaceRoot, fixture.canonicalVideoPath));
  await assert.rejects(
    resolveMotionProbeFile({...fixture, probeId: fixture.canonicalId, relativePath: 'style-library/motion-library/knowledge-explainer-v1.json'}),
    /not exposed/,
  );
});
