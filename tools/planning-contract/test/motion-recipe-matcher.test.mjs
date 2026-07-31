import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {test} from 'node:test';
import {recommendMotionRecipes} from '../motion-recipe-matcher.mjs';

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const library = JSON.parse(await fs.readFile(
  path.join(workspaceRoot, 'style-library', 'motion-library', 'knowledge-explainer-v1.json'),
  'utf8',
));

const productionRecipes = library.recipes.map((recipe) => ({
  ...recipe,
  lifecycleState: 'promoted-template',
  allowedForProject: true,
  blockedReason: null,
}));

const candidateRecipes = library.recipes.map((recipe) => ({
  ...recipe,
  lifecycleState: 'candidate',
  allowedForProject: false,
  blockedReason: 'candidate-not-production-approved',
}));

const baseShot = (overrides = {}) => ({
  cueId: 'cue-001',
  sceneId: 'scene-01',
  narration: '核心概念就是可维护性。',
  screenText: {text: '可维护性', type: 'generated-summary', sourceCueIds: ['cue-001']},
  assetRefs: [],
  provenanceRefs: [],
  ...overrides,
});

const recommendOne = ({shot, role = 'concept', graph = null, recipes = productionRecipes}) => {
  const result = recommendMotionRecipes({
    projectId: 'matcher-fixture',
    shots: [shot],
    scenes: [{id: shot.sceneId, role}],
    graphs: graph ? [{sceneId: shot.sceneId, ...graph}] : [],
    recipes,
  });
  assert.equal(result.decisions.length, 1);
  return result.decisions[0];
};

const readyCases = [
  {recipeId: 'keyword-handoff', shot: baseShot()},
  {
    recipeId: 'evidence-pivot',
    shot: baseShot({
      narration: '这张截图给出了来源证据和原文。',
      screenText: {text: '来源证据'},
      assetRefs: [{assetId: 'image-001', role: 'evidence', zone: 'content.right'}],
    }),
  },
  {
    recipeId: 'device-surface-tour',
    shot: baseShot({
      narration: '打开浏览器页面，点击按钮完成操作。',
      screenText: {text: '浏览器操作'},
      assetRefs: [{assetId: 'ui-001', role: 'interface', zone: 'content.right'}],
    }),
  },
  {
    recipeId: 'diagram-build',
    role: 'process',
    graph: {
      nodes: [{id: 'node-a'}, {id: 'node-b'}],
      edges: [{id: 'edge-a-b', from: 'node-a', to: 'node-b'}],
    },
    shot: baseShot({
      narration: '首先按流程连接上游依赖，然后进入下游。',
      screenText: {text: '上游 -> 下游'},
    }),
  },
  {
    recipeId: 'data-proof',
    shot: baseShot({
      narration: '实测吞吐量提升了 37%。',
      screenText: {text: '提升 37%'},
      provenanceRefs: ['claim:claim-001'],
    }),
  },
  {
    recipeId: 'comparison-split',
    role: 'compare',
    shot: baseShot({
      narration: '错误方案不是更快，而是正确方案更稳定。',
      screenText: {text: '更快 != 更稳定'},
    }),
  },
  {
    recipeId: 'code-proof',
    shot: baseShot({
      narration: '读取日志和堆栈，调试失败的代码。',
      screenText: {text: '日志 -> 失败行'},
      assetRefs: [{assetId: 'code-001', role: 'code', zone: 'content.right'}],
    }),
  },
  {
    recipeId: 'object-metaphor',
    shot: baseShot({
      narration: '把隐藏的黑盒当作系统分层隐喻，稍后再次引用。',
      screenText: {text: '隐藏黑盒'},
      assetRefs: [{assetId: 'metaphor-001', role: 'metaphor', zone: 'content.right'}],
      callbackCueIds: ['cue-004'],
    }),
  },
];

for (const fixture of readyCases) {
  test(`selects the ${fixture.recipeId} family only when its semantic inputs are ready`, () => {
    const decision = recommendOne(fixture);
    assert.equal(decision.recommendedRecipeId, fixture.recipeId);
    const candidate = decision.candidates.find((item) => item.recipeId === fixture.recipeId);
    assert.ok(candidate, `${fixture.recipeId} must remain visible in the ranked candidates`);
    assert.equal(candidate.inputReady, true);
    assert.equal(candidate.productionReady, true);
    assert.equal(candidate.blockedReason, null);
    assert.ok(candidate.matchedTriggers.length > 0);
  });
}

const missingInputCases = [
  {
    recipeId: 'evidence-pivot',
    expectedMissing: 'frozen evidence image',
    shot: baseShot({narration: '这张截图展示来源证据和原文。', screenText: {text: '来源证据'}}),
  },
  {
    recipeId: 'device-surface-tour',
    expectedMissing: 'frozen interface states',
    shot: baseShot({narration: '打开浏览器页面，再点击按钮。', screenText: {text: '页面操作'}}),
  },
  {
    recipeId: 'diagram-build',
    expectedMissing: 'Graph IR nodes/edges',
    role: 'process',
    shot: baseShot({narration: '首先按流程连接上游依赖，然后进入下游。', screenText: {text: '依赖流程'}}),
  },
  {
    recipeId: 'data-proof',
    expectedMissing: 'verified claim + source receipt',
    shot: baseShot({narration: '实测吞吐量提升了 37%。', screenText: {text: '提升 37%'}}),
  },
  {
    recipeId: 'comparison-split',
    expectedMissing: 'two explicit states + contrast rule',
    role: 'compare',
    shot: baseShot({narration: '这是产品演示的实际效果。', screenText: {text: '产品效果'}}),
  },
  {
    recipeId: 'code-proof',
    expectedMissing: 'real code/log/terminal evidence',
    shot: baseShot({narration: '读取日志和堆栈，调试失败的代码。', screenText: {text: '日志排错'}}),
  },
  {
    recipeId: 'object-metaphor',
    expectedMissing: 'frozen metaphor asset',
    additionalMissing: 'callback cue',
    shot: baseShot({narration: '隐藏的黑盒代表系统分层。', screenText: {text: '隐藏黑盒'}}),
  },
];

for (const fixture of missingInputCases) {
  test(`${fixture.recipeId} fails closed when its semantic evidence is missing`, () => {
    const decision = recommendOne(fixture);
    assert.notEqual(decision.recommendedRecipeId, fixture.recipeId);
    const candidate = decision.candidates.find((item) => item.recipeId === fixture.recipeId);
    assert.ok(candidate, `${fixture.recipeId} must explain why it was rejected`);
    assert.equal(candidate.inputReady, false);
    assert.equal(candidate.productionReady, false);
    assert.equal(candidate.blockedReason, 'required-inputs-missing');
    assert.ok(candidate.missingInputs.includes(fixture.expectedMissing));
    if (fixture.additionalMissing) assert.ok(candidate.missingInputs.includes(fixture.additionalMissing));
    assert.equal(decision.fallbackUsed, true);
    assert.match(decision.fallbackReason, /missing:/i);
  });
}

test('matching is deterministic for identical shots, context, lifecycle, and feedback', () => {
  const input = {
    projectId: 'deterministic-fixture',
    shots: readyCases.map((fixture, index) => ({
      ...structuredClone(fixture.shot),
      cueId: `cue-${String(index + 1).padStart(3, '0')}`,
      sceneId: `scene-${String(index + 1).padStart(3, '0')}`,
    })),
    scenes: readyCases.map((fixture, index) => ({
      id: `scene-${String(index + 1).padStart(3, '0')}`,
      role: fixture.role ?? 'concept',
    })),
    graphs: readyCases.flatMap((fixture, index) => fixture.graph ? [{
      sceneId: `scene-${String(index + 1).padStart(3, '0')}`,
      ...structuredClone(fixture.graph),
    }] : []),
    recipes: productionRecipes,
    feedback: {'keyword-handoff': {reuse: 2, tune: 1, sampleCount: 3, suitableTopics: ['可维护性']}},
  };
  assert.deepEqual(recommendMotionRecipes(input), recommendMotionRecipes(structuredClone(input)));
});

test('diversity penalties never override a materially stronger semantic match', () => {
  const shots = Array.from({length: 4}, (_, index) => baseShot({
    cueId: `cue-${String(index + 1).padStart(3, '0')}`,
    narration: '这个流程不是 A，而是 B。',
    screenText: {text: '流程 A -> B'},
  }));
  const result = recommendMotionRecipes({
    projectId: 'semantic-over-diversity',
    shots,
    scenes: [{id: 'scene-01', role: 'process'}],
    graphs: [{
      sceneId: 'scene-01',
      nodes: [{id: 'node-a'}, {id: 'node-b'}],
      edges: [{id: 'edge-a-b', from: 'node-a', to: 'node-b'}],
    }],
    recipes: productionRecipes,
  });

  assert.deepEqual(result.decisions.map((decision) => decision.semanticLeaderRecipeId), Array(4).fill('diagram-build'));
  assert.deepEqual(result.decisions.map((decision) => decision.recommendedRecipeId), Array(4).fill('diagram-build'));
  assert.ok(result.decisions.every((decision) => decision.fallbackUsed === false));
});

test('comparison symbols in approved screen summaries remain explicit two-state inputs', () => {
  const decision = recommendOne({
    shot: baseShot({
      narration: '很多人会拖拽节点，就以为自己已经懂了系统架构。',
      screenText: {text: '拖拽 ≠ 架构理解'},
      motionRecipeRefs: [{recipeId: 'comparison-split', version: '1.0.0'}],
    }),
    graph: {
      nodes: [{id: 'node-a'}, {id: 'node-b'}],
      edges: [{id: 'edge-a-b', from: 'node-a', to: 'node-b'}],
    },
  });
  assert.equal(decision.recommendedRecipeId, 'comparison-split');
  assert.equal(decision.recommendation.inputReady, true);
  assert.deepEqual(decision.recommendation.missingInputs, []);
});

test('candidate lifecycle can be recommended for a probe but can never be productionReady', () => {
  const recipes = productionRecipes.map((recipe) => recipe.id === 'keyword-handoff'
    ? {...recipe, lifecycleState: 'candidate', allowedForProject: true, blockedReason: null}
    : recipe);
  const decision = recommendOne({shot: baseShot(), recipes});
  assert.equal(decision.recommendedRecipeId, 'keyword-handoff');
  const candidate = decision.candidates.find((item) => item.recipeId === 'keyword-handoff');
  assert.equal(candidate.inputReady, true);
  assert.equal(candidate.allowedForProject, true);
  assert.equal(candidate.lifecycleProductionReady, false);
  assert.equal(candidate.productionReady, false);
  assert.equal(candidate.blockedReason, 'candidate-not-production-approved');
});

test('backend recommendation contract exposes rationale, alternatives, and advisory feedback without promotion', () => {
  const plan = recommendMotionRecipes({
    projectId: 'matcher-project',
    scenes: [
      {id: 'scene-01', role: 'process'},
      {id: 'scene-02', role: 'proof'},
    ],
    graphs: [{
      id: 'graph-scene-01',
      sceneId: 'scene-01',
      nodes: [{id: 'a'}, {id: 'b'}],
      edges: [{id: 'a-b', from: 'a', to: 'b'}],
    }],
    shots: [
      {
        cueId: 'cue-001',
        sceneId: 'scene-01',
        narration: 'Build the API workflow, then connect each dependency.',
        screenText: {text: 'API workflow'},
        assetRefs: [],
        provenanceRefs: [],
        motionRecipeRefs: [],
      },
      {
        cueId: 'cue-002',
        sceneId: 'scene-02',
        narration: 'Read the code diff and debug log before changing the system.',
        screenText: {text: 'code diff log'},
        assetRefs: [{assetId: 'code-asset', role: 'code'}],
        provenanceRefs: [],
        motionRecipeRefs: [],
      },
    ],
    recipes: candidateRecipes,
    feedback: {
      'code-proof': {
        sampleCount: 3,
        reuse: 2,
        tune: 1,
        hold: 0,
        'retire-candidate': 0,
        suitableTopics: ['code'],
      },
    },
  });
  assert.equal(plan.policy.autoApprove, false);
  assert.equal(plan.policy.feedbackCannotPromoteLifecycle, true);
  assert.equal(plan.decisions.length, 2);

  const diagram = plan.decisions[0];
  assert.equal(diagram.recommendedRecipeId, 'diagram-build');
  assert.equal(diagram.recommendation.recipeId, 'diagram-build');
  assert.equal(diagram.recommendation.inputReady, true);
  assert.equal(diagram.lifecycleBlocker, 'candidate-not-production-approved');
  assert.ok(diagram.trigger.length > 0);
  assert.ok(diagram.reason.length > 0);
  assert.ok(diagram.alternatives.length > 0);

  const code = plan.decisions[1];
  assert.equal(code.recommendedRecipeId, 'code-proof');
  assert.equal(code.recommendation.recipeId, 'code-proof');
  assert.equal(code.recommendation.feedback.sampleCount, 3);
  assert.equal(code.recommendation.productionReady, false);
  assert.equal(code.lifecycleBlocker, 'candidate-not-production-approved');
});

test('backend recommendation contract exposes missing carrier inputs without auto-approval', () => {
  const plan = recommendMotionRecipes({
    projectId: 'matcher-project',
    scenes: [{id: 'scene-01', role: 'proof'}],
    shots: [{
      cueId: 'cue-001',
      sceneId: 'scene-01',
      narration: 'Read the code diff and debug log.',
      screenText: {text: 'code diff log'},
      assetRefs: [],
      provenanceRefs: [],
      motionRecipeRefs: [],
    }],
    recipes: candidateRecipes,
  });
  const decision = plan.decisions[0];
  const codeAlternative = [decision.recommendation, ...decision.alternatives]
    .find((candidate) => candidate.recipeId === 'code-proof');
  assert.ok(codeAlternative);
  assert.deepEqual(codeAlternative.missingInputs, ['real code/log/terminal evidence']);
  assert.equal(codeAlternative.productionReady, false);
  assert.equal(decision.lifecycleBlocker, 'candidate-not-production-approved');
});
