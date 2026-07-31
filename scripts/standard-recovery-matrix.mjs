import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {standardJobAction, standardStageAction} from './standard-run-policy.mjs';

export const STANDARD_RECOVERY_PHASES = Object.freeze([
  {id: 'tts-candidate', stageId: 'voice-final', humanGate: true},
  {id: 'visual-planning', stageId: 'visual-plan', humanGate: true},
  {id: 'hyperframes-compile', stageId: 'full-production', humanGate: false},
  {id: 'hyperframes-render', stageId: 'render-deliver', humanGate: false},
]);

const scenariosFor = (phase) => [
  {
    id: 'persisted-running-job',
    stage: {status: 'running', jobId: `${phase.stageId}-job`},
    job: {status: 'running'},
    expectedStageAction: 'resume-job',
    expectedJobAction: 'wait',
  },
  {
    id: 'service-recovered-queued-job',
    stage: {status: 'running', jobId: `${phase.stageId}-job`},
    job: {status: 'queued'},
    expectedStageAction: 'resume-job',
    expectedJobAction: 'wait',
  },
  {
    id: 'operator-paused-job',
    stage: {status: 'running', jobId: `${phase.stageId}-job`},
    job: {status: 'paused'},
    expectedStageAction: 'resume-job',
    expectedJobAction: 'wait-for-operator',
  },
  {
    id: 'failed-job-retry',
    stage: {status: 'failed', jobId: null},
    job: {status: 'failed', error: 'injected failure'},
    expectedStageAction: 'generate',
    expectedJobAction: 'failed',
  },
  {
    id: 'canceled-job-retry',
    stage: {status: 'canceled', jobId: null},
    job: {status: 'canceled'},
    expectedStageAction: 'generate',
    expectedJobAction: 'failed',
  },
  {
    id: 'artifact-hash-drift',
    stage: {status: 'stale', jobId: null},
    job: null,
    expectedStageAction: 'generate',
    expectedJobAction: null,
  },
  {
    id: 'completed-current-artifact',
    stage: {status: 'approved', jobId: null},
    job: {status: 'complete'},
    expectedStageAction: 'continue',
    expectedJobAction: 'complete',
  },
  ...(phase.humanGate ? [{
    id: 'generated-human-review-artifact',
    stage: {status: 'needs-review', jobId: null},
    job: {status: 'complete'},
    expectedStageAction: 'wait-for-human',
    expectedJobAction: 'complete',
  }] : []),
];

export const evaluateStandardRecoveryMatrix = () => {
  const phases = STANDARD_RECOVERY_PHASES.map((phase) => {
    const scenarios = scenariosFor(phase).map((scenario) => {
      const stageDecision = standardStageAction({stage: scenario.stage, definition: {humanGate: phase.humanGate}});
      const jobDecision = scenario.job ? standardJobAction(scenario.job) : null;
      const passed = stageDecision.action === scenario.expectedStageAction
        && (scenario.expectedJobAction === null || jobDecision?.action === scenario.expectedJobAction);
      return {
        id: scenario.id,
        passed,
        expected: {stageAction: scenario.expectedStageAction, jobAction: scenario.expectedJobAction},
        actual: {stageAction: stageDecision.action, jobAction: jobDecision?.action ?? null},
      };
    });
    return {...phase, passed: scenarios.every((scenario) => scenario.passed), scenarios};
  });
  return {
    schemaVersion: 'autovideo-standard-recovery-matrix/v1',
    passed: phases.every((phase) => phase.passed),
    phaseCount: phases.length,
    scenarioCount: phases.reduce((total, phase) => total + phase.scenarios.length, 0),
    evidenceScope: 'orchestration-contract-only',
    doesNotProve: ['real-tts-process-interruption', 'real-codex-planning-interruption', 'real-hyperframes-compile-process-interruption', 'real-hyperframes-render-process-interruption'],
    phases,
  };
};

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const report = evaluateStandardRecoveryMatrix();
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
