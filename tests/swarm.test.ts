/**
 * `nuos-catalogue swarm status` + `swarm cost` tests.
 *
 * Synthetic temp dirs: each test scaffolds a minimal docs/build/swarm/
 * with hand-crafted audit files and verifies the CLI reads them.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { cmdSwarmStatus, cmdSwarmCost } from '../src/commands/swarm.js';

let workspace: string;

before(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'nuos-swarm-cli-test-'));
});

after(async () => {
  await rm(workspace, { recursive: true, force: true });
});

async function setupCatalogueWithRuns(name: string, runs: Array<{
  file: string;
  outcome: string;
  totalCost: string;
}>) {
  const cwd = path.join(workspace, name);
  await mkdir(path.join(cwd, 'docs', 'build', 'swarm'), { recursive: true });
  for (const run of runs) {
    const body = [
      `# Swarm run — ${run.file.replace(/\.md$/, '')}`,
      '',
      `**Outcome:** ${run.outcome}`,
      '',
      '## Cost (estimate)',
      '',
      '| Tier | Agents | Approx. tokens | Approx. cost |',
      '| --- | --- | --- | --- |',
      `| **Total** | | | **${run.totalCost}** |`,
      '',
    ].join('\n');
    await writeFile(path.join(cwd, 'docs', 'build', 'swarm', run.file), body, 'utf8');
  }
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

describe('swarm status', () => {
  test('reports empty state when no runs filed', async () => {
    const cwd = path.join(workspace, 'empty');
    await mkdir(path.join(cwd, 'docs', 'build', 'swarm'), { recursive: true });
    const { result, output } = await captureStdout(() => cmdSwarmStatus({ cwd }));
    assert.equal(result, 0);
    assert.match(output, /No swarm runs filed yet/);
  });

  test('lists recent runs in reverse chronological order', async () => {
    const cwd = await setupCatalogueWithRuns('three-runs', [
      { file: '2026-05-10-wu-001.md', outcome: 'APPROVED ✅', totalCost: '£2.40' },
      { file: '2026-05-11-wu-002.md', outcome: 'APPROVED ✅', totalCost: '£3.10' },
      { file: '2026-05-12-wu-003.md', outcome: 'ESCALATED to operator', totalCost: '£1.20' },
    ]);

    const { result, output } = await captureStdout(() => cmdSwarmStatus({ cwd }));
    assert.equal(result, 0);
    assert.match(output, /2026-05-12.*wu-003.*ESCALATED/);
    // Reverse-chron: 2026-05-12 line appears before 2026-05-10
    const idx12 = output.indexOf('2026-05-12');
    const idx10 = output.indexOf('2026-05-10');
    assert.ok(idx12 < idx10, 'expected reverse chronological order');
  });

  test('honours --limit flag', async () => {
    const cwd = await setupCatalogueWithRuns('many-runs', [
      { file: '2026-05-01-wu-001.md', outcome: 'APPROVED', totalCost: '£1' },
      { file: '2026-05-02-wu-002.md', outcome: 'APPROVED', totalCost: '£1' },
      { file: '2026-05-03-wu-003.md', outcome: 'APPROVED', totalCost: '£1' },
      { file: '2026-05-04-wu-004.md', outcome: 'APPROVED', totalCost: '£1' },
    ]);

    const { result, output } = await captureStdout(() => cmdSwarmStatus({ cwd, limit: 2 }));
    assert.equal(result, 0);
    assert.match(output, /showing 2 of 4/);
  });
});

describe('swarm cost', () => {
  test('reports zero when no runs', async () => {
    const cwd = path.join(workspace, 'no-runs');
    await mkdir(path.join(cwd, 'docs', 'build', 'swarm'), { recursive: true });
    const { result, output } = await captureStdout(() => cmdSwarmCost({ cwd }));
    assert.equal(result, 0);
    assert.match(output, /Cost is 0/);
  });

  test('lists per-run cost lines from the audit files', async () => {
    const cwd = await setupCatalogueWithRuns('cost-runs', [
      { file: '2026-05-10-wu-001.md', outcome: 'APPROVED', totalCost: '£2.40' },
      { file: '2026-05-11-wu-002.md', outcome: 'APPROVED', totalCost: '£3.10' },
    ]);

    const { result, output } = await captureStdout(() => cmdSwarmCost({ cwd }));
    assert.equal(result, 0);
    assert.match(output, /wu-001/);
    assert.match(output, /£2\.40/);
    assert.match(output, /wu-002/);
    assert.match(output, /£3\.10/);
  });
});

console.log('@nusoft/nuos-build-catalogue — swarm CLI: 5/5 acceptance verified');
