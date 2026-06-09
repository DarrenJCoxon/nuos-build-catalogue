/**
 * Tests for `nuos-catalogue state compile` — WU 113b / D132.
 *
 * STATE.md is the handoff snapshot: two generated regions only —
 *   `where`    (the active-WU pointer)
 *   `blockers` (blocked WUs + open questions that name something they block)
 * Decisions, risks, health, and "what shipped" are NOT mirrored here; they live
 * in their registers and `doctor` (STATE.md is the handoff contract, not a dashboard).
 *
 * All tests operate against FIXTURE files in a temp directory.
 * The live docs/build/STATE.md is NEVER read or written.
 *
 * Coverage:
 *   1. Adapter produces LLMCompilationOutput with no LLM call
 *   2. Generated regions are spliced; authored prose is byte-for-byte identical
 *   3. Missing sentinels: command reports clearly and exits non-zero without modifying the file
 *   4. Idempotent: re-running with unchanged store produces identical output
 *   5. Multiple state changes (advance → revert → advance) recompile correctly
 *   6. Dry run: reports update set but does not write to disk
 *   7. SentinelConfig + region key constants are exported correctly
 *   8. checkStateMdDrift detects drifted and clean regions
 *   9. Blockers: blocking questions and blocked WUs appear; non-blocking / resolved do not
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { openWorkflowStore } from '../src/migrate/store.js';
import {
  buildStateCompilationOutput,
  cmdStateCompile,
  checkStateMdDrift,
  STATE_SENTINEL_CONFIG,
  STATE_REGION_KEYS,
} from '../src/commands/state-compile.js';
import type { MigratedRecord } from '../src/migrate/types.js';

// ---------------------------------------------------------------------------
// Shared temp workspace
// ---------------------------------------------------------------------------

let globalWorkspace: string;

before(async () => {
  globalWorkspace = await mkdtemp(path.join(tmpdir(), 'nuos-state-compile-test-'));
});

after(async () => {
  const { rm } = await import('node:fs/promises');
  await rm(globalWorkspace, { recursive: true, force: true });
});

async function makeWorkspace(label: string): Promise<{
  workspace: string;
  buildRoot: string;
  workflowsPath: string;
  catalogueDir: string;
}> {
  const workspace = await mkdtemp(path.join(globalWorkspace, `${label}-`));
  const buildRoot = path.join(workspace, 'docs', 'build');
  const workflowsPath = path.join(workspace, '.nuos-catalogue', 'workflows.json');
  const catalogueDir = path.join(workspace, '.nuos-catalogue');

  await mkdir(path.join(buildRoot, 'work-units', 'done'), { recursive: true });
  await mkdir(path.join(buildRoot, 'decisions'), { recursive: true });
  await mkdir(path.join(buildRoot, 'open-questions'), { recursive: true });
  await mkdir(path.join(buildRoot, 'risks'), { recursive: true });
  await mkdir(catalogueDir, { recursive: true });

  return { workspace, buildRoot, workflowsPath, catalogueDir };
}

/**
 * Write the active-wu marker file so the adapter can find the active WU.
 * Also writes a matching row in work-units/_index.md so title/status resolve.
 */
async function setActiveWu(
  buildRoot: string,
  catalogueDir: string,
  handle: string,
  title: string,
  status = 'in_progress'
): Promise<void> {
  await writeFile(path.join(catalogueDir, 'active-wu'), handle);
  await appendWuRow(buildRoot, handle, title, status);
}

/**
 * Append a row to work-units/_index.md (creating it with a header if absent).
 * `status` drives the icon: in_progress → 🟡, blocked → 🔴, done → ✅.
 */
async function appendWuRow(
  buildRoot: string,
  handle: string,
  title: string,
  status: string
): Promise<void> {
  const idInIndex = handle.replace(/^wu-/i, '');
  const icon =
    status === 'in_progress' ? '🟡' : status === 'blocked' ? '🔴' : status === 'done' ? '✅' : '⬜';
  const indexPath = path.join(buildRoot, 'work-units', '_index.md');
  let existing = '';
  try { existing = await readFile(indexPath, 'utf8'); } catch { /* new file */ }
  if (!existing.includes(`| ${idInIndex} |`)) {
    const row = `| ${idInIndex} | [${title}](${handle}.md) | ${icon} ${status} — fixture | — |\n`;
    if (existing) {
      await writeFile(indexPath, existing + row);
    } else {
      const header = '# Work Units Index\n\n| ID | Title | Status | Depends on |\n| --- | --- | --- | --- |\n';
      await writeFile(indexPath, header + row);
    }
  }
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeWuRecord(handle: string, title: string, status: string): MigratedRecord {
  const numStr = handle.replace(/[^\d]/g, '');
  const num = numStr ? parseInt(numStr, 10) : 1;
  return {
    handle,
    number: num,
    register: 'work_unit',
    title,
    status,
    slug: handle.replace('wu-', ''),
    sourcePath: `work-units/${handle}.md`,
    rawMarkdown: `# WU ${num}\n\nTest WU.`,
    fileModifiedAt: '2026-06-01T10:00:00.000Z',
    migratedAt: '2026-06-01T10:00:00.000Z',
    migratedFrom: 'markdown',
  };
}

/** A minimal fixture STATE.md with both sentinel pairs + authored prose around them. */
function makeFixtureStateMd(extraAuthoredProse = ''): string {
  const regions = Object.values(STATE_REGION_KEYS);
  const blocks: string[] = [
    '<!-- nuos:sentinel — this file is maintained as a hybrid document (WU 113b / D132) -->',
    '',
    '# STATE',
    '',
    'This is authored prose above the first generated region. It must survive byte-for-byte.',
    extraAuthoredProse ? extraAuthoredProse : '',
    '',
  ];

  for (const key of regions) {
    const marker = STATE_SENTINEL_CONFIG.markerPattern.replace('{{key}}', key);
    const open = STATE_SENTINEL_CONFIG.openTemplate.replace('{{marker}}', marker);
    const close = STATE_SENTINEL_CONFIG.closeTemplate.replace('{{marker}}', marker);

    blocks.push(open);
    blocks.push('(generated content goes here)');
    blocks.push(close);
    blocks.push('');
    blocks.push(`This is authored prose after the ${key} region. It must also survive.`);
    blocks.push('');
  }

  blocks.push('## Resume');
  blocks.push('');
  blocks.push('This authored Resume block is hand-maintained and must never be touched by state compile.');
  blocks.push('');

  return blocks.join('\n');
}

function makeQuestionsIndex(entries: Array<{ id: string; title: string; blocks: string }>): string {
  const lines = [
    '# Open Questions Index',
    '',
    '## Active questions',
    '',
    '| ID | Title | Blocks | Raised |',
    '|---|---|---|---|',
  ];
  for (const e of entries) {
    lines.push(`| [${e.id}](${e.id}-test.md) | ${e.title} | ${e.blocks} | 2026-06-01 |`);
  }
  lines.push('');
  lines.push('## Resolved questions');
  lines.push('');
  lines.push('| ID | Title | Resolved | Became |');
  lines.push('|---|---|---|---|');
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Test 1: SentinelConfig + region keys exported correctly
// ---------------------------------------------------------------------------

describe('STATE_SENTINEL_CONFIG and STATE_REGION_KEYS', () => {
  test('exports correct sentinel config', () => {
    assert.equal(STATE_SENTINEL_CONFIG.markerPattern, 'nuos:generated:{{key}}');
    assert.equal(STATE_SENTINEL_CONFIG.openTemplate, '<!-- {{marker}}:start -->');
    assert.equal(STATE_SENTINEL_CONFIG.closeTemplate, '<!-- {{marker}}:end -->');
  });

  test('exports exactly the two handoff region keys', () => {
    const keys = Object.values(STATE_REGION_KEYS);
    assert.equal(keys.length, 2);
    assert.ok(keys.includes('where'));
    assert.ok(keys.includes('blockers'));
    // The exec-summary regions are gone — handoff contract, not a dashboard.
    assert.ok(!keys.includes('recent_decisions' as never), 'recent_decisions region must not exist');
    assert.ok(!keys.includes('risks' as never), 'risks region must not exist');
    assert.ok(!keys.includes('health_check' as never), 'health_check region must not exist');
  });
});

// ---------------------------------------------------------------------------
// Test 2: Adapter produces LLMCompilationOutput with no LLM call
// ---------------------------------------------------------------------------

describe('buildStateCompilationOutput', () => {
  test('produces a valid LLMCompilationOutput from disk state — no LLM call', async () => {
    const { buildRoot, workflowsPath, catalogueDir } = await makeWorkspace('adapter-basic');
    const store = await openWorkflowStore(workflowsPath);

    // Active WU is sourced from the marker file + work-units/_index.md (not the store).
    await setActiveWu(buildRoot, catalogueDir, 'wu-113', 'Consume NuWiki capability');
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));

    const result = await buildStateCompilationOutput({
      store,
      buildRoot,
      now: '2026-06-01T12:00:00.000Z',
    });

    // Structural checks — exactly two regions.
    assert.ok(result.compilationOutput.summary.length > 0);
    assert.equal(result.compilationOutput.sections.length, 2);
    assert.equal(result.compilationOutput.citations.length, 0);
    assert.equal(result.compilationOutput.outboundLinks.length, 0);

    for (const key of Object.values(STATE_REGION_KEYS)) {
      assert.ok(Object.prototype.hasOwnProperty.call(result.regions, key), `missing region: ${key}`);
      assert.ok(result.regions[key as keyof typeof result.regions].length > 0, `empty region: ${key}`);
    }

    // `where` region carries today's date and the active WU handle.
    assert.ok(result.regions.where.includes('2026-06-01'), 'where region missing today date');
    assert.ok(result.regions.where.includes('wu-113'), 'where region missing active WU handle');

    // `blockers` region says None when nothing blocks.
    assert.ok(result.regions.blockers.includes('None'), 'blockers region should say None when unblocked');
  });

  test('produces correct output when there is no active WU', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('adapter-empty');
    const store = await openWorkflowStore(workflowsPath);
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));

    const result = await buildStateCompilationOutput({ store, buildRoot, now: '2026-06-01T09:00:00.000Z' });

    assert.equal(result.compilationOutput.sections.length, 2);
    assert.ok(result.regions.where.includes('No active'), 'no-marker should say no active WU');
  });
});

// ---------------------------------------------------------------------------
// Test 3: splice preserves authored prose byte-for-byte
// ---------------------------------------------------------------------------

describe('cmdStateCompile — authored prose preservation', () => {
  test('only generated regions change; authored prose is byte-identical', async () => {
    const { buildRoot, workflowsPath, workspace, catalogueDir } = await makeWorkspace('splice-prose');
    const store = await openWorkflowStore(workflowsPath);

    await setActiveWu(buildRoot, catalogueDir, 'wu-113', 'Consume NuWiki');
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));

    const authoredProse = 'AUTHORED: this exact string must survive compilation unchanged.';
    const fixturePath = path.join(workspace, 'STATE-fixture.md');
    const originalFixture = makeFixtureStateMd(authoredProse);
    await writeFile(fixturePath, originalFixture);

    const result = await cmdStateCompile(store, {
      buildRoot,
      stateMdPath: fixturePath,
      now: '2026-06-01T10:00:00.000Z',
    });

    assert.equal(result.exitCode, 0, `command failed: ${result.output}`);

    const after = await readFile(fixturePath, 'utf8');

    assert.ok(after.includes(authoredProse), 'authored prose string was not preserved');
    assert.ok(after.includes('This is authored prose above the first generated region.'), 'authored prose above first region was changed');
    assert.ok(after.includes('## Resume'), 'authored Resume section was removed');
    assert.ok(after.includes('This authored Resume block is hand-maintained'), 'authored section body was changed');

    assert.ok(!after.includes('(generated content goes here)'), 'placeholder text was not replaced');
    assert.ok(after.includes('wu-113'), 'active WU not reflected in generated output');
  });
});

// ---------------------------------------------------------------------------
// Test 4: Missing sentinels — reports clearly, exits non-zero, does not write
// ---------------------------------------------------------------------------

describe('cmdStateCompile — missing sentinels', () => {
  test('reports missing regions and exits non-zero without modifying file', async () => {
    const { buildRoot, workflowsPath, workspace } = await makeWorkspace('missing-sentinels');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Consume NuWiki', 'in_progress'));
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));

    const stateMdContent = '# STATE\n\nAuthored content only — no sentinel pairs.\n\n## Resume\n\nSome pickup note.\n';
    const fixturePath = path.join(workspace, 'STATE-no-sentinels.md');
    await writeFile(fixturePath, stateMdContent);

    const result = await cmdStateCompile(store, {
      buildRoot,
      stateMdPath: fixturePath,
      now: '2026-06-01T10:00:00.000Z',
    });

    assert.equal(result.exitCode, 1, 'should exit non-zero when sentinels are missing');
    assert.ok(result.output.includes('sentinel regions are absent'), `missing message: ${result.output}`);
    assert.ok(result.output.includes('nuos:generated:'), 'output should name the missing sentinels');

    const after = await readFile(fixturePath, 'utf8');
    assert.equal(after, stateMdContent, 'file was modified despite missing sentinels');
  });
});

// ---------------------------------------------------------------------------
// Test 5: Idempotent — re-running with same state is a no-op
// ---------------------------------------------------------------------------

describe('cmdStateCompile — idempotent', () => {
  test('second compile with unchanged state produces identical output', async () => {
    const { buildRoot, workflowsPath, workspace, catalogueDir } = await makeWorkspace('idempotent');
    const store = await openWorkflowStore(workflowsPath);
    await setActiveWu(buildRoot, catalogueDir, 'wu-113', 'Consume NuWiki');
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));

    const fixturePath = path.join(workspace, 'STATE-idempotent.md');
    await writeFile(fixturePath, makeFixtureStateMd());

    const r1 = await cmdStateCompile(store, { buildRoot, stateMdPath: fixturePath, now: '2026-06-01T10:00:00.000Z' });
    assert.equal(r1.exitCode, 0, `first compile failed: ${r1.output}`);
    const afterFirst = await readFile(fixturePath, 'utf8');

    const r2 = await cmdStateCompile(store, { buildRoot, stateMdPath: fixturePath, now: '2026-06-01T10:00:00.000Z' });
    assert.equal(r2.exitCode, 0, `second compile failed: ${r2.output}`);
    const afterSecond = await readFile(fixturePath, 'utf8');

    assert.equal(afterSecond, afterFirst, 'second compile changed the file (not idempotent)');
    assert.deepEqual(r2.updatedRegions, [], 'second compile should have no updated regions');
  });
});

// ---------------------------------------------------------------------------
// Test 6: Multiple state changes (advance → revert → advance)
// ---------------------------------------------------------------------------

describe('cmdStateCompile — multiple state changes', () => {
  test('recompiles correctly across advance → revert → advance cycle', async () => {
    const { buildRoot, workflowsPath, workspace, catalogueDir } = await makeWorkspace('state-changes');
    const store = await openWorkflowStore(workflowsPath);
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));

    const fixturePath = path.join(workspace, 'STATE-transitions.md');
    await writeFile(fixturePath, makeFixtureStateMd());

    // --- State A: wu-113 is active ---
    await setActiveWu(buildRoot, catalogueDir, 'wu-113', 'Consume NuWiki');
    const rA = await cmdStateCompile(store, { buildRoot, stateMdPath: fixturePath, now: '2026-06-01T10:00:00.000Z' });
    assert.equal(rA.exitCode, 0, `state A compile failed: ${rA.output}`);
    const afterA = await readFile(fixturePath, 'utf8');
    assert.ok(afterA.includes('wu-113'), 'State A: active WU not in output');

    // --- State B: advance — wu-114 is now active ---
    await setActiveWu(buildRoot, catalogueDir, 'wu-114', 'Per-WU notes compile');
    const rB = await cmdStateCompile(store, { buildRoot, stateMdPath: fixturePath, now: '2026-06-01T11:00:00.000Z' });
    assert.equal(rB.exitCode, 0, `state B compile failed: ${rB.output}`);
    const afterB = await readFile(fixturePath, 'utf8');
    assert.ok(afterB.includes('wu-114'), 'State B: new active WU not in output');

    // --- State C: revert — wu-113 back to active ---
    await writeFile(path.join(catalogueDir, 'active-wu'), 'wu-113');
    const rC = await cmdStateCompile(store, { buildRoot, stateMdPath: fixturePath, now: '2026-06-01T12:00:00.000Z' });
    assert.equal(rC.exitCode, 0, `state C compile failed: ${rC.output}`);
    const afterC = await readFile(fixturePath, 'utf8');
    assert.ok(afterC.includes('wu-113'), 'State C: reverted active WU not in output');

    // Authored prose must have survived all transitions.
    assert.ok(afterC.includes('## Resume'), 'authored section removed after state transitions');
    assert.ok(afterC.includes('This authored Resume block is hand-maintained'), 'authored prose body was lost');
  });
});

// ---------------------------------------------------------------------------
// Test 7: Dry run
// ---------------------------------------------------------------------------

describe('cmdStateCompile — dry run', () => {
  test('dry run reports update set but does not write', async () => {
    const { buildRoot, workflowsPath, workspace, catalogueDir } = await makeWorkspace('dry-run');
    const store = await openWorkflowStore(workflowsPath);
    await setActiveWu(buildRoot, catalogueDir, 'wu-113', 'Consume NuWiki');
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));

    const fixture = makeFixtureStateMd();
    const fixturePath = path.join(workspace, 'STATE-dryrun.md');
    await writeFile(fixturePath, fixture);

    const result = await cmdStateCompile(store, {
      buildRoot,
      stateMdPath: fixturePath,
      dryRun: true,
      now: '2026-06-01T10:00:00.000Z',
    });

    assert.equal(result.exitCode, 0, `dry run failed: ${result.output}`);
    assert.ok(result.output.includes('dry run'), 'dry run label not in output');

    const after = await readFile(fixturePath, 'utf8');
    assert.equal(after, fixture, 'dry run modified the file');
  });
});

// ---------------------------------------------------------------------------
// Test 8: checkStateMdDrift
// ---------------------------------------------------------------------------

describe('checkStateMdDrift', () => {
  test('returns clean=true when file matches expected regions', async () => {
    const { buildRoot, workflowsPath, workspace, catalogueDir } = await makeWorkspace('drift-clean');
    const store = await openWorkflowStore(workflowsPath);
    await setActiveWu(buildRoot, catalogueDir, 'wu-113', 'Consume NuWiki');
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));

    const fixturePath = path.join(workspace, 'STATE-drift.md');
    await writeFile(fixturePath, makeFixtureStateMd());

    await cmdStateCompile(store, { buildRoot, stateMdPath: fixturePath, now: '2026-06-01T10:00:00.000Z' });
    const compiled = await readFile(fixturePath, 'utf8');

    const { regions } = await buildStateCompilationOutput({ store, buildRoot, now: '2026-06-01T10:00:00.000Z' });

    const report = checkStateMdDrift(compiled, regions);
    assert.equal(report.clean, true, `drift reported after a clean compile: ${JSON.stringify(report.regions.filter(r => r.status !== 'clean'))}`);
  });

  test('returns clean=false when the where region has been hand-edited', async () => {
    const { buildRoot, workflowsPath, workspace, catalogueDir } = await makeWorkspace('drift-detected');
    const store = await openWorkflowStore(workflowsPath);
    await setActiveWu(buildRoot, catalogueDir, 'wu-113', 'Consume NuWiki');
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));

    const fixturePath = path.join(workspace, 'STATE-hand-edit.md');
    await writeFile(fixturePath, makeFixtureStateMd());

    await cmdStateCompile(store, { buildRoot, stateMdPath: fixturePath, now: '2026-06-01T10:00:00.000Z' });

    const compiled = await readFile(fixturePath, 'utf8');
    const marker = STATE_SENTINEL_CONFIG.markerPattern.replace('{{key}}', STATE_REGION_KEYS.WHERE);
    const openLine = STATE_SENTINEL_CONFIG.openTemplate.replace('{{marker}}', marker);
    const closeLine = STATE_SENTINEL_CONFIG.closeTemplate.replace('{{marker}}', marker);
    const modified = compiled.replace(
      new RegExp(`(${escapeRegex(openLine)}\n)[\\s\\S]*?(\n${escapeRegex(closeLine)})`),
      `$1HAND-EDITED: this should not be here\n$2`
    );
    await writeFile(fixturePath, modified);

    const { regions } = await buildStateCompilationOutput({ store, buildRoot, now: '2026-06-01T10:00:00.000Z' });

    const report = checkStateMdDrift(modified, regions);
    assert.equal(report.clean, false, 'drift not detected after hand-edit');
    const whereDrift = report.regions.find(r => r.key === STATE_REGION_KEYS.WHERE);
    assert.ok(whereDrift, 'where region not in drift report');
    assert.equal(whereDrift?.status, 'drifted', 'where region should be drifted');
  });
});

// ---------------------------------------------------------------------------
// Test 9: Blockers region (blocking questions + blocked WUs)
// ---------------------------------------------------------------------------

describe('blockers region', () => {
  test('open questions that name something they block appear in the blockers region', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('blockers-questions');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Test', 'in_progress'));

    await writeFile(
      path.join(buildRoot, 'open-questions', '_index.md'),
      makeQuestionsIndex([
        { id: 'Q009', title: 'Catalogue maintenance gate', blocks: 'WU 113' },
        { id: 'Q020', title: 'Maintainer Mac bus factor', blocks: 'nuvector release' },
      ])
    );

    const { regions } = await buildStateCompilationOutput({ store, buildRoot, now: '2026-06-01T10:00:00.000Z' });
    assert.ok(regions.blockers.includes('Q009'), 'Q009 not in blockers region');
    assert.ok(regions.blockers.includes('Q020'), 'Q020 not in blockers region');
    assert.ok(!regions.blockers.includes('None'), 'blockers should not say None when questions block');
  });

  test('open questions that block nothing do NOT appear in the blockers region', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('blockers-nonblocking');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Test', 'in_progress'));

    await writeFile(
      path.join(buildRoot, 'open-questions', '_index.md'),
      makeQuestionsIndex([
        { id: 'Q030', title: 'Nice-to-know, blocks nothing', blocks: '—' },
        { id: 'Q031', title: 'Also non-blocking', blocks: '' },
      ])
    );

    const { regions } = await buildStateCompilationOutput({ store, buildRoot, now: '2026-06-01T10:00:00.000Z' });
    assert.ok(!regions.blockers.includes('Q030'), 'non-blocking Q030 must not appear in blockers');
    assert.ok(!regions.blockers.includes('Q031'), 'non-blocking Q031 must not appear in blockers');
    assert.ok(regions.blockers.includes('None'), 'blockers should say None when only non-blocking questions exist');
  });

  test('blocked WUs (🔴 rows) appear in the blockers region', async () => {
    const { buildRoot, workflowsPath, catalogueDir } = await makeWorkspace('blockers-wus');
    const store = await openWorkflowStore(workflowsPath);
    await setActiveWu(buildRoot, catalogueDir, 'wu-113', 'Active WU');
    await appendWuRow(buildRoot, 'wu-200', 'Stuck on upstream contract', 'blocked');
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));

    const { regions } = await buildStateCompilationOutput({ store, buildRoot, now: '2026-06-01T10:00:00.000Z' });
    assert.ok(regions.blockers.includes('wu-200'), 'blocked wu-200 not in blockers region');
    assert.ok(regions.blockers.includes('Stuck on upstream contract'), 'blocked WU title not in blockers region');
  });

  test('resolved questions do NOT leak into the blockers region (section-boundary isolation)', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('blockers-resolved');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Test', 'in_progress'));

    // Q050 is active and blocking; Q999 sits under ## Resolved questions and must not leak.
    const indexContent = [
      '# Open Questions Index',
      '',
      '## Active questions',
      '',
      '| ID | Title | Blocks | Raised |',
      '|---|---|---|---|',
      '| [Q050](Q050-test.md) | Active blocking question | WU 113 | 2026-06-01 |',
      '',
      '## Resolved questions',
      '',
      '| ID | Title | Blocks | Raised |',
      '|---|---|---|---|',
      '| [Q999](Q999-test.md) | Resolved question | WU 113 | 2026-06-01 |',
      '',
    ].join('\n');
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), indexContent);

    const { regions } = await buildStateCompilationOutput({ store, buildRoot, now: '2026-06-01T10:00:00.000Z' });
    assert.ok(regions.blockers.includes('Q050'), 'active blocking Q050 must appear in blockers');
    assert.ok(!regions.blockers.includes('Q999'), 'resolved Q999 must NOT appear in blockers — section boundary not respected');
  });
});

// ---------------------------------------------------------------------------
// AC 1: No LLM in the compile path — code-inspection + run-without-adapter
// ---------------------------------------------------------------------------

describe('AC 1 — No LLM in the compile path', () => {
  test('state-compile.ts contains no llmAdapter reference (static inspection)', async () => {
    const { readFile: rf } = await import('node:fs/promises');
    const src = await rf(
      new URL('../src/commands/state-compile.ts', import.meta.url),
      'utf8'
    );
    assert.ok(!src.includes('llmAdapter.generate'), 'state-compile.ts must not call llmAdapter.generate');
    assert.ok(!src.includes('llmAdapter'), 'state-compile.ts must not import or reference llmAdapter at all');
  });

  test('buildStateCompilationOutput completes successfully with no LLM or embedder configured', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('ac1-no-llm');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Consume NuWiki', 'in_progress'));
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([
      { id: 'Q009', title: 'Catalogue maintenance gate', blocks: 'WU 113' },
    ]));

    let result: Awaited<ReturnType<typeof buildStateCompilationOutput>>;
    await assert.doesNotReject(async () => {
      result = await buildStateCompilationOutput({
        store,
        buildRoot,
        now: '2026-06-01T12:00:00.000Z',
      });
    }, 'buildStateCompilationOutput should not throw without an LLM or embedder');

    for (const key of Object.values(STATE_REGION_KEYS)) {
      const content = result!.regions[key as keyof typeof result.regions];
      assert.ok(content && content.length > 0, `region "${key}" is empty — possible LLM dependency`);
    }
  });
});

// ---------------------------------------------------------------------------
// AC 2: Byte-preservation — span-level comparison (not includes())
// ---------------------------------------------------------------------------

/**
 * Extract the non-generated-region spans from a STATE.md string — strips the
 * content between each sentinel pair (keeping the sentinel lines), leaving only
 * authored spans. Two files with identical authored content produce identical
 * output regardless of what was written inside the sentinel pairs.
 */
function extractNonRegionSpans(fileContent: string): string {
  const keys = Object.values(STATE_REGION_KEYS);
  let result = fileContent;

  for (const key of keys) {
    const marker = STATE_SENTINEL_CONFIG.markerPattern.replace('{{key}}', key);
    const openLine = STATE_SENTINEL_CONFIG.openTemplate.replace('{{marker}}', marker);
    const closeLine = STATE_SENTINEL_CONFIG.closeTemplate.replace('{{marker}}', marker);

    const escapedOpen = openLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedClose = closeLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regionRegex = new RegExp(
      `(${escapedOpen}\\n)[\\s\\S]*?(\\n${escapedClose})`,
      'g'
    );
    result = result.replace(regionRegex, `$1$2`);
  }

  return result;
}

describe('AC 2 — Byte-preservation (span-level strictEqual, not includes())', () => {
  test('authored prose spans are byte-for-byte identical before and after compile', async () => {
    const { buildRoot, workflowsPath, workspace, catalogueDir } = await makeWorkspace('ac2-byte-exact');
    const store = await openWorkflowStore(workflowsPath);
    await setActiveWu(buildRoot, catalogueDir, 'wu-113', 'Consume NuWiki');
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));

    const tricky = [
      '',
      '## Authored heading — hand-written',
      '',
      'Paragraph with   trailing whitespace.   ',
      '',
      '<!-- this looks like a sentinel comment:start but is authored prose -->',
      '',
      'Another paragraph.',
      '',
    ].join('\n');

    const fixturePath = path.join(workspace, 'STATE-byte-exact.md');
    const original = makeFixtureStateMd(tricky);
    await writeFile(fixturePath, original);

    const originalNonRegionSpans = extractNonRegionSpans(original);

    const result = await cmdStateCompile(store, {
      buildRoot,
      stateMdPath: fixturePath,
      now: '2026-06-01T10:00:00.000Z',
    });

    assert.equal(result.exitCode, 0, `compile failed: ${result.output}`);

    const after = await readFile(fixturePath, 'utf8');
    const afterNonRegionSpans = extractNonRegionSpans(after);

    assert.equal(
      afterNonRegionSpans,
      originalNonRegionSpans,
      'Non-region spans are not byte-identical after compile — authored prose was modified'
    );

    assert.ok(!after.includes('(generated content goes here)'), 'placeholder text was not replaced inside sentinel regions');
  });

  test('sentinel lines themselves are preserved verbatim (not rewritten)', async () => {
    const { buildRoot, workflowsPath, workspace, catalogueDir } = await makeWorkspace('ac2-sentinel-verbatim');
    const store = await openWorkflowStore(workflowsPath);
    await setActiveWu(buildRoot, catalogueDir, 'wu-113', 'Consume NuWiki');
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));

    const fixturePath = path.join(workspace, 'STATE-sentinel-verbatim.md');
    const original = makeFixtureStateMd();
    await writeFile(fixturePath, original);

    await cmdStateCompile(store, {
      buildRoot,
      stateMdPath: fixturePath,
      now: '2026-06-01T10:00:00.000Z',
    });

    const after = await readFile(fixturePath, 'utf8');

    for (const key of Object.values(STATE_REGION_KEYS)) {
      const marker = STATE_SENTINEL_CONFIG.markerPattern.replace('{{key}}', key);
      const openLine = STATE_SENTINEL_CONFIG.openTemplate.replace('{{marker}}', marker);
      const closeLine = STATE_SENTINEL_CONFIG.closeTemplate.replace('{{marker}}', marker);
      assert.ok(after.includes(openLine), `open sentinel for "${key}" was removed or modified`);
      assert.ok(after.includes(closeLine), `close sentinel for "${key}" was removed or modified`);
    }
  });

  test('absent-sentinel path does not write a single byte to the file', async () => {
    const { buildRoot, workflowsPath, workspace } = await makeWorkspace('ac2-absent-no-write');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Consume NuWiki', 'in_progress'));
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));

    // A STATE.md with only ONE of the two sentinels present.
    const partial = [
      '# STATE',
      '',
      '<!-- nuos:generated:where:start -->',
      '(stale)',
      '<!-- nuos:generated:where:end -->',
      '',
      '## Resume',
      '',
      'Some authored prose — the blockers sentinel region does not exist.',
      '',
    ].join('\n');

    const fixturePath = path.join(workspace, 'STATE-partial-sentinels.md');
    await writeFile(fixturePath, partial);

    const result = await cmdStateCompile(store, {
      buildRoot,
      stateMdPath: fixturePath,
      now: '2026-06-01T10:00:00.000Z',
    });

    assert.equal(result.exitCode, 1, 'should exit non-zero when some sentinels are missing');
    assert.ok(result.output.includes('sentinel regions are absent'), `missing-region message absent: ${result.output}`);

    const after = await readFile(fixturePath, 'utf8');
    assert.strictEqual(after, partial, 'file was modified despite absent sentinels (byte-safety failure)');
  });
});

// ---------------------------------------------------------------------------
// AC 6: The rename — stateMdLastSessionResolves → stateMdLastSessionPresent
// (verifies end-of-session.ts internals; unrelated to region collapse)
// ---------------------------------------------------------------------------

describe('AC 6 — The rename: stateMdLastSessionPresent in end-of-session.ts', () => {
  test('checkStateMd internal variable is named stateMdLastSessionPresent, not stateMdLastSessionResolves', async () => {
    const { readFile: rf } = await import('node:fs/promises');
    const src = await rf(
      new URL('../src/commands/end-of-session.ts', import.meta.url),
      'utf8'
    );
    assert.ok(
      src.includes('stateMdLastSessionPresent'),
      'end-of-session.ts must use the renamed variable stateMdLastSessionPresent'
    );
    const letConstDeclarations = src.match(/(?:let|const|var)\s+stateMdLastSessionResolves\b/g);
    assert.equal(
      letConstDeclarations,
      null,
      `end-of-session.ts still declares a variable named stateMdLastSessionResolves: ${letConstDeclarations}`
    );
  });

  test('the returned EndOfSessionFacts field is still stateMdLastSessionResolves (interface compatibility)', async () => {
    const { readFile: rf } = await import('node:fs/promises');
    const src = await rf(
      new URL('../src/commands/end-of-session.ts', import.meta.url),
      'utf8'
    );
    assert.ok(
      src.includes('stateMdLastSessionResolves: stateMdLastSessionPresent'),
      'end-of-session.ts must return { stateMdLastSessionResolves: stateMdLastSessionPresent } to preserve the published interface'
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
