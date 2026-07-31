import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluateStandardRecoveryMatrix} from '../../scripts/standard-recovery-matrix.mjs';

test('standard recovery matrix covers TTS, planning, compile, and render without synthesizing completion', () => {
  const report = evaluateStandardRecoveryMatrix();
  assert.equal(report.schemaVersion, 'autovideo-standard-recovery-matrix/v1');
  assert.equal(report.passed, true);
  assert.equal(report.phaseCount, 4);
  assert.equal(report.scenarioCount, 30);
  assert.deepEqual(report.phases.map((phase) => phase.stageId), ['voice-final', 'visual-plan', 'full-production', 'render-deliver']);
  for (const phase of report.phases) {
    assert.equal(phase.passed, true);
    assert.equal(phase.scenarios.find((scenario) => scenario.id === 'operator-paused-job').actual.jobAction, 'wait-for-operator');
    assert.equal(phase.scenarios.find((scenario) => scenario.id === 'artifact-hash-drift').actual.stageAction, 'generate');
  }
  assert.deepEqual(report.doesNotProve, [
    'real-tts-process-interruption',
    'real-codex-planning-interruption',
    'real-hyperframes-compile-process-interruption',
    'real-hyperframes-render-process-interruption',
  ]);
});
