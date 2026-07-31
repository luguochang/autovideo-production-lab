#!/usr/bin/env node

import {copyFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderContinuousIndex} from './lib/render-continuous-index.mjs';
import {writeUtf8} from './lib/common.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const projectDir = path.join(root, 'hyperframes-workflow-kit', 'projects', 'batch-smoke-30s-20260720');
const outputDir = path.join(projectDir, 'review', 'carrier-adapter-probes');

const recipe = (visualType, recipeId) => [{
  libraryId: 'knowledge-explainer', libraryVersion: '1.0.0', recipeId, version: '1.0.0',
  params: {entrance: 'lift', handoff: 'compact-up', enterSeconds: 0.58, handoffSeconds: 0.5, staggerSeconds: 0.07, variant: 'signal'},
  sourceCueIds: ['cue-001'],
}];

const definitions = [
  {
    id: 'data-proof', visualType: 'data-proof', recipeId: 'data-proof', hostPose: 'read', title: '结构化数据怎样变成画面',
    narration: '示例数据只验证图表动效，不代表真实业务结论。',
    carrierPayload: {
      adapterId: 'data-chart-bounded', adapterVersion: '1.0.0', zone: 'content.right', sourceReceipt: 'hf-registry:data-chart@02ccb24bfa21850d', sourceCueIds: ['cue-001'],
      evidence: {status: 'illustrative-mock', label: '技术探针示例数据'},
      data: {title: '三种信息载体', unit: '%', highlightIndex: 1, series: [{label: '纯文字', value: 28}, {label: '图表', value: 72}, {label: '流程图', value: 58}]},
    },
  },
  {
    id: 'code-surface', visualType: 'code-surface', recipeId: 'code-proof', hostPose: 'explain', title: '真实代码结构，局部聚焦',
    narration: '代码载体保留上下文，只对关键行做聚焦。',
    carrierPayload: {
      adapterId: 'code-surface-bounded', adapterVersion: '1.0.0', zone: 'content.right', sourceReceipt: 'hf-registry:code-diff+code-highlight@5356890f+2e28ffdb', sourceCueIds: ['cue-001'],
      evidence: {status: 'illustrative-mock', label: '技术探针示例代码'},
      data: {title: '发布前门禁', language: 'TypeScript', mode: 'diff', lines: [{kind: 'context', text: 'const result = await checkProject()'}, {kind: 'remove', text: 'publish(result.output)'}, {kind: 'add', text: 'if (!result.approved) return block()'}, {kind: 'focus', text: 'publish(result.approvedOutput)'}]},
    },
  },
  {
    id: 'device-surface', visualType: 'device-surface', recipeId: 'device-surface-tour', hostPose: 'point-right', title: '界面状态连续变化',
    narration: '示意界面必须标注，并且只在右侧内容区切换状态。',
    carrierPayload: {
      adapterId: 'device-surface-bounded', adapterVersion: '1.0.0', zone: 'content.right', sourceReceipt: 'hf-registry:app-showcase@c7e1b4d8ec2a2c1f', sourceCueIds: ['cue-001'],
      evidence: {status: 'illustrative-mock', label: '工作台示意界面'},
      data: {title: '从素材到审片', productLabel: 'AutoVideo 工作台', activeState: 1, states: [{label: '素材登记', rows: ['观点台账', '来源回执']}, {label: '画面编排', rows: ['载体选择', '动效微调']}, {label: '发布门禁', rows: ['人耳试听', '成片终审']}]},
    },
  },
];

async function main() {
  await mkdir(path.join(outputDir, 'assets', 'host'), {recursive: true});
  await mkdir(path.join(outputDir, 'assets', 'runtime'), {recursive: true});
  const hostManifestPath = path.join(projectDir, 'production-assets', 'host-assets.manifest.json');
  const hostManifest = JSON.parse(await (await import('node:fs/promises')).readFile(hostManifestPath, 'utf8'));
  const hostItems = hostManifest.assets ?? hostManifest.poses ?? hostManifest.items ?? [];
  const hostAssets = new Map();
  for (const definition of definitions) {
    const item = hostItems.find((entry) => (entry.id || entry.poseId) === definition.hostPose);
    if (!item) throw new Error(`Missing host pose ${definition.hostPose}`);
    const source = path.resolve(path.dirname(hostManifestPath), item.output?.path || item.path || item.outputPath || item.file);
    const target = path.join(outputDir, 'assets', 'host', `${definition.hostPose}.png`);
    await copyFile(source, target);
    hostAssets.set(definition.hostPose, `./assets/host/${definition.hostPose}.png`);
  }
  await copyFile(path.join(projectDir, 'review', 'probe-project', 'assets', 'gsap.min.js'), path.join(outputDir, 'assets', 'runtime', 'gsap.min.js'));
  const rootIndex = [];
  for (const definition of definitions) {
    const dir = path.join(outputDir, definition.id);
    await mkdir(path.join(dir, 'assets'), {recursive: true});
    await copyFile(path.join(outputDir, 'assets', 'runtime', 'gsap.min.js'), path.join(dir, 'assets', 'gsap.min.js'));
    await copyFile(path.join(root, 'vendor', 'hyperframes', 'skills', 'hyperframes-creative', 'frame-presets', 'claude', 'fonts', 'JetBrainsMono-400.woff2'), path.join(dir, 'assets', 'JetBrainsMono-400.woff2'));
    await copyFile(path.join(root, 'vendor', 'hyperframes', 'skills', 'hyperframes-creative', 'frame-presets', 'claude', 'fonts', 'JetBrainsMono-700.woff2'), path.join(dir, 'assets', 'JetBrainsMono-700.woff2'));
    await copyFile(path.join(outputDir, 'assets', 'host', `${definition.hostPose}.png`), path.join(dir, 'assets', 'host.png'));
    const scene = {id: 'scene-01', order: 1, role: 'proof', title: definition.title, start: 0, end: 6, duration: 6, layout: {hostPose: definition.hostPose, hostZone: 'host.left', contentZone: 'content.right'}};
    const shot = {cueId: 'cue-001', sceneId: 'scene-01', narration: definition.narration, start: 0, end: 6, duration: 6, screenText: {text: definition.title, type: 'generated-summary'}, visualType: definition.visualType, carrierPayload: definition.carrierPayload, motionRecipeRefs: recipe(definition.visualType, definition.recipeId), assetRefs: [], sfxRefs: [], resolvedAssets: [], resolvedSfx: []};
    let html = renderContinuousIndex({manifest: {projectId: `carrier-probe-${definition.id}`, timeline: {duration: 6}}, scenes: [scene], shots: [shot], hostAssets: new Map([[definition.hostPose, './assets/host.png']])});
    html = html.replaceAll('./assets/runtime/', './assets/').replace(/<audio[^>]+id="narration-final"[^>]*><\/audio>/, '');
    await writeUtf8(path.join(dir, 'index.html'), html);
    await writeUtf8(path.join(dir, 'index.motion.json'), JSON.stringify({duration: 6.35, assertions: [{kind: 'appearsBy', selector: '#host-zone', bySec: 0.9}, {kind: 'appearsBy', selector: '#visual-cue-001', bySec: 0.9}, {kind: 'before', a: '.bounded-carrier', b: '.carrier-evidence'}, {kind: 'staysInFrame', selector: '#host-zone'}, {kind: 'staysInFrame', selector: '#content-zone'}, {kind: 'staysInFrame', selector: '#caption-shell'}, {kind: 'keepsMoving', withinSelector: '.bounded-carrier', maxStaticSec: 2.2}]}, null, 2));
    await writeUtf8(path.join(dir, 'package.json'), JSON.stringify({name: `carrier-probe-${definition.id}`, private: true, type: 'module', scripts: {check: 'npx --yes hyperframes@0.7.77 check', snapshot: 'npx --yes hyperframes@0.7.77 snapshot'}}, null, 2));
    rootIndex.push({id: definition.id, visualType: definition.visualType, evidenceStatus: definition.carrierPayload.evidence.status, humanReview: 'pending'});
  }
  await writeUtf8(path.join(outputDir, 'probe-index.json'), JSON.stringify({schemaVersion: 'autovideo-carrier-probes/v1', projectId: 'batch-smoke-30s-20260720', scope: 'technical-component-probes', fixedShell: {background: '#F2DFC7', hostZone: 'host.left', contentZone: 'content.right', captionPersistent: true}, publicationApproval: false, probes: rootIndex}, null, 2));
  console.log(JSON.stringify({ok: true, outputDir, count: definitions.length}, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
