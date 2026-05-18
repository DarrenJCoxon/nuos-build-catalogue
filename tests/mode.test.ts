/**
 * `nuos-catalogue mode` tests.
 *
 * Verifies the read-and-set semantics of the operator-mode CLI:
 *  - prints the current value (or "(unset)") when called with no argument
 *  - rejects unknown values without writing
 *  - writes a valid value and stamps modeSelectedAt
 *  - preserves other methodfile fields and the trailing newline
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { cmdMode } from '../src/commands/mode.js';

let workspace: string;

before(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'nuos-mode-test-'));
});

after(async () => {
  await rm(workspace, { recursive: true, force: true });
});

async function setupCatalogue(
  name: string,
  operator: Record<string, unknown> | undefined = { mode: null, modeSelectedAt: null }
): Promise<string> {
  const cwd = path.join(workspace, name);
  await mkdir(cwd, { recursive: true });
  const methodfile: Record<string, unknown> = {
    project: { name: 'test' },
    catalogue: { root: 'docs/build/' },
    planning: { phaseA_orientation: 'not_started' },
  };
  if (operator !== undefined) methodfile.operator = operator;
  await writeFile(
    path.join(cwd, 'methodfile.json'),
    JSON.stringify(methodfile, null, 2) + '\n',
    'utf8'
  );
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

describe('mode (read)', () => {
  test('prints "(unset)" when operator.mode is null', async () => {
    const cwd = await setupCatalogue('unset');
    const { result, output } = await captureStdout(() => cmdMode({ cwd }));
    assert.equal(result, 0);
    assert.match(output, /\(unset\)/);
    assert.match(output, /nuos-catalogue mode <coaching\|standard\|developer>/);
  });

  test('prints the current value when set', async () => {
    const cwd = await setupCatalogue('set', { mode: 'developer', modeSelectedAt: '2026-05-01' });
    const { result, output } = await captureStdout(() => cmdMode({ cwd }));
    assert.equal(result, 0);
    assert.equal(output.trim(), 'developer');
  });

  test('prints "(unset)" when operator section is missing entirely', async () => {
    const cwd = await setupCatalogue('no-operator', undefined);
    const { result, output } = await captureStdout(() => cmdMode({ cwd }));
    assert.equal(result, 0);
    assert.match(output, /\(unset\)/);
  });
});

describe('mode (write)', () => {
  test('writes a valid mode and stamps modeSelectedAt', async () => {
    const cwd = await setupCatalogue('write-coaching');
    const { result } = await captureStdout(() =>
      cmdMode({ cwd, mode: 'coaching', now: () => '2026-05-18' })
    );
    assert.equal(result, 0);

    const mf = JSON.parse(await readFile(path.join(cwd, 'methodfile.json'), 'utf8'));
    assert.equal(mf.operator.mode, 'coaching');
    assert.equal(mf.operator.modeSelectedAt, '2026-05-18');
    // Other fields preserved
    assert.equal(mf.project.name, 'test');
    assert.equal(mf.planning.phaseA_orientation, 'not_started');
  });

  test('reports the previous value when overwriting', async () => {
    const cwd = await setupCatalogue('overwrite', {
      mode: 'standard',
      modeSelectedAt: '2026-01-01',
    });
    const { result, output } = await captureStdout(() =>
      cmdMode({ cwd, mode: 'developer', now: () => '2026-05-18' })
    );
    assert.equal(result, 0);
    assert.match(output, /standard.*developer/);

    const mf = JSON.parse(await readFile(path.join(cwd, 'methodfile.json'), 'utf8'));
    assert.equal(mf.operator.mode, 'developer');
    assert.equal(mf.operator.modeSelectedAt, '2026-05-18');
  });

  test('rejects unknown mode names without writing', async () => {
    const cwd = await setupCatalogue('reject');
    const origErr = console.error;
    console.error = () => {};
    try {
      const result = await cmdMode({ cwd, mode: 'expert' });
      assert.equal(result, 1);
    } finally {
      console.error = origErr;
    }
    // methodfile unchanged
    const mf = JSON.parse(await readFile(path.join(cwd, 'methodfile.json'), 'utf8'));
    assert.equal(mf.operator.mode, null);
  });

  test('preserves the trailing newline convention', async () => {
    const cwd = await setupCatalogue('trailing-newline');
    await captureStdout(() => cmdMode({ cwd, mode: 'standard', now: () => '2026-05-18' }));
    const raw = await readFile(path.join(cwd, 'methodfile.json'), 'utf8');
    assert.ok(raw.endsWith('\n'), 'methodfile.json must keep its trailing newline');
  });

  test('errors gracefully when methodfile.json is missing', async () => {
    const cwd = path.join(workspace, 'no-methodfile');
    await mkdir(cwd, { recursive: true });
    const origErr = console.error;
    console.error = () => {};
    try {
      const result = await cmdMode({ cwd, mode: 'standard' });
      assert.equal(result, 1);
    } finally {
      console.error = origErr;
    }
  });
});

console.log('@nusoft/nuos-build-catalogue — mode: 8/8 acceptance verified');
