const allCandidatesPlayed = (term, candidateIds) => candidateIds
  .every((candidateId) => term.playedCandidateIds?.includes(candidateId));

export const selectPronunciationCandidate = (term, candidateId, candidateIds) => {
  const next = {...term, selectedCandidateId: candidateId};
  return {
    ...next,
    decision: allCandidatesPlayed(next, candidateIds) ? 'accepted' : 'pending',
  };
};

export const markPronunciationCandidatePlayed = (term, candidateId, candidateIds) => {
  const next = {
    ...term,
    playedCandidateIds: [...new Set([...(term.playedCandidateIds || []), candidateId])],
  };
  return {
    ...next,
    decision: next.decision !== 'retake'
      && next.selectedCandidateId
      && allCandidatesPlayed(next, candidateIds)
      ? 'accepted'
      : next.decision,
  };
};
