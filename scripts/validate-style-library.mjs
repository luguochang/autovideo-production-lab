import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {validateSemanticSfxPlan} from '../style-library/schema/semantic-sfx-plan.validator.mjs';
import {
  evaluateLifecycleTransition,
  validateLifecycleLedger,
} from '../tools/motion-recipe-lifecycle/lifecycle.mjs';

const root = path.resolve(import.meta.dirname, '..');
const libraryRoot = path.join(root, 'style-library');
const assertions = [];
const check = (name, condition, details = undefined) => assertions.push({name, passed: Boolean(condition), details});

const readJson = async (relativePath) => JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8'));
const exists = async (relativePath) => fs.access(path.join(root, relativePath)).then(() => true).catch(() => false);

const registry = await readJson('style-library/registry.json');
const ids = registry.styles.map((style) => style.id);
check('registry schema version', registry.schemaVersion === 'autovideo-style-registry/v1');
check('16 curated styles', registry.styles.length === 16, {actual: registry.styles.length});
check('style ids unique', new Set(ids).size === ids.length);
check('default base style exists', ids.includes(registry.defaults.baseStyleId));
check('add-on limit is two', registry.defaults.maxAddonStyles === 2);

for (const style of registry.styles) {
  check(`${style.id}: source exists`, await exists(style.sourcePath), style.sourcePath);
  check(`${style.id}: generated guide exists`, await exists(style.guidePath), style.guidePath);
  check(`${style.id}: provenance status`, Boolean(style.status && style.license));
}

const f1 = await readJson('style-library/generated/f1-styles.json');
const officialStyles = await readJson('style-library/generated/hyperframes-official-styles.json');
const framePresets = await readJson('style-library/generated/hyperframes-frame-presets.json');
const officialRegistry = await readJson('style-library/generated/hyperframes-official-registry.json');
const motionRules = await readJson('style-library/generated/hyperframes-motion-rules.json');
const blueprints = await readJson('style-library/generated/hyperframes-blueprints.json');
const syncReport = await readJson('style-library/generated/sync-report.json');

const typeCounts = officialRegistry.reduce((result, item) => {
  result[item.type] = (result[item.type] ?? 0) + 1;
  return result;
}, {});
check('7 F1 specifications extracted', f1.length === 7, {actual: f1.length});
check('8 official named styles extracted', officialStyles.length === 8, {actual: officialStyles.length});
check('official frame presets indexed', framePresets.length >= 13, {actual: framePresets.length});
check('official examples indexed', (typeCounts.example ?? 0) >= 8, typeCounts);
check('official blocks indexed', (typeCounts.block ?? 0) >= 100, typeCounts);
check('official components indexed', (typeCounts.component ?? 0) >= 20, typeCounts);
check('official motion rules indexed', motionRules.length >= 30, {actual: motionRules.length});
check('official blueprints indexed', blueprints.length >= 15, {actual: blueprints.length});
check('official blueprint files exist', (await Promise.all(blueprints.map((blueprint) => exists(blueprint.sourcePath)))).every(Boolean));
check('sync report agrees with registry', syncReport.counts.officialBlocks === typeCounts.block && syncReport.counts.motionRules === motionRules.length);

const selection = await readJson('style-library/examples/demoText-handdrawn-selection.json');
const officialItemNames = new Set(officialRegistry.map((item) => item.name));
const motionRuleIds = new Set(motionRules.map((rule) => rule.id));
const blueprintIds = new Set(blueprints.map((blueprint) => blueprint.id));
const motionLibrary = await readJson('style-library/motion-library/knowledge-explainer-v1.json');
const lifecycleLedger = await readJson('style-library/motion-library/knowledge-explainer.lifecycle.json');
const lifecycleEvidence = await readJson('style-library/examples/knowledge-explainer-e05-lifecycle-evidence.example.json');
const lifecycleReceipt = await readJson('style-library/examples/knowledge-explainer-e05-assessment.receipt.json');
const lifecycleSchema = await readJson('style-library/schema/motion-recipe-lifecycle.schema.json');
const lifecycleEvidenceSchema = await readJson('style-library/schema/motion-recipe-lifecycle-evidence.schema.json');
const lifecycleReceiptSchema = await readJson('style-library/schema/motion-recipe-lifecycle-receipt.schema.json');
const semanticSfxPlan = await readJson('style-library/examples/knowledge-explainer-sfx-plan.example.json');
const motionRecipeIds = motionLibrary.recipes.map((recipe) => recipe.id);
const visualTypes = new Set(motionLibrary.visualTypes);
const sfxRoles = new Set(motionLibrary.sfxPolicy.roles);
const narration = (await fs.readFile(path.join(root, 'demo', 'demoText.txt'), 'utf8')).replace(/\r\n/g, '\n').trim();
const narrationSha256 = crypto.createHash('sha256').update(narration).digest('hex');
check('example selection schema version', selection.schemaVersion === 'autovideo-style-selection/v1');
check('example base style exists', ids.includes(selection.baseStyleId));
check('example add-ons exist and respect limit', selection.addons.length <= registry.defaults.maxAddonStyles && selection.addons.every((id) => ids.includes(id)));
check('example registry items exist', selection.registryItems.every((id) => officialItemNames.has(id)));
check('example motion rules exist', selection.motionRules.every((id) => motionRuleIds.has(id)));
check('example blueprints exist', selection.blueprints.every((id) => blueprintIds.has(id)));
check('example narration hash is current', selection.narrationSha256 === narrationSha256, {expected: narrationSha256, actual: selection.narrationSha256});
check('example remains unapproved', selection.status === 'draft' && selection.approvedBy === null);
check('example has provenance receipts', selection.receipts.length >= 1 && selection.receipts.every((receipt) => receipt.source && receipt.kind && receipt.license));

check('motion library schema version', motionLibrary.schemaVersion === 'autovideo-motion-recipe-library/v1');
check('motion library is a 1920x1080 16:9 candidate', motionLibrary.status === 'candidate'
  && motionLibrary.format.ratio === '16:9'
  && motionLibrary.format.width === 1920
  && motionLibrary.format.height === 1080);
check('motion recipe ids unique', new Set(motionRecipeIds).size === motionRecipeIds.length);
check('motion library covers non-text carriers', ['evidence-image', 'device-surface', 'diagram', 'data-proof', 'comparison', 'code-surface', 'object-metaphor']
  .every((visualType) => visualTypes.has(visualType)));
check('motion library receipts resolve', (await Promise.all(motionLibrary.receipts.map((receipt) => exists(receipt.source)))).every(Boolean));
check('motion library SFX contract is discoverable', motionLibrary.sfxPolicy.contractPath === 'style-library/schema/semantic-sfx-plan.schema.json'
  && motionLibrary.sfxPolicy.examplePath === 'style-library/examples/knowledge-explainer-sfx-plan.example.json'
  && motionLibrary.sfxPolicy.resolver === 'media-use'
  && motionLibrary.sfxPolicy.manifestPath === '.media/manifest.jsonl'
  && motionLibrary.sfxPolicy.pathPrefix === '.media/audio/sfx/'
  && motionLibrary.sfxPolicy.allowRemoteAtRender === false
  && motionLibrary.sfxPolicy.allowUnregisteredAssets === false
  && motionLibrary.sfxPolicy.requireSha256 === true);

for (const recipe of motionLibrary.recipes) {
  const phaseNames = recipe.phases.map((phase) => phase.name);
  const phasesAreContinuous = recipe.phases[0]?.startPct === 0
    && recipe.phases.at(-1)?.endPct === 1
    && recipe.phases.every((phase, index) => phase.startPct < phase.endPct
      && (index === 0 || phase.startPct === recipe.phases[index - 1].endPct));
  check(`${recipe.id}: visual type exists`, visualTypes.has(recipe.visualType), recipe.visualType);
  check(`${recipe.id}: candidate is unapproved`, recipe.status === 'candidate'
    && recipe.approval.probeReceipt === null
    && recipe.approval.approvedBy === null
    && recipe.approval.approvedAt === null);
  check(`${recipe.id}: HyperFrames owns deterministic rendering`, recipe.determinism.timelineOwner === 'hyperframes'
    && recipe.determinism.seekSafe === true
    && recipe.determinism.networkAtRender === false);
  check(`${recipe.id}: build/breathe/resolve phases`, phaseNames.join(',') === 'build,breathe,resolve' && phasesAreContinuous, recipe.phases);
  check(`${recipe.id}: registry items exist`, recipe.reuse.registryItems.every((id) => officialItemNames.has(id)), recipe.reuse.registryItems);
  check(`${recipe.id}: motion rules exist`, recipe.reuse.motionRules.every((id) => motionRuleIds.has(id)), recipe.reuse.motionRules);
  check(`${recipe.id}: blueprints exist`, recipe.reuse.blueprints.every((id) => blueprintIds.has(id)), recipe.reuse.blueprints);
  check(`${recipe.id}: SFX roles allowed`, recipe.allowedSfxRoles.every((role) => sfxRoles.has(role)), recipe.allowedSfxRoles);
  check(`${recipe.id}: fallback exists`, recipe.fallbackRecipeId === null || motionRecipeIds.includes(recipe.fallbackRecipeId), recipe.fallbackRecipeId);
}

const ajv = new Ajv2020({allErrors: true, strict: true});
addFormats(ajv);
for (const schema of [lifecycleSchema, lifecycleEvidenceSchema, lifecycleReceiptSchema]) ajv.addSchema(schema);
const schemaCheck = (schemaId, document) => {
  const validator = ajv.getSchema(schemaId);
  const passed = Boolean(validator?.(document));
  return {passed, errors: structuredClone(validator?.errors ?? [])};
};
const lifecycleSchemaResult = schemaCheck(lifecycleSchema.$id, lifecycleLedger);
const evidenceSchemaResult = schemaCheck(lifecycleEvidenceSchema.$id, lifecycleEvidence);
const receiptSchemaResult = schemaCheck(lifecycleReceiptSchema.$id, lifecycleReceipt);
check('motion lifecycle ledger satisfies JSON Schema', lifecycleSchemaResult.passed, lifecycleSchemaResult.errors);
check('motion lifecycle E05 evidence satisfies JSON Schema', evidenceSchemaResult.passed, evidenceSchemaResult.errors);
check('motion lifecycle E05 receipt satisfies JSON Schema', receiptSchemaResult.passed, receiptSchemaResult.errors);

const lifecycleContext = {
  ledger: lifecycleLedger,
  library: motionLibrary,
  catalogs: {officialRegistry, officialBlueprints: blueprints, officialMotionRules: motionRules},
};
const lifecycleIssues = await validateLifecycleLedger({workspaceRoot: root, ...lifecycleContext});
check('motion lifecycle ledger hashes and definitions are current', lifecycleIssues.length === 0, lifecycleIssues);
check('all eight motion recipes remain unpromoted candidates', lifecycleLedger.entries.length === 8
  && lifecycleLedger.entries.every((entry) => entry.state === 'candidate'
    && entry.revision === 0
    && entry.receiptRefs.length === 0
    && entry.projectApprovals.length === 0
    && entry.retirement === null));

let e05Evaluation = null;
let e05EvaluationError = null;
if (lifecycleIssues.length === 0) {
  try {
    e05Evaluation = await evaluateLifecycleTransition({
      workspaceRoot: root,
      ...lifecycleContext,
      recipeId: 'keyword-handoff',
      targetState: 'probe-passed',
      evidence: lifecycleEvidence,
      actor: 'autovideo-e05-audit',
      now: '2026-07-20T12:15:00.000Z',
    });
  } catch (error) {
    e05EvaluationError = error.stack || error.message;
  }
}
check('E05 batch-contract evidence remains blocked at candidate', e05Evaluation?.allowed === false
  && e05Evaluation.receipt.effectiveState === 'candidate'
  && e05Evaluation.receipt.blockedReasons.includes('not-a-motion-probe')
  && e05Evaluation.receipt.blockedReasons.includes('missing-host-asset-binding'), e05EvaluationError ?? e05Evaluation?.receipt);
check('E05 checked-in assessment receipt is reproducible', Boolean(e05Evaluation)
  && isDeepStrictEqual(e05Evaluation.receipt, lifecycleReceipt), e05EvaluationError ?? e05Evaluation?.receipt);

const semanticSfxErrors = validateSemanticSfxPlan(semanticSfxPlan, motionLibrary);
const hasSemanticSfxError = (...prefixes) => semanticSfxErrors.some((error) => prefixes.some((prefix) => error.code.startsWith(prefix)));
check('semantic SFX example style locks', !hasSemanticSfxError('style.'));
check('semantic SFX example pins library version and path', !hasSemanticSfxError('library.'));
check('semantic SFX example policy matches media-use contract', !hasSemanticSfxError('policy.', 'asset.', 'mix.'));
check('semantic SFX example bindings are unique and valid', !hasSemanticSfxError('binding', 'bindings.'));
check('semantic SFX example cues are ordered, sparse, and unique', !hasSemanticSfxError('cue.order', 'cue.minGap', 'cue.density', 'cue.uniqueId'));
check('semantic SFX cue roles match recipes and bindings', !hasSemanticSfxError('cue.role', 'cue.recipe', 'cue.binding', 'cue.anchor'));
check('semantic SFX cues target content-world only', !hasSemanticSfxError('cue.targetLayer'));
check('semantic SFX example satisfies full contract', semanticSfxErrors.length === 0, semanticSfxErrors);

for (const required of [
  'AGENTS.md',
  'style-library/STYLE_REGISTRY.md',
  'style-library/MOTION_REGISTRY.md',
  'style-library/motion-library/knowledge-explainer-v1.json',
  'style-library/motion-library/knowledge-explainer.lifecycle.json',
  'style-library/motion-library/README.md',
  'style-library/schema/motion-recipe-library.schema.json',
  'style-library/schema/motion-recipe-lifecycle.schema.json',
  'style-library/schema/motion-recipe-lifecycle-evidence.schema.json',
  'style-library/schema/motion-recipe-lifecycle-receipt.schema.json',
  'style-library/schema/semantic-sfx-plan.schema.json',
  'style-library/schema/semantic-sfx-plan.validator.mjs',
  'style-library/SOURCES.md',
  'style-library/schema/style-selection.schema.json',
  'style-library/templates/VIDEO_TASK.md',
  'style-library/templates/STYLE_REVIEW.md',
  'style-library/examples/demoText-handdrawn-selection.json',
  'style-library/examples/knowledge-explainer-sfx-plan.example.json',
  'style-library/examples/knowledge-explainer-e05-lifecycle-evidence.example.json',
  'style-library/examples/knowledge-explainer-e05-assessment.receipt.json',
  'style-library/tests/semantic-sfx-contract.test.mjs',
  'tools/motion-recipe-lifecycle/lifecycle.mjs',
  'tools/motion-recipe-lifecycle/test/lifecycle.test.mjs',
  'scripts/motion-recipe-lifecycle.mjs',
  'docs/18-动效配方晋级与退役SOP.md',
  'vendor/hyperframes-student-kit/LICENSE',
  'vendor/hyperframes-student-kit/MOTION_PHILOSOPHY.md',
  'vendor/hyperframes-student-kit/video-projects/may-shorts-19/index.html',
]) check(`${required} exists`, await exists(required));

check('style selection schema parses', Boolean(await readJson('style-library/schema/style-selection.schema.json')));
check('motion recipe library schema parses', Boolean(await readJson('style-library/schema/motion-recipe-library.schema.json')));
check('motion recipe lifecycle schema parses', Boolean(lifecycleSchema));
check('motion recipe lifecycle evidence schema parses', Boolean(lifecycleEvidenceSchema));
check('motion recipe lifecycle receipt schema parses', Boolean(lifecycleReceiptSchema));
check('semantic SFX plan schema parses', Boolean(await readJson('style-library/schema/semantic-sfx-plan.schema.json')));

const report = {
  schemaVersion: 'autovideo-style-validation/v1',
  validatedAt: new Date().toISOString(),
  passed: assertions.every((assertion) => assertion.passed),
  assertions,
};
await fs.mkdir(path.join(libraryRoot, 'qa'), {recursive: true});
await fs.writeFile(path.join(libraryRoot, 'qa', 'validation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({passed: report.passed, checks: assertions.length, failures: assertions.filter((item) => !item.passed)}, null, 2));
if (!report.passed) process.exitCode = 1;
