import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {freezeContentIntake} from '../lib/content-intake.mjs';
import {ingestContentIntakeVisuals} from '../lib/intake-visual-ingestion.mjs';
import {loadMediaLedger, renderMediaIndex} from '../../tools/hyperframes-production/lib/media-ledger.mjs';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

test('immutable intake visuals enter formal media once with provenance and no shot attachment', async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-intake-visual-'));
  t.after(() => fs.rm(workspaceRoot, {recursive: true, force: true}));
  const projectId = 'intake-visual-fixture';
  const sourceDir = path.join(workspaceRoot, 'source-materials');
  await fs.mkdir(sourceDir, {recursive: true});
  await fs.writeFile(path.join(sourceDir, 'screen.png'), png);
  await fs.writeFile(path.join(sourceDir, 'notes.md'), '# Notes\nUse the screenshot as evidence.\n', 'utf8');
  const workbenchRoot = path.join(workspaceRoot, 'workbench-project');
  const frozen = await freezeContentIntake({
    workspaceRoot,
    projectRoot: workbenchRoot,
    projectId,
    input: {type: 'material-directory', path: sourceDir},
  });
  const payloadPath = path.resolve(workspaceRoot, frozen.receipt.payload.path);
  const submissionReceiptPath = path.join(path.dirname(path.dirname(payloadPath)), 'submission.json');
  const formalRoot = path.join(workspaceRoot, 'formal-project');
  const expectedIntake = {
    id: frozen.receipt.id,
    payload: {
      sha256: frozen.receipt.payload.sha256,
      bytes: frozen.receipt.payload.bytes,
      fileCount: frozen.receipt.payload.fileCount,
    },
  };

  const first = await ingestContentIntakeVisuals({workspaceRoot, projectRoot: formalRoot, projectId, submissionReceiptPath, expectedIntake});
  assert.equal(first.importedCount, 1);
  assert.equal(first.receipt.policy.autoAttachToShots, false);
  assert.equal(first.receipt.policy.publicationRights, 'needs-review');
  const ledger = await loadMediaLedger(formalRoot);
  assert.equal(ledger.records.length, 1);
  const record = ledger.records[0];
  assert.equal(record.id, `image-intake-${sha256(png).slice(0, 16)}`);
  assert.equal(record.provider, 'user-provided');
  assert.equal(record.rightsStatus, 'needs-review');
  assert.equal(record.licenseReceipt, 'input/content-intake/submission.json');
  assert.match(record.path, /^\.media\/images\/intake\//);
  assert.equal(await fs.readFile(path.join(formalRoot, '.media', 'index.md'), 'utf8'), renderMediaIndex(ledger.records));

  const repeated = await ingestContentIntakeVisuals({workspaceRoot, projectRoot: formalRoot, projectId, submissionReceiptPath, expectedIntake});
  assert.equal(repeated.importedCount, 0);
  assert.equal(repeated.reusedCount, 1);
  assert.equal((await loadMediaLedger(formalRoot)).records.length, 1);

  const frozenImage = path.resolve(workspaceRoot, frozen.receipt.payload.files.find((file) => file.relativePath === 'screen.png').path);
  await fs.appendFile(frozenImage, 'drift');
  await assert.rejects(
    ingestContentIntakeVisuals({workspaceRoot, projectRoot: formalRoot, projectId, submissionReceiptPath, expectedIntake}),
    /stale|hash drifted/i,
  );
});
