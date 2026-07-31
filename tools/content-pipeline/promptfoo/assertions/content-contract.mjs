import path from 'node:path';
import {evaluateContentRegressionCase} from '../../content-regression.mjs';
import {readJson, workspaceRoot} from '../../content-contract.mjs';

export default async function contentContractAssertion(output, context = {}) {
  try {
    const casePath = path.resolve(workspaceRoot, context.vars?.casePath);
    const relative = path.relative(workspaceRoot, casePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Regression case leaves workspace.');
    const [caseRecord, rewrite] = await Promise.all([
      readJson(casePath),
      Promise.resolve(JSON.parse(output)),
    ]);
    const result = await evaluateContentRegressionCase({caseRecord, rewrite});
    return {
      pass: result.passed,
      score: result.passed ? 1 : 0,
      reason: result.passed
        ? `Passed ${result.metrics.coveredClaimCount} claim bindings; synthetic fixture only.`
        : result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n'),
      metadata: {
        caseId: result.caseId,
        datasetClass: result.datasetClass,
        humanGoldEligible: result.humanGoldEligible,
        metrics: result.metrics,
      },
    };
  } catch (error) {
    return {pass: false, score: 0, reason: error.message};
  }
}
