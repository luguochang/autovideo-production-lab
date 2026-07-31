import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {after, before, test} from 'node:test';
import {freezeContentIntake} from '../lib/content-intake.mjs';

const consoleRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.join(consoleRoot, 'data', `content-intake-test-${process.pid}`);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const write = async (relativePath, value) => {
  const target = path.join(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, value);
  return target;
};

before(async () => {
  const resolved = path.resolve(workspaceRoot);
  assert.ok(resolved.startsWith(path.join(consoleRoot, 'data') + path.sep));
  await fs.rm(resolved, {recursive: true, force: true});
  await fs.mkdir(resolved, {recursive: true});
});

after(async () => {
  const resolved = path.resolve(workspaceRoot);
  assert.ok(resolved.startsWith(path.join(consoleRoot, 'data') + path.sep));
  await fs.rm(resolved, {recursive: true, force: true});
});

test('pasted text defaults to oralization and supports an explicit approved-script route', async () => {
  const projectId = 'paste-intake';
  const projectRoot = path.join(workspaceRoot, 'projects', projectId);
  const text = 'Approved wording stays exact.\nSecond paragraph.\n';
  const first = await freezeContentIntake({
    workspaceRoot,
    projectRoot,
    projectId,
    input: {type: 'pasted-text', text, label: 'user-paste'},
  });

  assert.equal(first.idempotent, false);
  assert.equal(first.receipt.route, 'materials');
  assert.equal(first.receipt.payload.sha256, sha256(Buffer.from(text)));
  assert.equal(first.receipt.payload.bytes, Buffer.byteLength(text));
  assert.equal(first.receipt.registration.workbenchInput.route, 'materials');
  assert.equal(first.receipt.registration.commands.register.args.includes('content:register'), true);
  assert.equal(first.receipt.registration.commands.diagnose.args.at(-1), 'materials');

  const frozenPath = path.resolve(workspaceRoot, first.receipt.payload.path);
  assert.equal(await fs.readFile(frozenPath, 'utf8'), text);
  const receiptPath = path.join(path.dirname(path.dirname(frozenPath)), 'submission.json');
  const originalReceipt = await fs.readFile(receiptPath);

  const repeated = await freezeContentIntake({
    workspaceRoot,
    projectRoot,
    projectId,
    input: {type: 'pasted-text', text, label: 'user-paste'},
  });
  assert.equal(repeated.idempotent, true);
  assert.equal(repeated.receipt.createdAt, first.receipt.createdAt);
  assert.deepEqual(await fs.readFile(receiptPath), originalReceipt);

  const approved = await freezeContentIntake({
    workspaceRoot,
    projectRoot: path.join(workspaceRoot, 'projects', `${projectId}-approved`),
    projectId: `${projectId}-approved`,
    input: {type: 'pasted-text', text, label: 'user-paste', textReadiness: 'approved-script'},
  });
  assert.equal(approved.receipt.route, 'script');
  assert.equal(approved.receipt.registration.commands.diagnose.args.at(-1), 'script');

  await fs.appendFile(frozenPath, 'tampered');
  await assert.rejects(
    freezeContentIntake({workspaceRoot, projectRoot, projectId, input: {type: 'pasted-text', text, label: 'user-paste'}}),
    /frozen content intake file is stale/i,
  );
});

test('material file accepts Windows-style relative paths and produces pipeline arguments', async () => {
  const projectId = 'material-file-intake';
  const material = '# Notes\nA maintained workflow needs review.\n';
  await write('sources/material.md', material);
  const result = await freezeContentIntake({
    workspaceRoot,
    projectRoot: path.join(workspaceRoot, 'projects', projectId),
    projectId,
    input: {type: 'material-file', path: 'sources\\material.md'},
  });

  assert.equal(result.receipt.route, 'materials');
  assert.equal(result.receipt.payload.fileCount, 1);
  assert.equal(result.receipt.source.path, 'sources/material.md');
  assert.match(result.receipt.registration.workbenchInput.sourcePath, /input\/content-intake\/submissions/);
  const registerArgs = result.receipt.registration.commands.register.args;
  assert.deepEqual(registerArgs.slice(0, 4), ['run', 'content:register', '--', '--id']);
  assert.equal(registerArgs[4], projectId);
  assert.equal(registerArgs.includes('--materials'), true);
  assert.equal(registerArgs.includes('--out'), true);
});

test('material directory freezes supported files with a deterministic aggregate receipt', async () => {
  const projectId = 'material-directory-intake';
  await write('source-dir/a.md', 'alpha\n');
  await write('source-dir/nested/b.json', '{"topic":"beta"}\n');
  await write('source-dir/ignored.bin', Buffer.from([1, 2, 3]));
  await write('source-dir/.env', 'SECRET=not-frozen\n');
  await write('source-dir/config.json', '{"apiKey":"not-frozen"}\n');

  const result = await freezeContentIntake({
    workspaceRoot,
    projectRoot: path.join(workspaceRoot, 'projects', projectId),
    projectId,
    input: {type: 'material-directory', path: path.join(workspaceRoot, 'source-dir')},
  });

  assert.equal(result.receipt.route, 'materials');
  assert.equal(result.receipt.payload.hashAlgorithm, 'sha256-manifest-v1');
  assert.equal(result.receipt.payload.fileCount, 2);
  assert.equal(result.receipt.payload.bytes, Buffer.byteLength('alpha\n') + Buffer.byteLength('{"topic":"beta"}\n'));
  assert.deepEqual(result.receipt.payload.files.map((file) => file.relativePath), ['a.md', 'nested/b.json']);
  assert.deepEqual(result.receipt.payload.skipped.map((item) => item.relativePath).sort(), ['.env', 'config.json', 'ignored.bin']);
  for (const file of result.receipt.payload.files) {
    await assert.doesNotReject(() => fs.access(path.resolve(workspaceRoot, file.path)));
  }
});

test('narration audio and URL snapshot preserve their route and provenance', async () => {
  const audioPath = await write('sources/narration.wav', Buffer.from('RIFF-test-audio'));
  const snapshotPath = await write('sources/article.html', '<main>Frozen article</main>\n');

  const audio = await freezeContentIntake({
    workspaceRoot,
    projectRoot: path.join(workspaceRoot, 'projects', 'audio-intake'),
    projectId: 'audio-intake',
    input: {type: 'narration-audio', path: audioPath},
  });
  assert.equal(audio.receipt.route, 'audio');
  assert.match(audio.receipt.payload.path, /narration\.wav$/);
  assert.equal(audio.receipt.registration.workbenchInput.route, 'audio');

  const snapshot = await freezeContentIntake({
    workspaceRoot,
    projectRoot: path.join(workspaceRoot, 'projects', 'snapshot-intake'),
    projectId: 'snapshot-intake',
    input: {type: 'url-snapshot', url: 'https://example.com/article?version=1', snapshotPath},
  });
  assert.equal(snapshot.receipt.route, 'materials');
  assert.equal(snapshot.receipt.source.kind, 'url-snapshot');
  assert.equal(snapshot.receipt.source.url, 'https://example.com/article?version=1');
  assert.match(snapshot.receipt.payload.path, /snapshot\.html$/);
});

test('source and project paths cannot leave the allowed workspace', async () => {
  const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autovideo-intake-outside-'));
  const outsideFile = path.join(outsideRoot, 'outside.md');
  await fs.writeFile(outsideFile, 'outside\n', 'utf8');
  const sensitiveFile = await write('sources/settings.json', '{"refreshToken":"not-frozen"}\n');
  try {
    await assert.rejects(
      freezeContentIntake({
        workspaceRoot,
        projectRoot: path.join(workspaceRoot, 'projects', 'outside-source'),
        projectId: 'outside-source',
        input: {type: 'material-file', path: outsideFile},
      }),
      /allowed workspace/i,
    );
    await assert.rejects(
      freezeContentIntake({
        workspaceRoot,
        projectRoot: path.join(workspaceRoot, 'projects', 'sensitive-source'),
        projectId: 'sensitive-source',
        input: {type: 'material-file', path: sensitiveFile},
      }),
      /sensitive source file/i,
    );
    await assert.rejects(
      freezeContentIntake({
        workspaceRoot,
        projectRoot: path.join(outsideRoot, 'project'),
        projectId: 'outside-project',
        input: {type: 'pasted-text', text: 'text'},
      }),
      /allowed workspace/i,
    );
  } finally {
    await fs.rm(outsideRoot, {recursive: true, force: true});
  }
});
