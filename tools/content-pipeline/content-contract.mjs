import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {assertSchema} from '../planning-contract/schema-validator.mjs';

const TOOL_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCHEMA_ROOT = path.join(TOOL_ROOT, 'workflow-console', 'schemas');

export const SUPPORTED_SOURCE_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.jsonl', '.csv', '.tsv', '.html', '.htm', '.pdf', '.docx', '.pptx', '.xlsx',
  '.png', '.jpg', '.jpeg', '.webp', '.wav', '.mp3', '.m4a', '.aac', '.flac', '.mp4', '.mov', '.webm',
]);

const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.jsonl', '.csv', '.tsv', '.html', '.htm']);
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.docx', '.pptx', '.xlsx']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const AUDIO_VIDEO_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.aac', '.flac', '.mp4', '.mov', '.webm']);
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', '.venv', 'venv', 'dist', 'build', '__pycache__', '.codex', 'workflow-console']);
const SENSITIVE_NAME = /(^|[._-])(credential|credentials|secret|secrets|token|tokens|api[-_]?key|oauth|service[-_]?account|private[-_]?key)([._-]|$)/i;
const SENSITIVE_JSON_KEY = /(password|passwd|secret|token|authorization|api.?key|access.?key|private.?key|client.?secret|refresh.?token)/i;

const schemaCache = new Map();

export const normalizeText = (value) => String(value ?? '').replace(/\r\n/g, '\n').trim();
export const canonicalExactQuote = (value) => String(value ?? '').replace(/\r\n?/g, '\n').normalize('NFC');
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const sha256File = async (filePath) => sha256(await fs.readFile(filePath));
export const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

export const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));

export const writeJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), {recursive: true});
  await fs.writeFile(filePath, stableJson(value), 'utf8');
};

export const loadSchema = async (name) => {
  if (!schemaCache.has(name)) schemaCache.set(name, await readJson(path.join(SCHEMA_ROOT, name)));
  return schemaCache.get(name);
};

export const assertContract = async (name, value, label = name) => assertSchema(await loadSchema(name), value, label);

const isInside = (root, candidate) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const containsSensitiveJsonKeys = (value, depth = 0) => {
  if (depth > 8 || value == null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => containsSensitiveJsonKeys(item, depth + 1));
  return Object.entries(value).some(([key, child]) => SENSITIVE_JSON_KEY.test(key) || containsSensitiveJsonKeys(child, depth + 1));
};

const sourceFileSafety = async (filePath) => {
  if (SENSITIVE_NAME.test(path.basename(filePath))) return {safe: false, reason: 'sensitive filename'};
  if (path.extname(filePath).toLowerCase() !== '.json') return {safe: true};
  const stats = await fs.stat(filePath);
  if (stats.size > 2_000_000) return {safe: true};
  try {
    if (containsSensitiveJsonKeys(JSON.parse(await fs.readFile(filePath, 'utf8')))) {
      return {safe: false, reason: 'credential-like JSON keys'};
    }
  } catch {
    // Downstream extraction owns malformed content diagnostics.
  }
  return {safe: true};
};

const collectFiles = async ({entryPath, workspaceRoot, files, skipped, limit}) => {
  if (files.length >= limit) return;
  const stats = await fs.lstat(entryPath);
  const relativePath = path.relative(workspaceRoot, entryPath).replaceAll('\\', '/');
  if (stats.isSymbolicLink()) {
    skipped.push({path: relativePath, reason: 'symbolic link or junction'});
    return;
  }
  if (stats.isFile()) {
    const extension = path.extname(entryPath).toLowerCase();
    if (!SUPPORTED_SOURCE_EXTENSIONS.has(extension)) {
      skipped.push({path: relativePath, reason: 'unsupported extension'});
      return;
    }
    const safety = await sourceFileSafety(entryPath);
    if (safety.safe) files.push({filePath: entryPath, stats});
    else skipped.push({path: relativePath, reason: safety.reason});
    return;
  }
  if (!stats.isDirectory()) return;
  for (const entry of await fs.readdir(entryPath, {withFileTypes: true})) {
    if (files.length >= limit) break;
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    await collectFiles({entryPath: path.join(entryPath, entry.name), workspaceRoot, files, skipped, limit});
  }
};

export const registerSources = async ({projectId, materialsPath, workspaceRoot = TOOL_ROOT, limit = 200}) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId ?? '')) throw new Error('Invalid content project ID.');
  const sourceRoot = path.resolve(workspaceRoot, materialsPath);
  if (!isInside(workspaceRoot, sourceRoot)) throw new Error('Content materials must stay inside the AutoVideo workspace.');
  await fs.access(sourceRoot);
  const files = [];
  const skipped = [];
  await collectFiles({entryPath: sourceRoot, workspaceRoot, files, skipped, limit});
  if (!files.length) throw new Error('No supported, non-sensitive source files were found.');
  const sources = [];
  for (const [index, item] of files.entries()) {
    const digest = await sha256File(item.filePath);
    sources.push({
      id: `source-${String(index + 1).padStart(3, '0')}-${digest.slice(0, 8)}`,
      path: path.relative(workspaceRoot, item.filePath).replaceAll('\\', '/'),
      type: path.extname(item.filePath).slice(1).toLowerCase() || 'unknown',
      bytes: item.stats.size,
      modifiedAt: item.stats.mtime.toISOString(),
      sha256: digest,
      source: 'user-provided',
      license: 'user-provided; publication rights not implied',
      status: 'registered',
    });
  }
  const record = {
    schemaVersion: 'autovideo-sources/v1',
    projectId,
    root: path.relative(workspaceRoot, sourceRoot).replaceAll('\\', '/'),
    generatedAt: new Date().toISOString(),
    sources,
    skipped,
    warnings: [
      ...(files.length >= limit ? [`Source scan stopped at the ${limit}-file safety limit.`] : []),
      ...(skipped.length ? [`Skipped ${skipped.length} unsupported, sensitive, or linked path(s).`] : []),
    ],
  };
  await assertContract('sources.schema.json', record);
  return record;
};

const preparationFor = (source) => {
  const extension = `.${source.type.toLowerCase()}`;
  if (TEXT_EXTENSIONS.has(extension)) return {sourceId: source.id, action: 'none', reason: 'Text can enter claim extraction directly.'};
  if (DOCUMENT_EXTENSIONS.has(extension)) return {sourceId: source.id, action: 'extract-text', reason: 'Structured text extraction is required before claim review.'};
  if (IMAGE_EXTENSIONS.has(extension)) return {sourceId: source.id, action: 'ocr', reason: 'Visible text and context require OCR or manual transcription.'};
  if (AUDIO_VIDEO_EXTENSIONS.has(extension)) return {sourceId: source.id, action: 'transcribe', reason: 'Speech must be transcribed and human-checked before rewriting.'};
  return {sourceId: source.id, action: 'manual-review', reason: 'No deterministic preparation adapter is registered.'};
};

export const diagnoseMaterials = async ({sources, sourcesSha256, requestedRoute = 'materials'}) => {
  await assertContract('sources.schema.json', sources);
  if (!['materials', 'script', 'audio'].includes(requestedRoute)) throw new Error('Requested route must be materials, script, or audio.');
  const preparationActions = sources.sources.map(preparationFor);
  const usableSourceIds = preparationActions.filter((item) => item.action === 'none').map((item) => item.sourceId);
  const hasPreparatoryPath = preparationActions.some((item) => item.action !== 'manual-review');
  const status = usableSourceIds.length ? 'suitable' : hasPreparatoryPath ? 'needs-preparation' : 'unsuitable';
  const blockers = [
    ...(status === 'needs-preparation' ? ['Run the listed extraction, OCR, or transcription actions before spoken rewriting.'] : []),
    ...(status === 'unsuitable' ? ['No registered source can enter a supported preparation route.'] : []),
  ];
  const record = {
    schemaVersion: 'autovideo-material-suitability/v1',
    projectId: sources.projectId,
    sourceRegister: {path: 'sources.json', sha256: sourcesSha256},
    assessmentScope: 'technical-baseline',
    status,
    recommendedRoute: requestedRoute,
    usableSourceIds,
    preparationActions,
    blockers,
    humanReviewRequired: true,
    rewritePolicy: {allowNewFacts: false, requireClaimMapping: true, preserveApprovedWording: true},
    generatedAt: new Date().toISOString(),
  };
  await assertContract('material-suitability.schema.json', record);
  return record;
};

export const evidenceClaimKind = (claim) => claim.claimKind
  ?? (claim.status === 'opinion' ? 'creator-opinion' : 'fact');
export const evidenceSupportStatus = (claim) => claim.supportStatus
  ?? (claim.status === 'disputed' ? 'disputed' : 'supported');
export const evidenceCitations = (claim) => claim.citations
  ?? [{id: `${claim.id}-legacy-citation`, sourceId: claim.sourceId, quote: claim.quote, locator: claim.locator}];
export const evidenceSourceIds = (claim) => [...new Set(evidenceCitations(claim).map((citation) => citation.sourceId))];
export const evidenceQuotes = (claim) => evidenceCitations(claim).map((citation) => citation.quote);
export const bindEvidenceCitationReceipts = (evidence) => {
  if (evidence?.schemaVersion !== 'autovideo-evidence/v2') return evidence;
  return {
    ...evidence,
    claims: evidence.claims.map((claim) => ({
      ...claim,
      citations: claim.citations.map((citation) => ({
        ...citation,
        canonicalQuoteSha256: sha256(canonicalExactQuote(citation.quote)),
      })),
    })),
  };
};

export const validateEvidence = async (evidence) => {
  await assertContract('evidence.schema.json', evidence);
  const ids = evidence.claims.map((claim) => claim.id);
  if (new Set(ids).size !== ids.length) throw new Error('Evidence claim IDs must be unique.');
  if (evidence.schemaVersion === 'autovideo-evidence/v1') {
    if (evidence.protectedAtoms || evidence.terms || evidence.claims.some((claim) => claim.claimKind)) {
      throw new Error('Evidence v1 cannot mix v2 claims, protected atoms, or terms.');
    }
    return evidence;
  }
  if (evidence.schemaVersion !== 'autovideo-evidence/v2') throw new Error('Unsupported evidence schema version.');
  if (!Array.isArray(evidence.protectedAtoms) || !Array.isArray(evidence.terms)
    || evidence.claims.some((claim) => !claim.claimKind || claim.status)) {
    throw new Error('Evidence v2 requires v2 claims, protectedAtoms, and terms.');
  }
  const atomMap = new Map();
  for (const atom of evidence.protectedAtoms) {
    if (atomMap.has(atom.id)) throw new Error(`Duplicate protected atom ID ${atom.id}.`);
    atomMap.set(atom.id, atom);
  }
  const termIds = new Set();
  const termForms = [];
  for (const term of evidence.terms) {
    if (termIds.has(term.id)) throw new Error(`Duplicate term ID ${term.id}.`);
    termIds.add(term.id);
    termForms.push({
      term,
      forms: [term.token, ...term.allowedWrittenForms].map((value) => term.caseSensitive ? value : value.toLowerCase()),
    });
  }
  const citationIds = new Set();
  for (const claim of evidence.claims) {
    const kind = evidenceClaimKind(claim);
    const support = evidenceSupportStatus(claim);
    if (kind === 'fact' && support === 'supported' && !claim.citations.length) {
      throw new Error(`${claim.id} is a supported fact and requires at least one citation.`);
    }
    for (const atomId of claim.protectedAtomIds) {
      if (!atomMap.has(atomId)) throw new Error(`${claim.id} references unknown protected atom ${atomId}.`);
    }
    for (const citation of claim.citations) {
      if (citationIds.has(citation.id)) throw new Error(`Duplicate citation ID ${citation.id}.`);
      citationIds.add(citation.id);
      if (citation.locator.endLine < citation.locator.startLine) {
        throw new Error(`${citation.id} locator endLine precedes startLine.`);
      }
      if (citation.canonicalQuoteSha256 !== sha256(canonicalExactQuote(citation.quote))) {
        throw new Error(`${citation.id} canonical quote SHA-256 is invalid.`);
      }
    }
    const claimText = [claim.statement, ...evidenceQuotes(claim)].join('\n');
    for (const token of protectedAtoms(claimText)) {
      const normalized = normalizedAtom(token);
      const linkedAtom = claim.protectedAtomIds
        .map((atomId) => atomMap.get(atomId))
        .find((atom) => [atom.sourceSurface, atom.canonicalValue, ...atom.allowedNarrationForms]
          .some((form) => normalizedAtom(form) === normalized));
      if (linkedAtom) continue;
      if (/[A-Za-z]/u.test(token)) {
        const covered = termForms.some(({term, forms}) => forms.includes(term.caseSensitive ? token : token.toLowerCase()));
        if (covered) continue;
      }
      throw new Error(`${claim.id} protected token ${token} is missing from its protected atom or term ledger.`);
    }
  }
  return evidence;
};

export const validateSpokenRewrite = async (rewrite) => {
  await assertContract('spoken-rewrite.schema.json', rewrite);
  const ids = rewrite.sections.map((section) => section.id);
  if (new Set(ids).size !== ids.length) throw new Error('Spoken rewrite section IDs must be unique.');
  for (const section of rewrite.sections) {
    if (section.kind === 'sourced' && (!section.claimIds.length || !section.sourceIds.length)) {
      throw new Error(`${section.id} is sourced and must bind at least one claim and source.`);
    }
    if (section.kind === 'creator-opinion' && (!section.sourceIds.length || !section.framing.trim())) {
      throw new Error(`${section.id} creator opinion requires source context and explicit framing.`);
    }
    if (section.kind === 'transition' && section.claimIds.length) {
      throw new Error(`${section.id} transition cannot carry factual claim IDs.`);
    }
  }
  return rewrite;
};

const normalizedForQuote = (value) => normalizeText(value).replace(/\s+/g, ' ');
const protectedAtomPattern = /[A-Za-z][A-Za-z0-9]*(?:[-_.+][A-Za-z0-9]+)*|\d+(?:[.,]\d+)*(?:%|％)?/gu;
const protectedAtoms = (value) => [...String(value ?? '').matchAll(protectedAtomPattern)].map((match) => match[0]);
const normalizedAtom = (value) => /[A-Za-z]/u.test(value) ? value.toLowerCase() : value;
const isPredominantlyChinese = (value) => {
  const text = String(value ?? '');
  const han = (text.match(/\p{Script=Han}/gu) ?? []).length;
  const latin = (text.match(/[A-Za-z]/gu) ?? []).length;
  return han > 0 && han >= latin;
};

export const reviewClaimSources = async ({workspaceRoot = TOOL_ROOT, sources, suitability, evidence, rewrite, bindings}) => {
  await assertContract('sources.schema.json', sources);
  await assertContract('material-suitability.schema.json', suitability);
  await validateEvidence(evidence);
  await validateSpokenRewrite(rewrite);

  const issues = [];
  const issue = (severity, code, message, context = {}) => issues.push({severity, code, ...context, message});
  if (rewrite.projectId !== sources.projectId || suitability.projectId !== sources.projectId) {
    issue('error', 'project-mismatch', 'Sources, suitability, and spoken rewrite must belong to the same project.');
  }
  if (rewrite.sourceRegisterSha256 !== bindings.sourcesSha256 || suitability.sourceRegister.sha256 !== bindings.sourcesSha256) {
    issue('error', 'sources-stale', 'Spoken rewrite or suitability is not bound to the current sources.json.');
  }
  if (rewrite.suitabilitySha256 !== bindings.suitabilitySha256 || rewrite.evidenceSha256 !== bindings.evidenceSha256) {
    issue('error', 'rewrite-input-stale', 'Spoken rewrite is not bound to the current suitability and evidence artifacts.');
  }

  const sourceMap = new Map(sources.sources.map((source) => [source.id, source]));
  const claimMap = new Map(evidence.claims.map((claim) => [claim.id, claim]));
  for (const claim of evidence.claims) {
    for (const citation of evidenceCitations(claim)) {
      const source = sourceMap.get(citation.sourceId);
      const context = {claimId: claim.id, citationId: citation.id, sourceId: citation.sourceId};
      if (!source) {
        issue('error', 'claim-source-missing', `Claim ${claim.id} references unknown source ${citation.sourceId}.`, context);
        continue;
      }
      const sourcePath = path.resolve(workspaceRoot, source.path);
      if (!isInside(workspaceRoot, sourcePath)) {
        issue('error', 'source-path-invalid', `Source ${source.id} leaves the workspace.`, context);
        continue;
      }
      if (await sha256File(sourcePath) !== source.sha256) {
        issue('error', 'source-stale', `Source ${source.id} no longer matches its registered SHA-256.`, context);
        continue;
      }
      const extension = path.extname(sourcePath).toLowerCase();
      if (!TEXT_EXTENSIONS.has(extension)) {
        issue('warning', 'quote-not-machine-verifiable', `Exact quote for ${claim.id} requires human review because ${source.type} is not a direct-text source.`, context);
        continue;
      }
      const rawContent = await fs.readFile(sourcePath, 'utf8');
      if (evidence.schemaVersion === 'autovideo-evidence/v2') {
        const lines = canonicalExactQuote(rawContent).split('\n');
        const {startLine, endLine, occurrence} = citation.locator;
        if (endLine > lines.length) {
          issue('error', 'locator-range-invalid', `${citation.id} line range ${startLine}-${endLine} exceeds ${source.id}.`, context);
          continue;
        }
        const range = lines.slice(startLine - 1, endLine).join('\n');
        const quote = canonicalExactQuote(citation.quote);
        let count = 0;
        let offset = 0;
        while (quote && (offset = range.indexOf(quote, offset)) !== -1) {
          count += 1;
          offset += quote.length;
        }
        if (count < occurrence) {
          issue('error', 'locator-quote-missing', `${citation.id} occurrence ${occurrence} was not found exactly in lines ${startLine}-${endLine}.`, context);
        }
      } else if (!normalizedForQuote(rawContent).includes(normalizedForQuote(citation.quote))) {
        issue('error', 'exact-quote-missing', `Exact quote for ${claim.id} was not found in ${source.id}.`, context);
      }
    }
  }

  for (const section of rewrite.sections) {
    for (const sourceId of section.sourceIds) {
      if (!sourceMap.has(sourceId)) issue('error', 'section-source-missing', `${section.id} references unknown source ${sourceId}.`, {sectionId: section.id, sourceId});
    }
    for (const claimId of section.claimIds) {
      const claim = claimMap.get(claimId);
      if (!claim) {
        issue('error', 'section-claim-missing', `${section.id} references unknown claim ${claimId}.`, {sectionId: section.id, claimId});
        continue;
      }
      for (const sourceId of evidenceSourceIds(claim)) {
        if (!section.sourceIds.includes(sourceId)) {
          issue('error', 'section-claim-source-unbound', `${section.id} must include source ${sourceId} for claim ${claimId}.`, {sectionId: section.id, claimId, sourceId});
        }
      }
      if (evidenceClaimKind(claim) === 'creator-opinion' && section.kind !== 'creator-opinion') {
        issue('error', 'opinion-kind-mismatch', `${section.id} must present opinion claim ${claimId} as creator-opinion.`, {sectionId: section.id, claimId});
      }
      if (evidenceClaimKind(claim) !== 'creator-opinion' && section.kind === 'creator-opinion') {
        issue('error', 'opinion-kind-mismatch', `${section.id} cannot present ${claimId} as creator-opinion.`, {sectionId: section.id, claimId});
      }
      if (evidenceClaimKind(claim) === 'source-opinion' && !section.framing.trim()) {
        issue('error', 'source-opinion-unframed', `${section.id} must attribute source opinion ${claimId}.`, {sectionId: section.id, claimId});
      }
      if (evidenceSupportStatus(claim) === 'disputed' && !section.framing.trim()) {
        issue('error', 'disputed-claim-unframed', `${section.id} must explicitly frame disputed claim ${claimId}.`, {sectionId: section.id, claimId});
      }
    }
    const boundClaims = section.claimIds.map((claimId) => claimMap.get(claimId)).filter(Boolean);
    const allowedAtoms = evidence.schemaVersion === 'autovideo-evidence/v2'
      ? new Set(boundClaims.flatMap((claim) => claim.protectedAtomIds)
        .map((atomId) => evidence.protectedAtoms.find((atom) => atom.id === atomId))
        .filter(Boolean)
        .flatMap((atom) => [atom.sourceSurface, atom.canonicalValue, ...atom.allowedNarrationForms])
        .map(normalizedAtom))
      : new Set(boundClaims
        .flatMap((claim) => protectedAtoms(`${claim.statement}\n${evidenceQuotes(claim).join('\n')}`))
        .map(normalizedAtom));
    if (evidence.schemaVersion === 'autovideo-evidence/v2') {
      const boundText = boundClaims.map((claim) => `${claim.statement}\n${evidenceQuotes(claim).join('\n')}`).join('\n');
      for (const term of evidence.terms) {
        const forms = [term.token, ...term.allowedWrittenForms];
        if (forms.some((form) => term.caseSensitive ? boundText.includes(form) : boundText.toLowerCase().includes(form.toLowerCase()))) {
          for (const form of forms) allowedAtoms.add(normalizedAtom(form));
        }
      }
    }
    if (isPredominantlyChinese(section.narration)) {
      for (const atom of protectedAtoms(`${section.narration}\n${section.onscreen.map((item) => item.text).join('\n')}`)) {
        if (!allowedAtoms.has(normalizedAtom(atom))) {
          issue('error', 'unregistered-protected-atom', `${section.id} introduces protected token ${atom} outside its bound claims.`, {sectionId: section.id});
        }
      }
    }
    for (const item of section.onscreen) {
      if (item.kind !== 'exact_excerpt') continue;
      if (!section.narration.includes(item.text) && !boundClaims.some((claim) => evidenceQuotes(claim).some((quote) => quote.includes(item.text)))) {
        issue('error', 'exact-excerpt-unbound', `${section.id} exact screen excerpt is absent from its narration and bound quotes.`, {sectionId: section.id});
      }
    }
  }

  const errors = issues.filter((item) => item.severity === 'error');
  const warnings = issues.filter((item) => item.severity === 'warning');
  const record = {
    schemaVersion: 'autovideo-claim-source-review/v1',
    projectId: sources.projectId,
    bindings,
    status: errors.length ? 'failed' : warnings.length ? 'needs-human-review' : 'passed',
    checks: {
      registeredSources: !issues.some((item) => ['source-path-invalid', 'source-stale'].includes(item.code)),
      knownClaims: !issues.some((item) => ['section-claim-missing'].includes(item.code)),
      sourceBindings: !issues.some((item) => ['claim-source-missing', 'section-source-missing', 'section-claim-source-unbound'].includes(item.code)),
      exactQuotes: !issues.some((item) => ['exact-quote-missing', 'locator-range-invalid', 'locator-quote-missing'].includes(item.code)),
      sectionPolicies: !issues.some((item) => [
        'disputed-claim-unframed', 'source-opinion-unframed', 'opinion-kind-mismatch', 'unregistered-protected-atom', 'exact-excerpt-unbound',
      ].includes(item.code)),
    },
    issues,
    reviewedAt: new Date().toISOString(),
    reviewerType: 'machine-contract',
  };
  await assertContract('claim-source-review.schema.json', record);
  return record;
};

export const buildApprovedNarration = (rewrite) => `${rewrite.sections.map((section) => section.narration.trim()).join('\n\n')}\n`;

export const buildContentApproval = async ({projectId, bindings, narrationText, reviewer, acceptedWarnings = []}) => {
  if (!reviewer?.trim()) throw new Error('Human reviewer identity is required.');
  const narration = buildApprovedNarration({sections: [{narration: normalizeText(narrationText)}]});
  const record = {
    schemaVersion: 'autovideo-content-approval/v2',
    projectId,
    bindings,
    approvedNarration: {
      path: 'script.approved.txt',
      sha256: sha256(normalizeText(narration)),
      bytes: Buffer.byteLength(narration),
    },
    status: 'approved',
    approvalScope: 'human-review',
    approvedBy: reviewer.trim(),
    approvedAt: new Date().toISOString(),
    wordingPolicy: 'immutable-after-approval',
    acceptedWarnings,
  };
  await assertContract('content-approval.schema.json', record);
  return {record, narration};
};

export const assertContentApprovalForNarration = async ({approval, projectId, narrationText}) => {
  await assertContract('content-approval.schema.json', approval, 'content approval');
  if (approval.projectId !== projectId) throw new Error('Content approval projectId does not match the requested project.');
  if (approval.status !== 'approved' || approval.approvalScope !== 'human-review') {
    throw new Error('NarrationLock requires an explicit human-approved content receipt.');
  }
  const normalizedNarration = normalizeText(narrationText);
  const digest = sha256(normalizedNarration);
  if (approval.approvedNarration.sha256 !== digest) {
    throw new Error('Approved narration text differs from the human approval receipt. Do not silently alter approved wording.');
  }
  const canonicalNarration = `${normalizedNarration}\n`;
  const lineEndingNormalizedNarration = String(narrationText ?? '').replace(/\r\n/g, '\n');
  const canonicalBytes = Buffer.byteLength(canonicalNarration);
  if (lineEndingNormalizedNarration !== canonicalNarration || approval.approvedNarration.bytes !== canonicalBytes) {
    throw new Error('Approved narration byte receipt is inconsistent with the canonical approved text.');
  }
  return approval;
};

export const artifactReceipt = async (directory, fileName) => ({
  path: fileName,
  sha256: await sha256File(path.join(directory, fileName)),
});

export const workspaceRoot = TOOL_ROOT;
