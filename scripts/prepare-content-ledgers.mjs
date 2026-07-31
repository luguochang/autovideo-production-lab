import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  assertContentApprovalForNarration,
  validateEvidence,
} from '../tools/content-pipeline/content-contract.mjs';
import {buildPronunciationGuide} from '../tools/voice-lab/pronunciation-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const projectsRoot = path.join(root, 'hyperframes-workflow-kit', 'projects');

const args = Object.fromEntries(process.argv.slice(2).reduce((items, value, index, values) => {
  if (!value.startsWith('--')) return items;
  items.push([value.slice(2), values[index + 1]]);
  return items;
}, []));

const projectId = args.project;
if (!projectId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId)) {
  throw new Error('Usage: node scripts/prepare-content-ledgers.mjs --project <project-id>');
}

const projectDir = path.join(projectsRoot, projectId);
const inputDir = path.join(projectDir, 'input');
const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));
const exists = async (filePath) => fs.access(filePath).then(() => true).catch(() => false);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sha256File = async (filePath) => sha256(await fs.readFile(filePath));
const writeJson = async (name, value) => fs.writeFile(
  path.join(inputDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8',
);

const lock = await readJson(path.join(projectDir, 'NarrationLock.json'));
const narrationPath = path.join(projectDir, lock.frozenPath);
const narrationText = await fs.readFile(narrationPath, 'utf8');
const narration = narrationText.replace(/\r\n/g, '\n').trim();
const normalizedSha256 = sha256(narration);
if (normalizedSha256 !== lock.normalizedSha256) throw new Error('NarrationLock does not match its frozen narration file.');

const lines = narration.split('\n');
const lineContaining = (needle) => {
  const index = lines.findIndex((line) => line.includes(needle));
  return index < 0 ? {line: null, text: ''} : {line: index + 1, text: lines[index]};
};

const legacyClaims = () => {
  const claim99 = lineContaining('99%');
  const claim90 = lineContaining('90%');
  const claim30k = lineContaining('30K');
  return [
    {
      id: 'claim-99-percent', sourceLine: claim99.line, text: claim99.text,
      kind: 'creator-opinion-with-number', evidenceStatus: 'unverified',
      visualRule: 'Do not render as a statistical chart or surveyed fact. Use an exact quote or creator-view label.',
    },
    {
      id: 'claim-90-percent', sourceLine: claim90.line, text: claim90.text,
      kind: 'creator-opinion-with-number', evidenceStatus: 'unverified',
      visualRule: 'Do not render as a measured population statistic. Use contrastive typography with a creator-view qualifier.',
    },
    {
      id: 'claim-30k', sourceLine: claim30k.line, text: claim30k.text,
      kind: 'creator-opinion-and-income-claim', evidenceStatus: 'unverified',
      visualRule: 'Keep as the speaker claim; no salary chart, guarantee badge or platform promise.',
    },
    {
      id: 'claim-five-reasons', sourceLines: [6, 7, 8, 9, 10],
      text: 'Five engineering reasons distinguish a demo from a maintainable product.',
      kind: 'argument-structure', evidenceStatus: 'author-framework',
      visualRule: 'A five-step structure is allowed, but each step must use approved narration and avoid invented evidence.',
    },
    {
      id: 'claim-engineering-thesis', sourceLines: [11, 12, 14],
      text: 'Creation is becoming cheap while understanding, judgment, maintenance and responsibility remain valuable.',
      kind: 'creator-thesis', evidenceStatus: 'author-framework',
      visualRule: 'Use as the final accumulated conclusion, clearly framed as the creator thesis.',
    },
  ];
};

const legacyContentApproval = {
  schemaVersion: 'autovideo-content-approval/v1',
  projectId,
  narrationLock: '../NarrationLock.json',
  narrationSha256: lock.normalizedSha256,
  sourceType: 'user-provided-approved-script',
  wordingPolicy: 'immutable',
  approvedForInternalProduction: true,
  approvedForPublicRelease: false,
  publicReleaseBlockers: [
    'CosyVoice built-in speaker publication rights are unresolved.',
    'Numeric claims 99%, 90% and 30K have no external evidence package and must be presented as creator opinion.',
  ],
  screenTextPolicy: {
    exactNarration: 'exact-source',
    shortenedText: 'generated-summary requiring source range and no stronger factual wording',
    numericClaims: 'creator-claim label or exact-source treatment; no chart implying a measured dataset',
  },
  approvedBy: 'user-requested-standard-run',
  approvedAt: new Date().toISOString(),
};

const contentApprovalPath = path.join(inputDir, 'content-approval.json');
let contentApproval = await exists(contentApprovalPath) ? await readJson(contentApprovalPath) : null;
const usesApprovedIntake = contentApproval?.schemaVersion === 'autovideo-content-approval/v2';
let claims = legacyClaims();

if (usesApprovedIntake) {
  await assertContentApprovalForNarration({approval: contentApproval, projectId, narrationText});
  if (!lock.approvalReceipt || lock.approvalReceipt.path !== 'input/content-approval.json') {
    throw new Error('NarrationLock does not bind the v2 content approval receipt.');
  }
  if (await sha256File(contentApprovalPath) !== lock.approvalReceipt.sha256) {
    throw new Error('The v2 content approval receipt no longer matches NarrationLock.');
  }

  const intakeDir = path.join(inputDir, 'content-intake');
  const intakeBindings = [
    ['sources.json', 'sourcesSha256'],
    ['material-suitability.json', 'suitabilitySha256'],
    ['evidence.json', 'evidenceSha256'],
    ['content-outline.json', 'contentOutlineSha256'],
    ['script.draft.json', 'scriptDraftSha256'],
    ['spoken-rewrite.json', 'spokenRewriteSha256'],
    ['content-duration-fit.json', 'durationFitSha256'],
    ['claim-source-review.json', 'claimSourceReviewSha256'],
  ];
  for (const [fileName, binding] of intakeBindings) {
    if (!contentApproval.bindings[binding]) continue;
    if (await sha256File(path.join(intakeDir, fileName)) !== contentApproval.bindings[binding]) {
      throw new Error(`${fileName} no longer matches the approved content intake chain.`);
    }
  }

  const evidence = await readJson(path.join(intakeDir, 'evidence.json'));
  await validateEvidence(evidence);
  const evidenceStatus = {supported: 'verified', opinion: 'author-framework', disputed: 'disputed'};
  const kind = {supported: 'sourced-claim', opinion: 'creator-opinion', disputed: 'disputed-claim'};
  const visualRule = {
    supported: 'Stay within the registered source quote and locator; do not strengthen the claim.',
    opinion: 'Label as creator opinion and do not present it as an external statistic or measured fact.',
    disputed: 'Present as disputed context with explicit attribution; do not imply consensus.',
  };
  claims = evidence.claims.map((claim) => ({
    id: claim.id,
    text: claim.statement,
    kind: kind[claim.status],
    evidenceStatus: evidenceStatus[claim.status],
    sourceId: claim.sourceId,
    quote: claim.quote,
    locator: claim.locator,
    ...(claim.notes ? {notes: claim.notes} : {}),
    visualRule: visualRule[claim.status],
  }));
} else {
  contentApproval = legacyContentApproval;
  await writeJson('content-approval.json', contentApproval);
}

const claimLedger = {
  schemaVersion: 'autovideo-claim-ledger/v1',
  projectId,
  narrationSha256: lock.normalizedSha256,
  policy: 'The narration is immutable. This ledger controls visual framing and does not rewrite the narration.',
  claims,
};

const previousPronunciationPath = path.join(inputDir, 'pronunciation.json');
const previousPronunciation = await exists(previousPronunciationPath) ? await readJson(previousPronunciationPath) : null;
const pronunciation = buildPronunciationGuide({
  projectId,
  narrationSha256: lock.normalizedSha256,
  narration,
  previous: previousPronunciation,
});

await fs.mkdir(inputDir, {recursive: true});
await writeJson('claim-ledger.json', claimLedger);
await writeJson('pronunciation.json', pronunciation);

console.log(JSON.stringify({
  projectId,
  narrationSha256: lock.normalizedSha256,
  contentApproval: usesApprovedIntake ? 'preserved-v2' : 'generated-v1',
  claimSource: usesApprovedIntake ? 'input/content-intake/evidence.json' : 'legacy-demotext-baseline',
  outputs: ['input/content-approval.json', 'input/claim-ledger.json', 'input/pronunciation.json'],
}, null, 2));
