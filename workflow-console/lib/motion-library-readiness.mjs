import {
  loadLifecycleContext,
  validateLifecycleLedger,
} from '../../tools/motion-recipe-lifecycle/lifecycle.mjs';
import {buildMotionLifecycleReadiness} from '../../tools/motion-recipe-lifecycle/readiness.mjs';
import {listMotionProbes} from './motion-probe-review.mjs';

const lifecyclePaths = {
  libraryPath: 'style-library/motion-library/knowledge-explainer-v1.json',
  ledgerPath: 'style-library/motion-library/knowledge-explainer.lifecycle.json',
  catalogPaths: {
    officialRegistry: 'style-library/generated/hyperframes-official-registry.json',
    officialBlueprints: 'style-library/generated/hyperframes-blueprints.json',
    officialMotionRules: 'style-library/generated/hyperframes-motion-rules.json',
  },
};

export const readMotionLibrarySnapshot = async ({workspaceRoot}) => {
  const context = await loadLifecycleContext({workspaceRoot, ...lifecyclePaths});
  const [probes, validationIssues] = await Promise.all([
    listMotionProbes({workspaceRoot}),
    validateLifecycleLedger({workspaceRoot, ...context}),
  ]);
  const readiness = await buildMotionLifecycleReadiness({
    workspaceRoot,
    library: context.library,
    ledger: context.ledger,
    probes,
    validationIssues,
  });
  return {probes, readiness};
};
