import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectId = process.argv[2];
if (!projectId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId)) {
  throw new Error('Usage: node scripts/repair-workbench-metadata.mjs <project-id>');
}
const dbPath = path.join(root, 'workflow-console', 'data', 'db.json');
const formalStatePath = path.join(root, 'hyperframes-workflow-kit', 'projects', projectId, 'project-state.json');

const main = async () => {
  const [db, formalState] = await Promise.all([
    fs.readFile(dbPath, 'utf8').then(JSON.parse),
    fs.readFile(formalStatePath, 'utf8').then(JSON.parse),
  ]);
  const project = db.projects?.[projectId];
  if (!project) throw new Error(`Unknown workbench project: ${projectId}`);
  const previous = {
    title: project.title,
    platform: project.platform,
    audience: project.audience,
    targetOutcome: project.targetOutcome,
    rightsNotes: project.rightsNotes,
  };
  const title = projectId === 'demotext-standard-delivery-v2'
    ? 'DemoText 标准交付 V2'
    : project.title;
  Object.assign(project, {
    title,
    platform: formalState.inputs.platform,
    audience: formalState.inputs.audience,
    targetOutcome: formalState.inputs.rememberedOutcome,
    rightsNotes: '仅内部制作：CosyVoice 预设 14 speaker 与人物素材的公开发布权利尚未核实；99%/90%/30K 仅作为创作者观点呈现。',
    updatedAt: new Date().toISOString(),
  });
  project.events.unshift({
    id: crypto.randomUUID(),
    type: 'metadata-encoding-repaired',
    at: project.updatedAt,
    message: 'Repaired workbench display metadata from the already-approved formal project state. No content or timing contract changed.',
    previous,
  });
  project.events = project.events.slice(0, 250);
  await fs.writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ok: true, projectId, title: project.title, platform: project.platform, audience: project.audience, targetOutcome: project.targetOutcome}, null, 2));
};

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
