export const assertGenericApprovalAllowed = (stageId) => {
  const dedicated = {
    'pronunciation-review': 'Pronunciation approval must use the dedicated in-context candidate listening endpoint.',
    'voice-final': 'Voice approval must use the dedicated A/B candidate file listening and promotion endpoint.',
    'final-preview': 'Final preview approval must use the dedicated five-item final-review endpoint.',
    'subtitle-review': 'Subtitle approval must use the dedicated cue-by-cue subtitle-review endpoint.',
    'screen-text-review': 'Screen-text approval must use the dedicated frame-by-frame review endpoint.',
  };
  if (dedicated[stageId]) {
    throw new Error(dedicated[stageId]);
  }
};
