import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  authorizeRecipeUse,
  loadLifecycleContext,
  validateLifecycleLedger,
} from '../motion-recipe-lifecycle/lifecycle.mjs';

export const MOTION_ACCESS_SCHEMA_VERSION = 'autovideo-motion-recipe-access/v1';
export const INTERNAL_FALLBACK_SCHEMA_VERSION = 'autovideo-motion-internal-fallback-request/v1';

export const motionLifecyclePaths = {
  libraryPath: 'style-library/motion-library/knowledge-explainer-v1.json',
  ledgerPath: 'style-library/motion-library/knowledge-explainer.lifecycle.json',
  catalogPaths: {
    officialRegistry: 'style-library/generated/hyperframes-official-registry.json',
    officialBlueprints: 'style-library/generated/hyperframes-blueprints.json',
    officialMotionRules: 'style-library/generated/hyperframes-motion-rules.json',
  },
};

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256Json = (value) => crypto.createHash('sha256').update(stableJson(value)).digest('hex');

const sha256File = async (filePath) => {
  const hash = crypto.createHash('sha256');
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    for (;;) {
      const {bytesRead} = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
};

const uniqueRecipeRefs = (recipeRefs) => {
  const byId = new Map();
  for (const ref of recipeRefs ?? []) {
    if (!ref?.recipeId || !ref?.version) throw new Error('Motion recipe access requires recipeId and version on every reference.');
    const previous = byId.get(ref.recipeId);
    if (previous && previous.version !== ref.version) {
      throw new Error(`Motion recipe ${ref.recipeId} is referenced at multiple versions.`);
    }
    byId.set(ref.recipeId, {
      libraryId: ref.libraryId ?? null,
      libraryVersion: ref.libraryVersion ?? null,
      recipeId: ref.recipeId,
      version: ref.version,
    });
  }
  return [...byId.values()].sort((left, right) => left.recipeId.localeCompare(right.recipeId));
};

export const collectMotionRecipeRefs = (documents) => uniqueRecipeRefs(
  (Array.isArray(documents) ? documents : [documents])
    .filter(Boolean)
    .flatMap((document) => document.shots ?? document.cueDirectives ?? [])
    .flatMap((item) => item.motionRecipeRefs ?? []),
);

const validateInternalFallbackRequest = ({request, projectId, recipeIds}) => {
  if (!request) return null;
  if (request.schemaVersion !== INTERNAL_FALLBACK_SCHEMA_VERSION) {
    throw new Error(`Unsupported internal motion fallback request ${request.schemaVersion ?? 'missing'}.`);
  }
  if (request.projectId !== projectId
      || request.scope !== 'internal-full-production'
      || request.releaseScope !== 'internal-only'
      || request.publicReleaseBlocked !== true) {
    throw new Error('Internal motion fallback must be project-bound, internal-only, and public-release-blocked.');
  }
  if (!String(request.requestedBy ?? '').trim()
      || !String(request.requestedAt ?? '').trim()
      || !Number.isFinite(Date.parse(request.requestedAt))
      || !String(request.reason ?? '').trim()) {
    throw new Error('Internal motion fallback requires requestedBy, requestedAt, and a concrete reason.');
  }
  const requestedRecipeIds = [...new Set(request.recipeIds ?? [])].sort();
  const usedRecipeIds = [...recipeIds].sort();
  if (!requestedRecipeIds.length || JSON.stringify(requestedRecipeIds) !== JSON.stringify(usedRecipeIds)) {
    throw new Error('Internal motion fallback recipeIds must exactly match the recipes used by this production plan.');
  }
  return {
    schemaVersion: INTERNAL_FALLBACK_SCHEMA_VERSION,
    projectId,
    scope: 'internal-full-production',
    releaseScope: 'internal-only',
    publicReleaseBlocked: true,
    requestedBy: request.requestedBy,
    requestedAt: request.requestedAt,
    reason: request.reason,
    recipeIds: requestedRecipeIds,
  };
};

export const evaluateMotionRecipeAccess = ({
  ledger,
  library,
  ledgerBinding,
  libraryBinding,
  projectId,
  recipeRefs,
  internalFallbackRequest = null,
}) => {
  const refs = uniqueRecipeRefs(recipeRefs);
  const recipesById = new Map((library.recipes ?? []).map((recipe) => [recipe.id, recipe]));
  const entriesById = new Map((ledger.entries ?? []).map((entry) => [entry.recipeId, entry]));
  const fallback = validateInternalFallbackRequest({
    request: internalFallbackRequest,
    projectId,
    recipeIds: refs.map((ref) => ref.recipeId),
  });

  const access = refs.map((ref) => {
    const recipe = recipesById.get(ref.recipeId);
    const entry = entriesById.get(ref.recipeId);
    if (!recipe || !entry) {
      return {
        ...ref,
        definitionSha256: entry?.definitionSha256 ?? null,
        lifecycleState: entry?.state ?? 'unknown',
        allowed: false,
        authorization: 'denied',
        reason: 'unknown-recipe',
        approvalReceiptRefs: [],
      };
    }
    const versionMatches = recipe.version === ref.version && entry.recipeVersion === ref.version;
    const libraryMatches = (!ref.libraryId || ref.libraryId === library.libraryId)
      && (!ref.libraryVersion || ref.libraryVersion === library.version);
    if (!versionMatches || !libraryMatches) {
      return {
        ...ref,
        definitionSha256: entry.definitionSha256,
        lifecycleState: entry.state,
        allowed: false,
        authorization: 'denied',
        reason: 'recipe-binding-mismatch',
        approvalReceiptRefs: [],
      };
    }

    const authorization = authorizeRecipeUse({ledger, recipeId: ref.recipeId, scope: 'project', projectId});
    const projectApproval = entry.projectApprovals.find((item) => item.projectId === projectId) ?? null;
    const fallbackAllows = Boolean(
      fallback?.recipeIds.includes(ref.recipeId)
      && ['candidate', 'probe-passed'].includes(entry.state),
    );
    const allowed = authorization.allowed || fallbackAllows;
    return {
      ...ref,
      definitionSha256: entry.definitionSha256,
      lifecycleState: entry.state,
      allowed,
      authorization: authorization.allowed
        ? authorization.reason === 'template-promoted' ? 'promoted-template' : 'approved-project'
        : fallbackAllows ? 'internal-fallback' : 'denied',
      reason: authorization.allowed ? authorization.reason : fallbackAllows ? 'explicit-internal-only-fallback' : authorization.reason,
      approvalReceiptRefs: authorization.allowed ? structuredClone(entry.receiptRefs ?? []) : [],
      ...(projectApproval ? {
        projectApproval: {
          projectId: projectApproval.projectId,
          approvedBy: projectApproval.approvedBy,
          approvedAt: projectApproval.approvedAt,
          styleSelection: structuredClone(projectApproval.styleSelection),
          probeReceipt: structuredClone(projectApproval.probeReceipt),
        },
      } : {}),
    };
  });

  const base = {
    schemaVersion: MOTION_ACCESS_SCHEMA_VERSION,
    projectId,
    scope: 'full-production',
    library: structuredClone(libraryBinding),
    lifecycleLedger: structuredClone(ledgerBinding),
    authorized: access.length > 0 && access.every((item) => item.allowed),
    releasePolicy: {
      motionApprovalIsPublicationApproval: false,
      publicReleaseBlocked: true,
      internalFallbackUsed: access.some((item) => item.authorization === 'internal-fallback'),
    },
    access,
    internalFallback: fallback
      ? {used: true, request: fallback, requestSha256: sha256Json(fallback)}
      : {used: false},
  };
  return {...base, decisionSha256: sha256Json(base)};
};

export const loadMotionRecipeAccessContext = async ({workspaceRoot}) => {
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const context = await loadLifecycleContext({workspaceRoot: resolvedWorkspaceRoot, ...motionLifecyclePaths});
  const issues = await validateLifecycleLedger({workspaceRoot: resolvedWorkspaceRoot, ...context});
  if (issues.length) {
    throw new Error(`Motion lifecycle ledger is stale or invalid:\n${issues.map((issue) => `- ${issue.code}: ${issue.message}`).join('\n')}`);
  }
  const ledgerPath = path.join(resolvedWorkspaceRoot, motionLifecyclePaths.ledgerPath);
  const libraryPath = path.join(resolvedWorkspaceRoot, motionLifecyclePaths.libraryPath);
  return {
    ...context,
    paths: {ledgerPath, libraryPath},
    ledgerBinding: {
      path: motionLifecyclePaths.ledgerPath,
      sha256: await sha256File(ledgerPath),
      schemaVersion: context.ledger.schemaVersion,
      scope: 'workspace',
    },
    libraryBinding: {
      path: motionLifecyclePaths.libraryPath,
      sha256: await sha256File(libraryPath),
      schemaVersion: context.library.schemaVersion,
      libraryId: context.library.libraryId,
      version: context.library.version,
      scope: 'workspace',
    },
  };
};

export const createMotionRecipeAccessReceipt = async ({
  workspaceRoot,
  projectId,
  recipeRefs,
  internalFallbackRequest = null,
}) => {
  const context = await loadMotionRecipeAccessContext({workspaceRoot});
  return {
    context,
    receipt: evaluateMotionRecipeAccess({
      ...context,
      projectId,
      recipeRefs,
      internalFallbackRequest,
    }),
  };
};

export const assertMotionRecipeAccessReceipt = async ({
  workspaceRoot,
  projectId,
  recipeRefs,
  receipt,
  requireAuthorized = true,
}) => {
  if (receipt?.schemaVersion !== MOTION_ACCESS_SCHEMA_VERSION || receipt.projectId !== projectId) {
    throw new Error('Production manifest has no current project-bound motion lifecycle access receipt.');
  }
  const current = await createMotionRecipeAccessReceipt({
    workspaceRoot,
    projectId,
    recipeRefs,
    internalFallbackRequest: receipt.internalFallback?.request ?? null,
  });
  if (JSON.stringify(current.receipt) !== JSON.stringify(receipt)) {
    throw new Error('Motion lifecycle access receipt is stale for the current ledger, project, or recipe set. Regenerate the production manifest.');
  }
  if (requireAuthorized && !receipt.authorized) {
    const denied = receipt.access.filter((item) => !item.allowed).map((item) => `${item.recipeId}@${item.version} (${item.lifecycleState}: ${item.reason})`);
    throw new Error(`Motion recipes are not authorized for full production: ${denied.join(', ')}. Run bounded probes and explicit project approval first.`);
  }
  return current;
};
