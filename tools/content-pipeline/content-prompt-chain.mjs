import {
  assertContract,
  evidenceClaimKind,
  evidenceSourceIds,
  validateEvidence,
  validateSpokenRewrite,
} from './content-contract.mjs';
import {canonicalJsonSha256, graphemeLength} from './content-regression.mjs';

const sameValues = (left, right) => left.length === right.length
  && [...left].sort().every((value, index) => value === [...right].sort()[index]);

const sectionMap = (sections) => new Map(sections.map((section) => [section.id, section]));

export const parseTargetSeconds = (value) => {
  const match = String(value ?? '').match(/(?:^|[^0-9])(\d+(?:\.\d+)?)(?:\s*(?:s|sec|secs|second|seconds|秒))?(?:$|[^0-9])/iu);
  const seconds = match ? Number(match[1]) : Number.NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Target duration must contain a positive number of seconds: ${value}`);
  return seconds;
};

const assertPromptReceipt = (value, stage) => {
  if (value?.id !== stage.id || value?.sha256 !== stage.promptSha256) {
    throw new Error(`${stage.id} artifact is not bound to the current prompt bytes.`);
  }
};

export const assertEvidenceArtifact = async ({evidence, projectId, sources, suitability, stage}) => {
  await validateEvidence(evidence);
  if (evidence.projectId !== projectId
    || evidence.sourceRegisterSha256 !== canonicalJsonSha256(sources)
    || evidence.suitabilitySha256 !== canonicalJsonSha256(suitability)) {
    throw new Error('Evidence artifact is not bound to the current project, sources, and suitability bytes.');
  }
  assertPromptReceipt(evidence.prompt, stage);
  return evidence;
};

export const assertContentOutline = async ({outline, projectId, evidence, stage, targetSeconds}) => {
  await validateEvidence(evidence);
  await assertContract('content-outline.schema.json', outline, 'content outline');
  if (outline.projectId !== projectId || outline.evidenceSha256 !== canonicalJsonSha256(evidence)) {
    throw new Error('Content outline is not bound to the current project and evidence bytes.');
  }
  assertPromptReceipt(outline.prompt, stage);
  if (outline.targetSeconds !== targetSeconds) throw new Error('Content outline target duration is stale.');
  const claims = new Map(evidence.claims.map((claim) => [claim.id, claim]));
  const sectionIds = outline.sections.map((section) => section.id);
  if (new Set(sectionIds).size !== sectionIds.length) throw new Error('Content outline section IDs must be unique.');
  for (const section of outline.sections) {
    if (section.kind === 'transition' && (section.claimIds.length || section.sourceIds.length)) {
      throw new Error(`${section.id} transition cannot carry claims or sources.`);
    }
    if (section.kind !== 'transition' && !section.claimIds.length) throw new Error(`${section.id} must bind at least one claim.`);
    for (const claimId of section.claimIds) {
      const claim = claims.get(claimId);
      if (!claim) throw new Error(`${section.id} references unknown claim ${claimId}.`);
      for (const sourceId of evidenceSourceIds(claim)) {
        if (!section.sourceIds.includes(sourceId)) throw new Error(`${section.id} does not bind source ${sourceId}.`);
      }
      if (evidenceClaimKind(claim) === 'creator-opinion' && section.kind !== 'creator-opinion') {
        throw new Error(`${claimId} must remain creator-opinion in the outline.`);
      }
      if (evidenceClaimKind(claim) !== 'creator-opinion' && section.kind === 'creator-opinion') {
        throw new Error(`${claimId} cannot be converted into creator-opinion in the outline.`);
      }
    }
  }
  return outline;
};

export const assertNarrationDraft = async ({draft, projectId, evidence, outline, stage}) => {
  await assertContract('script.schema.json', draft, 'narration writer draft');
  if (draft.projectId !== projectId
    || draft.evidenceSha256 !== canonicalJsonSha256(evidence)
    || draft.outlineSha256 !== canonicalJsonSha256(outline)) {
    throw new Error('Narration draft is not bound to the current evidence and outline bytes.');
  }
  assertPromptReceipt(draft.prompt, stage);
  const outlined = sectionMap(outline.sections);
  if (!sameValues(draft.sections.map((section) => section.id), outline.sections.map((section) => section.id))) {
    throw new Error('Narration Writer must preserve the outline section IDs exactly.');
  }
  for (const section of draft.sections) {
    const source = outlined.get(section.id);
    if (section.kind !== source.kind
      || !sameValues(section.claimIds, source.claimIds)
      || !sameValues(section.sourceIds, source.sourceIds)) {
      throw new Error(`${section.id} changed kind, claim IDs, or source IDs from the approved outline.`);
    }
  }
  return draft;
};

export const assertOralizedRewrite = async ({rewrite, projectId, evidence, draft, stage}) => {
  await validateSpokenRewrite(rewrite);
  if (rewrite.projectId !== projectId
    || rewrite.evidenceSha256 !== canonicalJsonSha256(evidence)
    || rewrite.scriptDraftSha256 !== canonicalJsonSha256(draft)) {
    throw new Error('Oralized rewrite is not bound to the current evidence and narration draft bytes.');
  }
  assertPromptReceipt(rewrite.prompt, stage);
  const drafted = sectionMap(draft.sections);
  if (!sameValues(rewrite.sections.map((section) => section.id), draft.sections.map((section) => section.id))) {
    throw new Error('Oralizer must preserve narration draft section IDs exactly.');
  }
  for (const section of rewrite.sections) {
    const source = drafted.get(section.id);
    if (section.kind !== source.kind
      || !sameValues(section.claimIds, source.claimIds)
      || !sameValues(section.sourceIds, source.sourceIds)) {
      throw new Error(`${section.id} changed kind, claim IDs, or source IDs during oralization.`);
    }
  }
  return rewrite;
};

export const assessContentDuration = async ({projectId, rewrite, targetSeconds}) => {
  await validateSpokenRewrite(rewrite);
  const toleranceSeconds = Math.max(2, targetSeconds * 0.1);
  const acceptedDensityBand = {min: 3.2, max: 8};
  const issues = [];
  const sections = rewrite.sections.map((section) => {
    const graphemes = graphemeLength(section.narration);
    const graphemesPerSecond = graphemes / section.targetSeconds;
    const passed = graphemesPerSecond >= 2.5 && graphemesPerSecond <= 9;
    if (!passed) issues.push({
      code: 'section-text-density',
      sectionId: section.id,
      message: `${section.id} text density ${graphemesPerSecond.toFixed(2)} is outside 2.5-9 graphemes/s.`,
    });
    return {id: section.id, targetSeconds: section.targetSeconds, graphemes, graphemesPerSecond, passed};
  });
  const budgetSeconds = sections.reduce((sum, section) => sum + section.targetSeconds, 0);
  const narrationGraphemes = sections.reduce((sum, section) => sum + section.graphemes, 0);
  const graphemesPerSecond = narrationGraphemes / targetSeconds;
  if (Math.abs(budgetSeconds - targetSeconds) > toleranceSeconds) {
    issues.push({code: 'duration-budget-drift', message: `Section budget ${budgetSeconds}s misses target ${targetSeconds}s.`});
  }
  if (graphemesPerSecond < acceptedDensityBand.min || graphemesPerSecond > acceptedDensityBand.max) {
    issues.push({code: 'total-text-density', message: `Total text density ${graphemesPerSecond.toFixed(2)} is outside 3.2-8 graphemes/s.`});
  }
  const record = {
    schemaVersion: 'autovideo-content-duration-fit/v1',
    projectId,
    spokenRewriteSha256: canonicalJsonSha256(rewrite),
    ruleVersion: 'zh-cn-text-budget-v1',
    status: issues.length ? 'needs-revision' : 'passed',
    modifiesWording: false,
    targetSeconds,
    toleranceSeconds,
    budgetSeconds,
    narrationGraphemes,
    graphemesPerSecond,
    acceptedDensityBand,
    sections,
    issues,
    assessedAt: new Date().toISOString(),
  };
  await assertContract('content-duration-fit.schema.json', record, 'content duration fit');
  return record;
};

export const assertCurrentDurationFit = async ({record, projectId, rewrite}) => {
  await assertContract('content-duration-fit.schema.json', record, 'content duration fit');
  if (record.projectId !== projectId || record.spokenRewriteSha256 !== canonicalJsonSha256(rewrite)) {
    throw new Error('Duration assessment is stale for the current spoken rewrite.');
  }
  if (record.status !== 'passed') throw new Error('Duration assessment needs revision before final claim verification.');
  return record;
};
