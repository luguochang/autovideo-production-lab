import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {readProjectMediaInventory, resolveProjectMediaFile} from '../lib/media-assets.mjs';
import {resolveFfprobe} from '../lib/ffprobe-resolver.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

test('ffprobe resolves from PATH or the workspace-bundled Remotion binary', async () => {
  const resolved = await resolveFfprobe({workspaceRoot: root});
  assert.ok(resolved, 'Expected a usable ffprobe from PATH or workspace dependencies.');
  assert.match(path.basename(resolved.path).toLowerCase(), /^ffprobe(?:\.exe)?$/);
  assert.ok(['PATH', 'workspace-bundled', 'explicit'].includes(resolved.source));
});

test('unsafe SVG media stays unselectable and unavailable for preview', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(root, 'workflow-console', 'data', 'media-assets-test-'));
  t.after(() => fs.rm(projectRoot, {recursive: true, force: true}));
  const relativePath = '.media/images/icons/untrusted.svg';
  const source = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
  const target = path.join(projectRoot, relativePath);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, source, 'utf8');
  await fs.writeFile(path.join(projectRoot, '.media', 'manifest.jsonl'), `${JSON.stringify({
    id: 'untrusted-icon',
    type: 'icon',
    path: relativePath,
    sha256: sha256(source),
    provider: 'test',
    licenseReceipt: 'test-license',
  })}\n`, 'utf8');

  const inventory = await readProjectMediaInventory({projectRoot, projectId: 'media-assets-test'});
  assert.equal(inventory.byId.get('untrusted-icon').selectionReady, false);
  assert.equal(inventory.byId.get('untrusted-icon').integrityIssue, 'unsafe-svg');
  await assert.rejects(
    resolveProjectMediaFile({projectRoot, projectId: 'media-assets-test', assetId: 'untrusted-icon'}),
    /not available for preview/,
  );
});
