export const pronunciationGateAction = (stage) => {
  if (stage?.status === 'approved') return 'continue';
  if (stage?.status === 'needs-review') return 'wait-for-human';
  return 'generate-or-resume';
};

export const standardStageAction = ({stage, definition}) => {
  if (!stage) return {action: 'blocked', reason: 'stage state is missing'};
  if (stage.status === 'approved') return {action: 'continue', reason: 'stage is approved'};
  if (stage.status === 'running') {
    return stage.jobId
      ? {action: 'resume-job', reason: 'persistent job is still active', jobId: stage.jobId}
      : {action: 'blocked', reason: 'running stage has no persistent job id'};
  }
  if (stage.status === 'needs-review') {
    return definition?.humanGate === true
      ? {action: 'wait-for-human', reason: 'generated artifact requires explicit human review'}
      : {action: 'blocked', reason: 'non-human stage unexpectedly requires review'};
  }
  if (['not-started', 'stale', 'failed', 'canceled'].includes(stage.status)) {
    return {action: 'generate', reason: stage.status};
  }
  return {action: 'blocked', reason: `unsupported stage status: ${stage.status ?? 'missing'}`};
};

export const standardJobAction = (job) => {
  if (!job) return {action: 'blocked', reason: 'job receipt is missing'};
  if (job.status === 'complete') return {action: 'complete', reason: 'job completed'};
  if (job.status === 'paused') return {action: 'wait-for-operator', reason: 'job is paused'};
  if (['queued', 'running', 'cancel-requested'].includes(job.status)) {
    return {action: 'wait', reason: `job is ${job.status}`};
  }
  if (['failed', 'canceled'].includes(job.status)) {
    return {action: 'failed', reason: job.error || `job ended as ${job.status}`};
  }
  return {action: 'blocked', reason: `unsupported job status: ${job.status ?? 'missing'}`};
};
