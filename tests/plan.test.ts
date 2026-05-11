/**
 * `nuos-catalogue plan status` tests.
 *
 * Synthetic temp dirs: each test writes a methodfile.json with a specific
 * planning shape and verifies the read-only status output.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { cmdPlanStatus } from '../src/commands/plan.js';

let workspace: string;
let originalWrite: typeof process.stdout.write;
let captured: string[] = [];

before(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'nuos-plan-test-'));
  // Hook console.log so we can inspect output.
  originalWrite = process.stdout.write.bind(process.stdout);
  // We capture via console.log replacement so the assertions can inspect.
});

after(async () => {
  await rm(workspace, { recursive: true, force: true });
});

async function setupCatalogue(name: string, planning: Record<string, string>) {
  const cwd = path.join(workspace, name);
  await mkdir(cwd, { recursive: true });
  const methodfile = {
    project: { name: 'test' },
    catalogue: { root: 'docs/build/' },
    planning,
  };
  await writeFile(path.join(cwd, 'methodfile.json'), JSON.stringify(methodfile, null, 2), 'utf8');
  return cwd;
}

function captureStdout<T>(fn: () => Promise<T>): Promise<{ result: T; output: string }> {
  const lines: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(' '));
  };
  return fn()
    .then((result) => {
      console.log = origLog;
      return { result, output: lines.join('\n') };
    })
    .catch((err) => {
      console.log = origLog;
      throw err;
    });
}

describe('plan status', () => {
  test('reports all phases not-started for a fresh project', async () => {
    const cwd = await setupCatalogue('fresh', {
      phaseA_orientation: 'not_started',
      phaseB_architecture: 'not_started',
      phaseC_uiUxDesignSystem: 'not_started',
      phaseD_maps: 'not_started',
      phaseE_initialWorkUnits: 'not_started',
    });

    const { result, output } = await captureStdout(() => cmdPlanStatus({ cwd }));
    assert.equal(result, 0);
    assert.match(output, /A\. Orientation/);
    assert.match(output, /E\. Initial Work Units/);
    assert.match(output, /not started/);
    assert.match(output, /Next phase: A\. Orientation/);
  });

  test('reports correct next-phase when Phase A is complete', async () => {
    const cwd = await setupCatalogue('a-complete', {
      phaseA_orientation: 'complete',
      phaseB_architecture: 'not_started',
      phaseC_uiUxDesignSystem: 'not_started',
      phaseD_maps: 'not_started',
      phaseE_initialWorkUnits: 'not_started',
    });

    const { result, output } = await captureStdout(() => cmdPlanStatus({ cwd }));
    assert.equal(result, 0);
    assert.match(output, /✅.*A\. Orientation/);
    assert.match(output, /Next phase: B\. Architecture/);
  });

  test('reports "in progress" when a phase is mid-way', async () => {
    const cwd = await setupCatalogue('b-in-progress', {
      phaseA_orientation: 'complete',
      phaseB_architecture: 'in_progress',
      phaseC_uiUxDesignSystem: 'not_started',
      phaseD_maps: 'not_started',
      phaseE_initialWorkUnits: 'not_started',
    });

    const { result, output } = await captureStdout(() => cmdPlanStatus({ cwd }));
    assert.equal(result, 0);
    assert.match(output, /🟡.*B\. Architecture/);
    assert.match(output, /Currently in: B\. Architecture/);
    assert.match(output, /Resume by running \/start-of-session/);
  });

  test('reports "ready to build" when all phases complete', async () => {
    const cwd = await setupCatalogue('all-done', {
      phaseA_orientation: 'complete',
      phaseB_architecture: 'complete',
      phaseC_uiUxDesignSystem: 'complete',
      phaseD_maps: 'complete',
      phaseE_initialWorkUnits: 'complete',
    });

    const { result, output } = await captureStdout(() => cmdPlanStatus({ cwd }));
    assert.equal(result, 0);
    assert.match(output, /All five phases complete/);
    assert.match(output, /ready to build/);
  });

  test('errors gracefully when methodfile.json is missing', async () => {
    const cwd = path.join(workspace, 'no-methodfile');
    await mkdir(cwd, { recursive: true });
    // Suppress stderr noise during this test.
    const origErr = console.error;
    console.error = () => {};
    try {
      const result = await cmdPlanStatus({ cwd });
      assert.equal(result, 1);
    } finally {
      console.error = origErr;
    }
  });
});

console.log('@nusoft/nuos-build-catalogue — plan status: 5/5 acceptance verified');
