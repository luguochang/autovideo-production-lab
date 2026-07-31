import fs from 'node:fs/promises';
import {openComposition} from '@hyperframes/sdk';
import {createFsAdapter} from '@hyperframes/sdk/adapters/fs';

const html = await fs.readFile('index.html', 'utf8');
const adapter = createFsAdapter({root: './sdk-output', maxVersions: 5});
const comp = await openComposition(html, {persist: adapter, persistPath: 'editable.html'});
const titleId = 'hf-output-title';
const title = comp.getElement(titleId);
if (!title || title.attributes.id !== 'output-title' || title.text !== '输出也必须是流式的') {
  throw new Error('SDK could not resolve the explicit stable title ID');
}

const patches = [];
comp.on('patch', (event) => patches.push({origin: event.origin, opTypes: event.opTypes, patches: event.patches}));
comp.batch(() => {
  comp.setText(titleId, '输出链：边生成、边播放');
  comp.setStyle(titleId, {color: '#8f3141'});
}, {origin: 'experiment:manual-edit'});

if (!comp.canUndo()) throw new Error('Undo stack was not populated');
comp.undo();
comp.redo();
await comp.flush();
comp.dispose();

const persisted = await fs.readFile('sdk-output/editable.html', 'utf8');
if (!persisted.includes('输出链：边生成、边播放')) throw new Error('Edited text was not persisted');
if (!persisted.includes('color: #8f3141')) throw new Error('Edited style was not persisted');
const undoTextPatch = patches[1]?.patches.find((patch) => patch.path.endsWith('/text'));
if (undoTextPatch?.value !== '输出也必须是流式的') throw new Error('Undo patch did not target only the selected title');

await fs.writeFile('sdk-output/patches.json', `${JSON.stringify({titleId, patchEvents: patches}, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ok: true, titleId, patchEventCount: patches.length, undoRedoVerified: true, persisted: 'sdk-output/editable.html'}));
