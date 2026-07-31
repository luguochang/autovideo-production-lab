import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outputRoot = path.join(root, 'style-library');
const generatedDir = path.join(outputRoot, 'generated');
const f1Source = path.join(root, 'demo', 'f1', 'HF_风格与动效库_分享包搭建说明 (1).md');
const hyperframesRoot = path.join(root, 'vendor', 'hyperframes');
const creativeRoot = path.join(hyperframesRoot, 'skills', 'hyperframes-creative');
const animationRoot = path.join(hyperframesRoot, 'skills', 'hyperframes-animation');

const writeJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), {recursive: true});
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const normalize = (value) => value.replace(/\r\n/g, '\n');
const slugify = (value) => value
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const extractSections = (markdown, headingPattern) => {
  const lines = normalize(markdown).split('\n');
  const starts = [];
  lines.forEach((line, index) => {
    const match = line.match(headingPattern);
    if (match) starts.push({index, match});
  });
  return starts.map((entry, index) => ({
    match: entry.match,
    markdown: lines.slice(entry.index, starts[index + 1]?.index ?? lines.length).join('\n').trim(),
  }));
};

const f1Markdown = await fs.readFile(f1Source, 'utf8');
const f1Sections = extractSections(f1Markdown, /^## A([1-7])\.\s+`([^`]+)`：(.+)$/u);
if (f1Sections.length !== 7) throw new Error(`Expected 7 F1 styles, found ${f1Sections.length}`);

for (const section of f1Sections) {
  const [, number, id, label] = section.match;
  const target = path.join(outputRoot, 'styles', 'f1', id, 'STYLE_GUIDE.md');
  const header = [
    `# ${label}`,
    '',
    `> Generated snapshot from \`demo/f1/HF_风格与动效库_分享包搭建说明 (1).md\`, section A${number}.`,
    '> Provenance status: user-provided specification only. Referenced examples, images, components, and their licenses were not included.',
    '> Refresh with `node scripts/sync-style-library.mjs`; do not edit this generated snapshot directly.',
    '',
  ].join('\n');
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, `${header}${section.markdown}\n`, 'utf8');
}

const officialStyleSource = path.join(creativeRoot, 'references', 'visual-styles.md');
const officialMarkdown = await fs.readFile(officialStyleSource, 'utf8');
const officialSections = extractSections(officialMarkdown, /^## ([1-8])\.\s+(.+?)(?:\s+鈥.*)?$/u);
if (officialSections.length !== 8) throw new Error(`Expected 8 official styles, found ${officialSections.length}`);

const officialStyles = [];
for (const section of officialSections) {
  const [, number, rawName] = section.match;
  const name = rawName.replace(/\s+[鈥—-].*$/u, '').trim();
  const id = slugify(name);
  const target = path.join(outputRoot, 'styles', 'official', id, 'STYLE_GUIDE.md');
  const header = [
    `# ${name}`,
    '',
    `> Generated snapshot from HyperFrames \`visual-styles.md\`, section ${number}.`,
    '> Source license: Apache-2.0. Refresh with `node scripts/sync-style-library.mjs`.',
    '',
  ].join('\n');
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, `${header}${section.markdown}\n`, 'utf8');
  officialStyles.push({id, name, sourcePath: path.relative(root, officialStyleSource).replaceAll('\\', '/'), guidePath: path.relative(root, target).replaceAll('\\', '/')});
}

const framePresetRoot = path.join(creativeRoot, 'frame-presets');
const framePresetEntries = await fs.readdir(framePresetRoot, {withFileTypes: true});
const framePresets = [];
for (const entry of framePresetEntries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const presetDir = path.join(framePresetRoot, entry.name);
  const files = (await fs.readdir(presetDir)).sort();
  const framePath = path.join(presetDir, 'FRAME.md');
  const frame = await fs.readFile(framePath, 'utf8');
  const title = frame.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? entry.name;
  framePresets.push({
    id: entry.name,
    title,
    sourcePath: path.relative(root, framePath).replaceAll('\\', '/'),
    files,
    license: 'Apache-2.0',
  });
}

const registryRoot = path.join(hyperframesRoot, 'registry');
const registry = JSON.parse(await fs.readFile(path.join(registryRoot, 'registry.json'), 'utf8'));
const typeDirectory = {
  'hyperframes:example': 'examples',
  'hyperframes:block': 'blocks',
  'hyperframes:component': 'components',
};
const officialRegistry = [];
for (const item of registry.items) {
  const directory = typeDirectory[item.type];
  const itemPath = path.join(registryRoot, directory, item.name, 'registry-item.json');
  const detail = JSON.parse(await fs.readFile(itemPath, 'utf8'));
  officialRegistry.push({
    name: detail.name,
    type: detail.type.replace('hyperframes:', ''),
    title: detail.title,
    description: detail.description,
    tags: detail.tags ?? [],
    dimensions: detail.dimensions ?? null,
    duration: detail.duration ?? null,
    sourcePath: path.relative(root, itemPath).replaceAll('\\', '/'),
    license: 'Apache-2.0',
  });
}

const rulesPath = path.join(animationRoot, 'rules-index.md');
const rulesMarkdown = await fs.readFile(rulesPath, 'utf8');
const motionRules = [];
for (const match of rulesMarkdown.matchAll(/<([a-z0-9-]+)\s+path="([^"]+)">([\s\S]*?)<\/\1>/gi)) {
  const [, id, relativeRulePath, rawDescription] = match;
  const tagsMatch = rawDescription.match(/Tags:\s*([^<]+)/i);
  const tags = tagsMatch ? tagsMatch[1].split(',').map((tag) => tag.trim()).filter(Boolean) : [];
  motionRules.push({
    id,
    description: rawDescription.replace(/\s*Tags:\s*[^<]+$/i, '').replace(/\s+/g, ' ').trim(),
    tags,
    sourcePath: path.relative(root, path.join(animationRoot, relativeRulePath)).replaceAll('\\', '/'),
    license: 'Apache-2.0',
  });
}

const blueprintIndexPath = path.join(animationRoot, 'blueprints-index.md');
const blueprintMarkdown = await fs.readFile(blueprintIndexPath, 'utf8');
const blueprints = [];
for (const match of blueprintMarkdown.matchAll(/<blueprint\s+id="([^"]+)"\s+roles="([^"]+)"\s+duration="([^"]+)">([\s\S]*?)<\/blueprint>/gi)) {
  const [, id, roles, duration, description] = match;
  blueprints.push({
    id,
    roles: roles.split(',').map((role) => role.trim()).filter(Boolean),
    duration,
    description: description.replace(/\s+/g, ' ').trim(),
    sourcePath: path.relative(root, path.join(animationRoot, 'blueprints', `${id}.md`)).replaceAll('\\', '/'),
    license: 'Apache-2.0',
  });
}

await writeJson(path.join(generatedDir, 'f1-styles.json'), f1Sections.map((section) => ({
  id: section.match[2],
  label: section.match[3],
  sourceSection: `A${section.match[1]}`,
  provenance: 'user-provided-spec-only',
})));
await writeJson(path.join(generatedDir, 'hyperframes-official-styles.json'), officialStyles);
await writeJson(path.join(generatedDir, 'hyperframes-frame-presets.json'), framePresets);
await writeJson(path.join(generatedDir, 'hyperframes-official-registry.json'), officialRegistry);
await writeJson(path.join(generatedDir, 'hyperframes-motion-rules.json'), motionRules);
await writeJson(path.join(generatedDir, 'hyperframes-blueprints.json'), blueprints);

const counts = officialRegistry.reduce((result, item) => {
  result[item.type] = (result[item.type] ?? 0) + 1;
  return result;
}, {});
const report = {
  schemaVersion: 'autovideo-style-sync/v1',
  generatedAt: new Date().toISOString(),
  counts: {
    f1Styles: f1Sections.length,
    officialNamedStyles: officialStyles.length,
    framePresets: framePresets.length,
    officialExamples: counts.example ?? 0,
    officialBlocks: counts.block ?? 0,
    officialComponents: counts.component ?? 0,
    motionRules: motionRules.length,
    blueprints: blueprints.length,
  },
};
await writeJson(path.join(generatedDir, 'sync-report.json'), report);
console.log(JSON.stringify(report, null, 2));
