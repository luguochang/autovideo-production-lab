import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import {createServer} from 'node:net';
import path from 'node:path';
import test from 'node:test';

const consoleRoot = path.resolve(import.meta.dirname, '..');
const dataRoot = path.join(consoleRoot, 'data', `motion-readiness-api-${process.pid}`);
const serverReceiptPath = path.join(dataRoot, 'server.json');

const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    probe.close((error) => error ? reject(error) : resolve(address.port));
  });
});

const waitForHealth = async (baseUrl, child) => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Workbench server exited with ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return response.json();
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the workbench test server.');
};

const stopChild = async (child) => {
  if (!child || child.exitCode != null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (child.exitCode == null) child.kill('SIGKILL');
};

test('motion library API returns the eight-recipe readiness snapshot without synthetic human approval', async () => {
  await fs.rm(dataRoot, {recursive: true, force: true});
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let child = null;
  try {
    child = spawn(process.execPath, ['server.mjs'], {
      cwd: consoleRoot,
      env: {
        ...process.env,
        AUTOVIDEO_CONSOLE_DATA_ROOT: dataRoot,
        AUTOVIDEO_CONSOLE_PORT: String(port),
        AUTOVIDEO_CONSOLE_SERVER_RECEIPT: serverReceiptPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const health = await waitForHealth(baseUrl, child);
    assert.ok(health.capabilities.includes('motion-library-readiness-v1'));

    const response = await fetch(`${baseUrl}/api/motion-library/probes`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.readiness.schemaVersion, 'autovideo-motion-lifecycle-readiness/v1');
    assert.equal(payload.readiness.contract.valid, true);
    assert.equal(payload.readiness.summary.recipeCount, 8);
    assert.equal(payload.readiness.summary.humanEvidenceInvented, false);
    assert.equal(payload.readiness.summary.currentHumanReviewedCount, 0);
    assert.equal(payload.readiness.summary.productionEligibleCount, 0);
    assert.equal(new Set(payload.readiness.recipes.map((recipe) => recipe.recipeId)).size, 8);
    assert.ok(payload.readiness.recipes.every((recipe) => recipe.nextAction && recipe.contractValid));
  } finally {
    await stopChild(child);
    await fs.rm(dataRoot, {recursive: true, force: true});
  }
});
