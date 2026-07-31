import crypto from 'node:crypto';

export const PRONUNCIATION_SCHEMA_VERSION = 'autovideo-pronunciation/v2';

const knownTerms = new Map(Object.entries({
  demo: {kind: 'english-word', locale: 'en-US', targetIpa: '/ˈdɛmoʊ/', targetCmu: 'D EH1 M OW0'},
  agent: {kind: 'english-word', locale: 'en-US'},
  token: {kind: 'english-word', locale: 'en-US'},
  prompt: {kind: 'english-word', locale: 'en-US'},
  codex: {kind: 'brand-product', locale: 'en-US'},
  claude: {kind: 'brand-product', locale: 'en-US'},
  dify: {kind: 'brand-product', locale: 'en-US'},
  coze: {kind: 'brand-product', locale: 'en-US'},
  github: {kind: 'brand-product', locale: 'en-US'},
  openai: {kind: 'brand-product', locale: 'en-US'},
  hyperframes: {kind: 'brand-product', locale: 'en-US'},
  cosyvoice: {kind: 'brand-product', locale: 'en-US'},
  remotion: {kind: 'brand-product', locale: 'en-US'},
}));

const tokenPattern = /(?:[A-Za-z][A-Za-z0-9]*(?:[._+-][A-Za-z0-9]+)*)|(?:\d+[A-Za-z][A-Za-z0-9]*(?:[._+-][A-Za-z0-9]+)*)/g;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const sentenceContext = (text, start, end) => {
  const leftBoundary = Math.max(
    text.lastIndexOf('。', start - 1),
    text.lastIndexOf('！', start - 1),
    text.lastIndexOf('？', start - 1),
    text.lastIndexOf('\n', start - 1),
  );
  const candidates = ['。', '！', '？', '\n']
    .map((separator) => text.indexOf(separator, end))
    .filter((index) => index >= 0);
  const rightBoundary = candidates.length ? Math.min(...candidates) + 1 : text.length;
  const contextStart = Math.max(0, leftBoundary + 1);
  const contextEnd = Math.min(text.length, rightBoundary);
  return {
    text: text.slice(contextStart, contextEnd).trim(),
    start: contextStart,
    end: contextEnd,
  };
};

export const classifyPronunciationToken = (token) => {
  const known = knownTerms.get(token.toLowerCase());
  if (known) return {...known};
  if (/^[A-Z]{2,6}$/.test(token)) return {kind: 'letter-acronym', locale: 'en-US'};
  if (/\d/.test(token)) return {kind: 'numeric-version', locale: 'mixed'};
  if (/[._+-]/.test(token) || /[a-z][A-Z]/.test(token)) return {kind: 'code-identifier', locale: 'und'};
  return {kind: 'english-word', locale: 'en-US'};
};

const defaultSpokenAs = (token, kind) => kind === 'letter-acronym' ? [...token].join(' ') : token;
const defaultStatus = (kind) => kind === 'letter-acronym' ? 'approved-default' : 'needs-listening-review';

export const scanPronunciationEntries = (narration) => {
  const text = String(narration).replace(/\r\n/g, '\n');
  const entries = new Map();
  for (const match of text.matchAll(tokenPattern)) {
    const token = match[0];
    const key = token.toLowerCase();
    const classification = classifyPronunciationToken(token);
    const context = sentenceContext(text, match.index, match.index + token.length);
    const occurrence = {
      start: match.index,
      end: match.index + token.length,
      contextText: context.text,
      contextSha256: sha256(context.text),
    };
    const existing = entries.get(key);
    if (existing) {
      existing.occurrences.push(occurrence);
      continue;
    }
    entries.set(key, {
      token,
      ...classification,
      targetIpa: classification.targetIpa ?? null,
      targetCmu: classification.targetCmu ?? null,
      spokenAs: defaultSpokenAs(token, classification.kind),
      status: defaultStatus(classification.kind),
      source: knownTerms.has(key) ? 'project-lexicon-and-human-review' : 'automatic-classification-requires-human-review',
      contextProbeReceipt: null,
      occurrences: [occurrence],
    });
  }
  return [...entries.values()];
};

export const buildPronunciationGuide = ({projectId, narrationSha256, narration, previous = null}) => {
  const previousByToken = new Map((previous?.entries ?? []).map((entry) => [String(entry.token).toLowerCase(), entry]));
  const entries = scanPronunciationEntries(narration).map((entry) => {
    const prior = previousByToken.get(entry.token.toLowerCase());
    if (!prior) return entry;
    const spokenAs = String(prior.spokenAs ?? entry.spokenAs);
    const sameContext = JSON.stringify(prior.occurrences?.map((item) => item.contextSha256) ?? [])
      === JSON.stringify(entry.occurrences.map((item) => item.contextSha256));
    const contextProbeReceipt = sameContext ? (prior.contextProbeReceipt ?? null) : null;
    const status = entry.kind === 'letter-acronym'
      ? 'approved-default'
      : contextProbeReceipt && prior.status === 'approved-default'
        ? 'approved-default'
        : 'needs-listening-review';
    return {
      ...entry,
      spokenAs,
      status,
      source: prior.source ?? entry.source,
      contextProbeReceipt,
    };
  });
  return {
    schemaVersion: PRONUNCIATION_SCHEMA_VERSION,
    projectId,
    narrationSha256,
    policy: 'NarrationLock wording is immutable. Letter acronyms use explicit spelling; every other Latin token requires a hash-bound in-context listening probe before full narration synthesis.',
    entries,
  };
};

export const validatePronunciationGuide = ({guide, projectId, narrationSha256, narration, requireProbes = false}) => {
  if (guide?.schemaVersion !== PRONUNCIATION_SCHEMA_VERSION) throw new Error(`Pronunciation guide must use ${PRONUNCIATION_SCHEMA_VERSION}.`);
  if (guide.projectId !== projectId || guide.narrationSha256 !== narrationSha256) throw new Error('Pronunciation guide identity or NarrationLock binding is stale.');
  const expected = scanPronunciationEntries(narration);
  const actualByToken = new Map((guide.entries ?? []).map((entry) => [String(entry.token).toLowerCase(), entry]));
  if (actualByToken.size !== expected.length || expected.some((entry) => !actualByToken.has(entry.token.toLowerCase()))) {
    throw new Error('Pronunciation guide must cover every Latin token in NarrationLock exactly once.');
  }
  for (const expectedEntry of expected) {
    const entry = actualByToken.get(expectedEntry.token.toLowerCase());
    if (entry.kind !== expectedEntry.kind || !entry.spokenAs || !['approved-default', 'needs-listening-review'].includes(entry.status)) {
      throw new Error(`Pronunciation entry is invalid for ${expectedEntry.token}.`);
    }
    const expectedContexts = expectedEntry.occurrences.map((item) => item.contextSha256);
    const actualContexts = (entry.occurrences ?? []).map((item) => item.contextSha256);
    if (JSON.stringify(actualContexts) !== JSON.stringify(expectedContexts)) throw new Error(`Pronunciation context is stale for ${expectedEntry.token}.`);
    if (requireProbes && entry.kind !== 'letter-acronym') {
      if (entry.status !== 'approved-default' || !entry.contextProbeReceipt?.path || !/^[a-f0-9]{64}$/i.test(entry.contextProbeReceipt.sha256 ?? '')) {
        throw new Error(`An approved in-context pronunciation probe is required for ${expectedEntry.token}.`);
      }
    }
  }
  return {entries: guide.entries, unresolved: guide.entries.filter((entry) => entry.status !== 'approved-default')};
};
