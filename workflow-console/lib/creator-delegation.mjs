import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const CREATOR_DELEGATED_REVIEWER = 'codex-creator-delegated';
export const INTERNAL_AUTONOMOUS_REVIEW_SCOPE = 'internal-autonomous-review';

const sha256File = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');

const resolveInside = (root, relativeTarget) => {
  if (!relativeTarget || path.isAbsolute(relativeTarget)) {
    throw new Error('Creator delegation receipt must be a project-relative path.');
  }
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(root, relativeTarget);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('Creator delegation receipt leaves the formal project root.');
  }
  return resolvedTarget;
};

export const assertCreatorDelegation = async ({
  formalRoot,
  projectId,
  delegationReceipt,
  requiredScopes = [],
}) => {
  const receiptPath = resolveInside(formalRoot, delegationReceipt);
  const [receipt, receiptSha256] = await Promise.all([
    fs.readFile(receiptPath, 'utf8').then(JSON.parse),
    sha256File(receiptPath),
  ]);
  const scopes = Array.isArray(receipt.scope) ? receipt.scope : [];
  if (receipt.schemaVersion !== 'autovideo-creator-delegation/v1'
    || receipt.projectId !== projectId
    || receipt.delegate !== 'codex'
    || !requiredScopes.every((scope) => scopes.includes(scope))
    || receipt.constraints?.publicReleaseAllowed !== false) {
    throw new Error('Creator delegation receipt does not authorize this internal-only simulation.');
  }
  return {
    receipt,
    binding: {
      path: path.relative(formalRoot, receiptPath).replaceAll('\\', '/'),
      sha256: receiptSha256,
    },
  };
};

export const assertNotCreatorDelegatedHumanReview = (reviewer) => {
  if (reviewer === CREATOR_DELEGATED_REVIEWER) {
    throw new Error('Creator-delegated simulation must use the dedicated internal-only simulation endpoint, not a human-review endpoint.');
  }
};
