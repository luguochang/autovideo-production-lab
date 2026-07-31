import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {
  Braces,
  Bug,
  Cpu,
  Database,
  Layers3,
  MousePointerClick,
  ShieldCheck,
  Workflow,
} from '../workflow-console/node_modules/lucide-react/dist/esm/lucide-react.js';

const root = path.resolve(import.meta.dirname, '..');
const outputDir = path.join(root, 'style-library', 'assets', 'visual-icons');
const accent = '#155E75';
const specs = [
  ['icon-model-cpu', Cpu],
  ['icon-workflow', Workflow],
  ['icon-system-layers', Layers3],
  ['icon-data-store', Database],
  ['icon-permission-check', ShieldCheck],
  ['icon-code-braces', Braces],
  ['icon-debug-bug', Bug],
  ['icon-click-pointer', MousePointerClick],
];

const hashFile = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');

const renderIcon = (Icon) => renderToStaticMarkup(React.createElement(Icon, {
  size: 512,
  color: accent,
  strokeWidth: 1.55,
  absoluteStrokeWidth: false,
})).replaceAll('currentColor', accent);

await fs.mkdir(outputDir, {recursive: true});
const generated = [];
for (const [id, Icon] of specs) {
  const svgPath = path.join(outputDir, `${id}.svg`);
  await fs.writeFile(svgPath, renderIcon(Icon), 'utf8');
  const stat = await fs.stat(svgPath);
  generated.push({
    id,
    path: path.relative(root, svgPath).replaceAll('\\', '/'),
    bytes: stat.size,
    sha256: await hashFile(svgPath),
  });
}

console.log(JSON.stringify({generated}, null, 2));
