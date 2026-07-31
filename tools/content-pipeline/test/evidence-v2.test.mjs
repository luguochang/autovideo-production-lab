import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  bindEvidenceCitationReceipts,
  canonicalExactQuote,
  diagnoseMaterials,
  registerSources,
  reviewClaimSources,
  sha256,
  validateEvidence,
  workspaceRoot,
  writeJson,
} from '../content-contract.mjs';
import {canonicalJsonSha256} from '../content-regression.mjs';

test('evidence v2 validates exact line locators, protected atoms, and English terms', async () => {
  const projectId = `evidence-v2-test-${process.pid}`;
  const runRoot = path.join(workspaceRoot, 'content', 'test-runs', projectId);
  const sourceDir = path.join(runRoot, 'materials');
  try {
    await fs.mkdir(sourceDir, {recursive: true});
    const sourceText = [
      '# 测试记录',
      '截至2026年7月，这个测试记录了30次 API 调用。',
      '我的看法是，demo 只是起点。',
      '',
    ].join('\n');
    await fs.writeFile(path.join(sourceDir, 'notes.md'), sourceText, 'utf8');
    const sources = await registerSources({projectId, materialsPath: sourceDir, workspaceRoot});
    const sourcesSha256 = canonicalJsonSha256(sources);
    const suitability = await diagnoseMaterials({sources, sourcesSha256, requestedRoute: 'materials'});
    const suitabilitySha256 = canonicalJsonSha256(suitability);
    const sourceId = sources.sources[0].id;
    const factQuote = '截至2026年7月，这个测试记录了30次 API 调用。';
    const opinionQuote = '我的看法是，demo 只是起点。';
    const evidence = {
      schemaVersion: 'autovideo-evidence/v2',
      projectId,
      sourceRegisterSha256: sourcesSha256,
      suitabilitySha256,
      generatedAt: '2026-07-22T00:00:00.000Z',
      claims: [
        {
          id: 'claim-sample', claimKind: 'fact', supportStatus: 'supported', statement: factQuote,
          citations: [{
            id: 'citation-sample', sourceId, quote: factQuote,
            locator: {scheme: 'line-range', startLine: 2, endLine: 2, occurrence: 1},
            canonicalQuoteSha256: sha256(canonicalExactQuote(factQuote)),
          }],
          protectedAtomIds: ['atom-year', 'atom-month', 'atom-count'],
        },
        {
          id: 'claim-opinion', claimKind: 'creator-opinion', supportStatus: 'supported', statement: opinionQuote,
          citations: [{
            id: 'citation-opinion', sourceId, quote: opinionQuote,
            locator: {scheme: 'line-range', startLine: 3, endLine: 3, occurrence: 1},
            canonicalQuoteSha256: sha256(canonicalExactQuote(opinionQuote)),
          }],
          protectedAtomIds: [],
        },
      ],
      protectedAtoms: [
        {id: 'atom-year', type: 'date', sourceSurface: '2026', canonicalValue: '2026', allowedNarrationForms: ['2026'], omissionPolicy: 'required'},
        {id: 'atom-month', type: 'date', sourceSurface: '7', canonicalValue: '7', allowedNarrationForms: ['7'], omissionPolicy: 'required'},
        {id: 'atom-count', type: 'number', sourceSurface: '30', canonicalValue: '30', allowedNarrationForms: ['30'], omissionPolicy: 'required'},
      ],
      terms: [
        {id: 'term-api', token: 'API', tokenClass: 'initialism', caseSensitive: true, allowedWrittenForms: ['API'], spokenPolicy: 'letter-by-letter', requiresListeningReview: true},
        {id: 'term-demo', token: 'demo', tokenClass: 'english-word', caseSensitive: false, allowedWrittenForms: ['demo'], spokenPolicy: 'whole-word', requiresListeningReview: true},
      ],
      gaps: [],
    };
    evidence.claims[0].citations[0].canonicalQuoteSha256 = '0'.repeat(64);
    const boundEvidence = bindEvidenceCitationReceipts(evidence);
    assert.equal(boundEvidence.claims[0].citations[0].canonicalQuoteSha256, sha256(canonicalExactQuote(factQuote)));
    Object.assign(evidence, boundEvidence);
    await validateEvidence(evidence);
    const evidenceSha256 = canonicalJsonSha256(evidence);
    const rewrite = {
      schemaVersion: 'autovideo-spoken-rewrite/v1', projectId,
      sourceRegisterSha256: sourcesSha256, suitabilitySha256, evidenceSha256,
      title: '测试记录', language: 'zh-CN',
      sections: [
        {
          id: 'section-01', kind: 'sourced', targetSeconds: 12,
          narration: '截至2026年7月，这次测试记录了30次 API 调用。',
          claimIds: ['claim-sample'], sourceIds: [sourceId], framing: '登记材料中的测试记录。',
          onscreen: [{text: '30次 API 调用', kind: 'exact_excerpt'}],
        },
        {
          id: 'section-02', kind: 'creator-opinion', targetSeconds: 8,
          narration: '我的看法是，demo 只是起点。',
          claimIds: ['claim-opinion'], sourceIds: [sourceId], framing: '明确标记为我的看法。',
          onscreen: [{text: 'demo 只是起点', kind: 'exact_excerpt'}],
        },
      ],
      reviewNotes: [], generatedAt: '2026-07-22T00:00:00.000Z',
    };
    const bindings = {
      sourcesSha256,
      suitabilitySha256,
      evidenceSha256,
      spokenRewriteSha256: canonicalJsonSha256(rewrite),
    };
    const passed = await reviewClaimSources({workspaceRoot, sources, suitability, evidence, rewrite, bindings});
    assert.equal(passed.status, 'passed');
    assert.equal(passed.checks.exactQuotes, true);

    const wrongLocator = structuredClone(evidence);
    wrongLocator.claims[0].citations[0].locator = {scheme: 'line-range', startLine: 1, endLine: 1, occurrence: 1};
    await validateEvidence(wrongLocator);
    const wrongLocatorReview = await reviewClaimSources({
      workspaceRoot, sources, suitability, evidence: wrongLocator,
      rewrite: {...rewrite, evidenceSha256: canonicalJsonSha256(wrongLocator)},
      bindings: {...bindings, evidenceSha256: canonicalJsonSha256(wrongLocator), spokenRewriteSha256: canonicalJsonSha256({...rewrite, evidenceSha256: canonicalJsonSha256(wrongLocator)})},
    });
    assert.equal(wrongLocatorReview.status, 'failed');
    assert.equal(wrongLocatorReview.issues.some((issue) => issue.code === 'locator-quote-missing'), true);

    const invented = structuredClone(rewrite);
    invented.sections[0].narration += ' 成功率100%。';
    const inventedReview = await reviewClaimSources({
      workspaceRoot, sources, suitability, evidence, rewrite: invented,
      bindings: {...bindings, spokenRewriteSha256: canonicalJsonSha256(invented)},
    });
    assert.equal(inventedReview.status, 'failed');
    assert.equal(inventedReview.issues.some((issue) => issue.code === 'unregistered-protected-atom'), true);
  } finally {
    await fs.rm(runRoot, {recursive: true, force: true});
  }
});
