import fs from 'node:fs/promises';
import path from 'node:path';
import {evaluateContentRegressionCorpus} from '../tools/content-pipeline/content-regression.mjs';
import {workspaceRoot} from '../tools/content-pipeline/content-contract.mjs';

const parseArgs = (values) => {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    result[key] = values[index + 1] && !values[index + 1].startsWith('--') ? values[++index] : true;
  }
  return result;
};

const args = parseArgs(process.argv.slice(2));
const corpusPath = path.resolve(workspaceRoot, args.corpus || 'tools/content-pipeline/fixtures/contract/corpus.json');
const report = await evaluateContentRegressionCorpus({corpusPath});
const output = `${JSON.stringify(report, null, 2)}\n`;
if (args.out) {
  const outputPath = path.resolve(workspaceRoot, args.out);
  await fs.mkdir(path.dirname(outputPath), {recursive: true});
  await fs.writeFile(outputPath, output, 'utf8');
}
process.stdout.write(output);
if (!report.passed) process.exitCode = 1;
