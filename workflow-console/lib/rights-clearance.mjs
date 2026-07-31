import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const sha256File = async (filePath) => sha256(await fs.readFile(filePath));
const isSha256 = (value) => /^[a-f0-9]{64}$/iu.test(String(value ?? ''));
const evidenceKinds = new Set(['license-file', 'rights-attestation', 'terms-snapshot', 'source-receipt']);
const readOptionalJson = async (target) => {
  try {
    return JSON.parse(await fs.readFile(target, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};
const pathExists = (target) => fs.access(target).then(() => true, () => false);

const resolveBinding = ({formalRoot, workspaceRoot, binding}) => {
  const root = binding.scope === 'workspace' ? workspaceRoot : formalRoot;
  if (!root || !binding.path || path.isAbsolute(binding.path)) throw new Error('Rights bindings require a relative project or workspace path.');
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(root, binding.path);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Rights binding leaves its ${binding.scope || 'project'} root: ${binding.path}`);
  }
  return target;
};

const makeBinding = async ({root, scope, relativePath, expectedSha256 = null}) => {
  if (!relativePath || path.isAbsolute(relativePath)) return null;
  const target = path.resolve(root, relativePath);
  if (!await pathExists(target) || !(await fs.stat(target)).isFile()) return null;
  const actual = await sha256File(target);
  return {
    scope,
    path: relativePath.replaceAll('\\', '/'),
    sha256: expectedSha256 && isSha256(expectedSha256) ? expectedSha256 : actual,
    currentAtGeneration: !expectedSha256 || expectedSha256 === actual,
  };
};

const statusFrom = (value) => /^(cleared|public-use-approved)$/iu.test(String(value ?? '')) ? 'cleared' : 'needs-review';
const uniqueBindings = (bindings) => [...new Map(bindings.filter(Boolean).map((binding) => [`${binding.scope}:${binding.path}`, binding])).values()];

const mediaLedgerItems = async (formalRoot) => {
  const ledgerPath = path.join(formalRoot, '.media', 'manifest.jsonl');
  if (!await pathExists(ledgerPath)) return [];
  const records = (await fs.readFile(ledgerPath, 'utf8')).split(/\r?\n/u).filter(Boolean).map(JSON.parse);
  return Promise.all(records.map(async (asset) => ({
    id: `media-${asset.id}`,
    category: asset.type || 'media',
    subject: asset.description || asset.id,
    source: asset.source || asset.provider || 'local media ledger',
    license: asset.license || asset.licenseReceipt || asset.provenance?.licenseReceipt || 'unknown',
    status: 'needs-review',
    notApplicableReason: '',
    assetBindings: uniqueBindings([
      await makeBinding({root: formalRoot, scope: 'project', relativePath: asset.path, expectedSha256: asset.sha256}),
    ]),
    evidence: [],
    notes: 'A catalog/license label is provenance, not a frozen publication-rights credential. Attach a local receipt before clearing.',
  })));
};

const assetManifestItems = async (formalRoot) => {
  const manifest = await readOptionalJson(path.join(formalRoot, 'AssetManifest.json'));
  if (!Array.isArray(manifest?.assets)) return [];
  return Promise.all(manifest.assets.map(async (asset) => {
    const bindings = [];
    if (asset.manifestPath) bindings.push(await makeBinding({root: formalRoot, scope: 'project', relativePath: asset.manifestPath, expectedSha256: asset.sha256}));
    else if (asset.buildReceiptPath) bindings.push(await makeBinding({root: formalRoot, scope: 'project', relativePath: asset.buildReceiptPath, expectedSha256: asset.buildReceiptSha256}));
    else bindings.push(await makeBinding({root: formalRoot, scope: 'project', relativePath: asset.path, expectedSha256: asset.sha256}));
    for (const item of asset.items ?? []) {
      bindings.push(await makeBinding({root: formalRoot, scope: 'project', relativePath: item.path, expectedSha256: item.sha256}));
    }
    return {
      id: `asset-${asset.id}`,
      category: asset.type || 'asset',
      subject: asset.id,
      source: asset.source || asset.path,
      license: asset.license || 'unknown',
      status: statusFrom(asset.rightsStatus),
      notApplicableReason: '',
      assetBindings: uniqueBindings(bindings),
      evidence: [],
      notes: `Imported from AssetManifest rightsStatus=${asset.rightsStatus || 'missing'}. Cleared status still requires a frozen local credential.`,
    };
  }));
};

export const buildPublicationRightsRecord = async ({
  formalRoot,
  workspaceRoot,
  project,
  sources = [],
  templateLock = null,
}) => {
  const inventoryBindings = uniqueBindings([
    await makeBinding({root: formalRoot, scope: 'project', relativePath: 'AssetManifest.json'}),
    await makeBinding({root: formalRoot, scope: 'project', relativePath: '.media/manifest.jsonl'}),
    await makeBinding({root: formalRoot, scope: 'project', relativePath: 'template-lock.json'}),
    await makeBinding({root: formalRoot, scope: 'project', relativePath: 'audio/narration.final.wav'}),
    await makeBinding({root: formalRoot, scope: 'project', relativePath: 'audio/voice.recipe.json'}),
  ]);
  const sourceItems = await Promise.all(sources.map(async (source) => ({
    id: `source-${source.id}`,
    category: 'input-source',
    subject: source.path || source.url || source.id,
    source: source.path || source.url,
    license: source.license || 'unknown',
    status: statusFrom(source.rightsStatus),
    notApplicableReason: '',
    assetBindings: uniqueBindings([
      source.path ? await makeBinding({root: workspaceRoot, scope: 'workspace', relativePath: source.path, expectedSha256: source.sha256}) : null,
    ]),
    evidence: [],
    notes: 'User possession or source registration does not itself prove publication rights.',
  })));
  const templateBindings = [];
  for (const sourceFile of templateLock?.sourceFiles ?? []) {
    if (/POSE_MANIFEST|STYLE_GUIDE|frame\.md$/iu.test(sourceFile.path)) {
      templateBindings.push(await makeBinding({root: workspaceRoot, scope: 'workspace', relativePath: sourceFile.path, expectedSha256: sourceFile.sha256}));
    }
  }
  const voiceBindings = uniqueBindings([
    await makeBinding({root: formalRoot, scope: 'project', relativePath: 'audio/narration.final.wav'}),
    await makeBinding({root: formalRoot, scope: 'project', relativePath: 'audio/voice.recipe.json'}),
  ]);
  const generated = [
    ...sourceItems,
    ...(await mediaLedgerItems(formalRoot)),
    ...(await assetManifestItems(formalRoot)),
    {
      id: 'voice-speaker-rights',
      category: 'voice',
      subject: project.voiceRoute === 'preset14' ? 'CosyVoice built-in 中文女 speaker' : project.voiceRoute,
      source: project.voiceRoute,
      license: 'Code/model license does not prove speaker publication rights.',
      status: 'needs-review',
      notApplicableReason: '',
      assetBindings: voiceBindings,
      evidence: [],
      notes: 'Attach a local commercial/publication rights statement or use a separately licensed voice route.',
    },
    {
      id: 'host-artwork-rights',
      category: 'host-artwork',
      subject: templateLock?.styleId || 'selected host artwork',
      source: templateLock?.sourcePath || 'selected template',
      license: 'User-provided artwork; possession and generation provenance do not imply publication rights.',
      status: 'needs-review',
      notApplicableReason: '',
      assetBindings: uniqueBindings(templateBindings),
      evidence: [],
      notes: 'Attach a local creator/commission/license attestation covering social publication and reuse.',
    },
    {
      id: 'noto-sans-sc-font',
      category: 'font',
      subject: '@fontsource-variable/noto-sans-sc@5.2.10',
      source: 'npm package',
      license: 'OFL-1.1',
      status: 'needs-review',
      notApplicableReason: '',
      assetBindings: [],
      evidence: [],
      notes: 'Freeze the package LICENSE or an equivalent local license receipt before public clearance.',
    },
    {
      id: 'hyperframes-runtime',
      category: 'software',
      subject: 'HyperFrames runtime',
      source: 'https://github.com/heygen-com/hyperframes',
      license: 'Apache-2.0',
      status: 'needs-review',
      notApplicableReason: '',
      assetBindings: [],
      evidence: [],
      notes: 'Freeze the pinned release license receipt before distributing editable source.',
    },
    {
      id: 'ffmpeg-build',
      category: 'build-tool',
      subject: 'Local FFmpeg binary',
      source: 'local build tool only',
      license: 'Build-dependent; binary is not included in the deliverable.',
      status: 'not-applicable',
      notApplicableReason: 'The FFmpeg executable is used locally and is not copied into the video or standard delivery package.',
      assetBindings: [],
      evidence: [],
      notes: '',
    },
  ];
  const items = [...new Map(generated.map((item) => [item.id, item])).values()];
  return {
    schemaVersion: 'autovideo-publication-rights/v2',
    projectId: project.id,
    declaration: project.publicationRights,
    notes: project.rightsNotes,
    generatedAt: new Date().toISOString(),
    inventoryBindings,
    items,
    policy: {
      publicRelease: 'Every item must be cleared or not-applicable. Cleared items require at least one hash-bound local evidence file.',
      internalOnly: 'Unresolved items may remain, but every listed asset binding must still match current bytes.',
    },
  };
};

const verifyBindings = async ({bindings, formalRoot, workspaceRoot, label, issues}) => {
  for (const binding of bindings ?? []) {
    if (!['project', 'workspace'].includes(binding.scope) || !binding.path || !isSha256(binding.sha256)) {
      issues.push(`${label} contains a malformed binding.`);
      continue;
    }
    try {
      const target = resolveBinding({formalRoot, workspaceRoot, binding});
      const actual = await sha256File(target);
      if (actual !== binding.sha256) issues.push(`${label} changed: ${binding.scope}:${binding.path}`);
    } catch (error) {
      issues.push(`${label} is unavailable: ${binding.scope}:${binding.path} (${error.message})`);
    }
  }
};

export const validatePublicationRightsRecord = async ({formalRoot, workspaceRoot, projectId, declaration, record}) => {
  const issues = [];
  if (!record || record.projectId !== projectId || record.declaration !== declaration) {
    return {valid: false, publicEligible: false, legacy: false, issues: ['Rights receipt identity or declaration does not match the current project.']};
  }
  if (record.schemaVersion === 'autovideo-publication-rights/v1') {
    return {
      valid: declaration === 'internal-only',
      publicEligible: false,
      legacy: true,
      issues: declaration === 'internal-only' ? [] : ['Legacy rights v1 has no asset/evidence SHA bindings and cannot authorize public release.'],
    };
  }
  if (record.schemaVersion !== 'autovideo-publication-rights/v2' || !Array.isArray(record.items) || !record.items.length) {
    return {valid: false, publicEligible: false, legacy: false, issues: ['Rights receipt must use v2 and contain at least one item.']};
  }
  if (new Set(record.items.map((item) => item.id)).size !== record.items.length) issues.push('Rights items must have unique IDs.');
  await verifyBindings({bindings: record.inventoryBindings, formalRoot, workspaceRoot, label: 'Rights inventory', issues});
  for (const item of record.items) {
    if (!item.id || !['cleared', 'needs-review', 'blocked', 'not-applicable'].includes(item.status)) {
      issues.push('Rights item is missing an ID or valid status.');
      continue;
    }
    await verifyBindings({bindings: item.assetBindings, formalRoot, workspaceRoot, label: `Asset ${item.id}`, issues});
    if (item.status === 'not-applicable' && !String(item.notApplicableReason ?? '').trim()) {
      issues.push(`Not-applicable item ${item.id} requires a reason.`);
    }
    if (item.status === 'cleared') {
      if (/unknown|does not prove|needs.review|inherits source/i.test(String(item.license ?? ''))) {
        issues.push(`Cleared item ${item.id} still has an unresolved license declaration.`);
      }
      if (!Array.isArray(item.evidence) || !item.evidence.length) {
        issues.push(`Cleared item ${item.id} requires a hash-bound local evidence file.`);
      } else {
        if (!item.evidence.some((binding) => evidenceKinds.has(binding.kind))) {
          issues.push(`Cleared item ${item.id} requires a typed license, attestation, terms snapshot, or source receipt.`);
        }
        await verifyBindings({bindings: item.evidence, formalRoot, workspaceRoot, label: `Evidence ${item.id}`, issues});
      }
    }
  }
  const unresolved = record.items.filter((item) => !['cleared', 'not-applicable'].includes(item.status));
  if (declaration === 'cleared' && unresolved.length) issues.push(`Public release still has ${unresolved.length} unresolved rights item(s).`);
  return {
    valid: issues.length === 0,
    publicEligible: declaration === 'cleared' && issues.length === 0,
    legacy: false,
    unresolvedCount: unresolved.length,
    issues,
  };
};

export const assertPublicationRightsCurrent = async (input) => {
  const result = await validatePublicationRightsRecord(input);
  if (!result.valid) throw new Error(`Publication rights receipt is invalid: ${result.issues.join(' ')}`);
  return result;
};
