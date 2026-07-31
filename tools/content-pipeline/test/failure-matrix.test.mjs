import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {assertContract, readJson} from '../content-contract.mjs';
import {evaluateContentRegressionCase} from '../content-regression.mjs';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const fixtureRoot = path.join(root, 'tools', 'content-pipeline', 'fixtures', 'contract');

test('synthetic failure matrix covers six topic families without becoming human gold', async () => {
  const matrix = await readJson(path.join(fixtureRoot, 'failure-matrix.json'));
  await assertContract('content-failure-matrix.schema.json', matrix, 'content failure matrix');
  assert.equal(matrix.humanGoldEligible, false);
  assert.equal(matrix.cases.length, 24);
  assert.equal(new Set(matrix.cases.map((item) => item.topicClass)).size, 6);
  assert.equal(new Set(matrix.cases.map((item) => item.mutation)).size, 4);

  const caseRecord = await readJson(path.join(fixtureRoot, 'zh-ai-terms-001.case.json'));
  const candidate = await readJson(path.join(fixtureRoot, 'zh-ai-terms-001.candidate.json'));
  const mutations = {
    'opinion-laundering': (rewrite) => { rewrite.sections[0].kind = 'creator-opinion'; },
    'new-protected-atom': (rewrite) => { rewrite.sections[0].narration += ' 成功率100%。'; },
    'screen-overload': (rewrite) => {
      rewrite.sections[0].onscreen = [
        {text: '这是一段明显超过屏幕预算的摘要文字内容', kind: 'generated_summary'},
        {text: '第二个摘要', kind: 'generated_summary'},
        {text: '第三个摘要', kind: 'generated_summary'},
      ];
    },
    'long-sentence': (rewrite) => { rewrite.sections[0].narration += ' 这是一段用于测试口播长度限制的连续中文句子不会自然断句并且故意保持很长让机器合同能够稳定发现书面化长句问题。'; },
  };
  for (const [mutation, apply] of Object.entries(mutations)) {
    const rewrite = structuredClone(candidate.output);
    apply(rewrite);
    const result = await evaluateContentRegressionCase({caseRecord, rewrite});
    const expectedCodes = [...new Set(matrix.cases.find((item) => item.mutation === mutation).expectedIssueCodes)];
    const actual = new Set(result.issues.map((issue) => issue.code));
    for (const code of expectedCodes) assert.equal(actual.has(code), true, `${mutation} did not emit ${code}`);
  }
});
