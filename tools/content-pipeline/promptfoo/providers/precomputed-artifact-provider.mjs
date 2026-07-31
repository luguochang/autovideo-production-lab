import path from 'node:path';
import {verifyPrecomputedCandidate} from '../../content-regression.mjs';
import {workspaceRoot} from '../../content-contract.mjs';

const insideWorkspace = (candidate) => {
  const absolute = path.resolve(workspaceRoot, candidate);
  const relative = path.relative(workspaceRoot, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Promptfoo fixture path leaves the AutoVideo workspace.');
  return absolute;
};

export default class PrecomputedArtifactProvider {
  constructor(options = {}) {
    this.config = options.config ?? {};
  }

  id() {
    return `autovideo:precomputed:${this.config.stage ?? 'unknown'}`;
  }

  async callApi(_prompt, context = {}) {
    const casePath = insideWorkspace(context.vars?.casePath);
    const candidatePath = insideWorkspace(context.vars?.candidatePath);
    const verified = await verifyPrecomputedCandidate({casePath, candidatePath});
    if (verified.candidate.stage !== this.config.stage) {
      throw new Error(`Candidate stage ${verified.candidate.stage} does not match provider stage ${this.config.stage}.`);
    }
    return {
      output: JSON.stringify(verified.candidate.output),
      metadata: {
        caseId: verified.caseRecord.caseId,
        caseSha256: verified.caseSha256,
        promptSha256: verified.stage.promptSha256,
        outputSha256: verified.candidate.outputSha256,
        source: 'precomputed-local-file',
      },
    };
  }
}
