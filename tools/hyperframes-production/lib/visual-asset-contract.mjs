import {evaluatePrimaryCarrierPayload} from '../../planning-contract/primary-carrier-adapters.mjs';

const PRIMARY_RULES = Object.freeze({
  'evidence-image': {min: 1, max: 1, types: ['image'], roles: ['evidence', 'illustration']},
  'device-surface': {min: 1, max: 1, types: ['image'], roles: ['interface']},
  'data-proof': {min: 1, max: 1, types: ['image'], roles: ['evidence', 'illustration']},
  comparison: {min: 0, max: 2, types: ['image'], roles: ['evidence', 'illustration', 'interface', 'code', 'metaphor']},
  'code-surface': {min: 1, max: 1, types: ['image'], roles: ['code']},
  'object-metaphor': {min: 1, max: 1, types: ['image', 'logo', 'brand'], roles: ['metaphor']},
});

const supportingIcon = (ref, record) => ref.role === 'icon' && record?.type === 'icon';
const ILLUSTRATIVE_ADAPTER_TYPES = new Set(['code-surface', 'device-surface']);

export function evaluateVisualAssetContract({shot, mediaById}) {
  const refs = shot.assetRefs ?? [];
  const rule = PRIMARY_RULES[shot.visualType] ?? null;
  const primary = [];
  const supporting = [];
  const issues = [];
  const carrierAdapter = evaluatePrimaryCarrierPayload({visualType: shot.visualType, carrierPayload: shot.carrierPayload});
  const illustrativeAdapterSatisfied = carrierAdapter.valid
    && carrierAdapter.present
    && shot.carrierPayload?.evidence?.status === 'illustrative-mock'
    && ILLUSTRATIVE_ADAPTER_TYPES.has(shot.visualType);
  const adapterSatisfied = carrierAdapter.verified || illustrativeAdapterSatisfied;
  issues.push(...carrierAdapter.issues);

  for (const ref of refs) {
    const record = mediaById.get(ref.assetId);
    if (!record) {
      issues.push(`asset ${ref.assetId} is not registered in the project media ledger`);
      continue;
    }
    if (supportingIcon(ref, record)) {
      supporting.push({ref, record});
      continue;
    }
    if (ref.role === 'icon' || record.type === 'icon') {
      issues.push(`asset ${ref.assetId} must use both type=icon and role=icon to remain supporting media`);
      continue;
    }
    if (!rule || !rule.types.includes(record.type) || !rule.roles.includes(ref.role)) {
      issues.push(`asset ${ref.assetId} (${record.type}/${ref.role}) cannot be a primary carrier for ${shot.visualType}`);
      continue;
    }
    primary.push({ref, record});
  }

  if (supporting.length > 2) issues.push('at most two supporting icons are allowed per cue');
  if (rule) {
    if (shot.visualType === 'comparison') {
      if (primary.length === 1) issues.push('media comparison requires exactly two primary images; use zero for the text comparison carrier');
      if (primary.length > rule.max) issues.push(`media comparison allows at most ${rule.max} primary images`);
    } else {
      if (primary.length && carrierAdapter.present) issues.push(`${shot.visualType} must use either a frozen primary asset or one adapter payload, not both`);
      if (primary.length < rule.min && !adapterSatisfied) {
        if (supporting.length) issues.push('supporting icons do not satisfy the required primary visual carrier');
        issues.push(`${shot.visualType} requires one frozen primary asset or an allowed adapter payload; data and evidence carriers must remain verified`);
      }
      if (primary.length > rule.max) issues.push(`${shot.visualType} allows at most ${rule.max} primary asset`);
    }
  }

  return {
    visualType: shot.visualType,
    primaryRequired: Boolean(rule && rule.min > 0),
    carrierSatisfied: issues.length === 0 && (primary.length > 0 || adapterSatisfied || !rule || rule.min === 0),
    illustrativeAdapterSatisfied,
    carrierAdapter,
    primary,
    supporting,
    issues,
  };
}

export function assertVisualAssetContracts({shots, mediaById}) {
  for (const shot of shots) {
    const result = evaluateVisualAssetContract({shot, mediaById});
    if (result.issues.length) {
      throw new Error(`${shot.cueId} visual asset contract failed: ${result.issues.join('; ')}.`);
    }
  }
}

export const visualAssetPrimaryRules = PRIMARY_RULES;
