import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const registryPath = path.join(root, 'style-library', 'assets', 'ASSET_REGISTRY.json');
const reportPath = path.join(root, 'style-library', 'qa', 'asset-library-validation.json');
const shaPattern = /^[a-f0-9]{64}$/;
const allowedSfxRoles = new Set(['focus-hit', 'connector-draw', 'state-change', 'error', 'chapter-resolve']);
const results = [];
const check = (name, passed, details = undefined) => results.push({name, passed: Boolean(passed), details});
const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));
const relativePath = (value) => path.resolve(root, value);
const hashFile = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
const exists = async (filePath) => fs.access(filePath).then(() => true).catch(() => false);

const registry = await readJson(registryPath);
check('registry schema version', registry.schemaVersion === 'autovideo-asset-registry/v1');
check('registry has a versioned library id', Boolean(registry.libraryId && registry.version));
check('remote render is disabled', registry.policy?.allowRemoteAtRender === false);
check('frozen source and SHA are required', registry.policy?.requireFrozenLocalSource === true && registry.policy?.requireSha256 === true);
check('semantic SFX policy is sparse', registry.policy?.sfx?.maxPerMinute === 6 && registry.policy?.sfx?.minGapSeconds === 2.4);

const all = [...(registry.assets ?? []), ...(registry.motionComponents ?? [])];
const ids = all.map((item) => item.id);
check('asset ids are unique', new Set(ids).size === ids.length, ids);

const contentKeys = new Set();
for (const item of all) {
  const label = `${item.type}:${item.id}`;
  check(`${label}: id is stable`, /^[a-z][a-z0-9-]*$/.test(item.id));
  check(`${label}: path is local`, typeof item.path === 'string' && !/^(?:[a-z]+:)?\/\//i.test(item.path));
  const source = relativePath(item.path);
  check(`${label}: source exists`, await exists(source), item.path);
  check(`${label}: SHA is valid`, shaPattern.test(item.sha256 ?? ''), item.sha256);
  if (await exists(source) && shaPattern.test(item.sha256 ?? '')) {
    const actual = await hashFile(source);
    check(`${label}: SHA matches source`, actual === item.sha256, {expected: item.sha256, actual});
  }
  check(`${label}: license receipt is present`, Boolean(item.licenseReceipt || item.license));
  if (item.licenseReceipt) check(`${label}: license receipt exists`, await exists(relativePath(item.licenseReceipt)), item.licenseReceipt);
  if (item.type === 'sfx') {
    check(`${label}: duration is finite`, Number.isFinite(item.durationSeconds) && item.durationSeconds > 0, item.durationSeconds);
    check(`${label}: provider is present`, Boolean(item.provider));
    check(`${label}: semantic roles are known`, Array.isArray(item.semanticRoles) && item.semanticRoles.length > 0 && item.semanticRoles.every((role) => allowedSfxRoles.has(role)), item.semanticRoles);
    const key = `${item.type}:${item.sha256}`;
    check(`${label}: canonical content is unique`, !contentKeys.has(key), key);
    contentKeys.add(key);
  }
}

await fs.mkdir(path.dirname(reportPath), {recursive: true});
const report = {
  schemaVersion: 'autovideo-asset-library-validation/v1',
  validatedAt: new Date().toISOString(),
  passed: results.every((item) => item.passed),
  counts: {assets: registry.assets?.length ?? 0, motionComponents: registry.motionComponents?.length ?? 0},
  assertions: results,
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({passed: report.passed, checks: results.length, failures: results.filter((item) => !item.passed)}, null, 2));
if (!report.passed) process.exitCode = 1;
