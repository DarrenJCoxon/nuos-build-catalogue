/**
 * Tests for `nuos-catalogue state compile` — WU 113b / D132.
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
 *   9. Index parsers: decisions, questions, risks each produce correct output
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
}> {
  const workspace = await mkdtemp(path.join(globalWorkspace, `${label}-`));
  const buildRoot = path.join(workspace, 'docs', 'build');
  const workflowsPath = path.join(workspace, '.nuos-catalogue', 'workflows.json');

  await mkdir(path.join(buildRoot, 'work-units'), { recursive: true });
  await mkdir(path.join(buildRoot, 'decisions'), { recursive: true });
  await mkdir(path.join(buildRoot, 'open-questions'), { recursive: true });
  await mkdir(path.join(buildRoot, 'risks'), { recursive: true });
  await mkdir(path.join(workspace, '.nuos-catalogue'), { recursive: true });

  return { workspace, buildRoot, workflowsPath };
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

function makeDecisionRecord(handle: string, title: string, status = 'active'): MigratedRecord {
  const numStr = handle.replace(/[^\d]/g, '');
  const num = numStr ? parseInt(numStr, 10) : 1;
  return {
    handle,
    number: num,
    register: 'decision',
    title,
    status,
    slug: handle.replace('D', ''),
    sourcePath: `decisions/${handle}-test.md`,
    rawMarkdown: `# ${handle}\n\nTest decision.`,
    fileModifiedAt: '2026-06-01T10:00:00.000Z',
    migratedAt: '2026-06-01T10:00:00.000Z',
    migratedFrom: 'markdown',
  };
}

/** A minimal fixture STATE.md with all six sentinel pairs + authored prose around them. */
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

  blocks.push('## What was just done');
  blocks.push('');
  blocks.push('This authored section is hand-maintained and must never be touched by state compile.');
  blocks.push('');

  return blocks.join('\n');
}

/** The decisions _index.md format used by the live catalogue. */
function makeDecisionsIndex(entries: Array<{ id: string; title: string; date: string; status: string }>): string {
  const lines = [
    '# Decisions Index',
    '',
    '## Active decisions',
    '',
    '| ID | Title | Date | Status |',
    '|---|---|---|---|',
  ];
  for (const e of entries) {
    lines.push(`| [${e.id}](${e.id}-test.md) | ${e.title} | ${e.date} | ${e.status} |`);
  }
  return lines.join('\n') + '\n';
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

function makeRisksIndex(entries: Array<{ id: string; title: string; severity: string; likelihood: string; status: string }>): string {
  const lines = [
    '# Risk Register',
    '',
    '## Active risks',
    '',
    '| ID | Title | Severity | Likelihood | Status |',
    '|---|---|---|---|---|',
  ];
  for (const e of entries) {
    lines.push(`| ${e.id} | ${e.title} | ${e.severity} | ${e.likelihood} | ${e.status} |`);
  }
  lines.push('');
  lines.push('## Resolved risks');
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

  test('exports all six region keys', () => {
    const keys = Object.values(STATE_REGION_KEYS);
    assert.equal(keys.length, 6);
    assert.ok(keys.includes('metadata'));
    assert.ok(keys.includes('what_is_next'));
    assert.ok(keys.includes('open_questions'));
    assert.ok(keys.includes('recent_decisions'));
    assert.ok(keys.includes('risks'));
    assert.ok(keys.includes('health_check'));
  });
});

// ---------------------------------------------------------------------------
// Test 2: Adapter produces LLMCompilationOutput with no LLM call
// ---------------------------------------------------------------------------

describe('buildStateCompilationOutput', () => {
  test('produces a valid LLMCompilationOutput from store + disk state — no LLM call', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('adapter-basic');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Consume NuWiki capability', 'in_progress'));
    store.put(makeDecisionRecord('D132', 'STATE.md hybrid compile'));

    // Write minimal register index files
    await writeFile(
      path.join(buildRoot, 'decisions', '_index.md'),
      makeDecisionsIndex([{ id: 'D132', title: 'STATE.md hybrid compile', date: '2026-06-01', status: 'accepted' }])
    );
    await writeFile(
      path.join(buildRoot, 'open-questions', '_index.md'),
      makeQuestionsIndex([])
    );
    await writeFile(
      path.join(buildRoot, 'risks', '_index.md'),
      makeRisksIndex([])
    );

    const result = await buildStateCompilationOutput({
      store,
      buildRoot,
      now: '2026-06-01T12:00:00.000Z',
    });

    // Structural checks
    assert.ok(result.compilationOutput.summary.length > 0);
    assert.equal(result.compilationOutput.sections.length, 6);
    assert.equal(result.compilationOutput.citations.length, 0);
    assert.equal(result.compilationOutput.outboundLinks.length, 0);

    // All six regions must be present
    const keys = Object.values(STATE_REGION_KEYS);
    for (const key of keys) {
      assert.ok(Object.prototype.hasOwnProperty.call(result.regions, key), `missing region: ${key}`);
      assert.ok(result.regions[key as keyof typeof result.regions].length > 0, `empty region: ${key}`);
    }

    // Metadata region must contain today's date
    assert.ok(result.regions.metadata.includes('2026-06-01'), 'metadata region missing today date');

    // What-is-next region must mention the active WU
    assert.ok(result.regions.what_is_next.includes('wu-113'), 'what_is_next missing active WU handle');

    // Decisions region must mention D132
    assert.ok(result.regions.recent_decisions.includes('D132'), 'recent_decisions missing D132');
  });

  test('produces correct output when store is empty', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('adapter-empty');
    const store = await openWorkflowStore(workflowsPath);
    await writeFile(path.join(buildRoot, 'decisions', '_index.md'), makeDecisionsIndex([]));
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));
    await writeFile(path.join(buildRoot, 'risks', '_index.md'), makeRisksIndex([]));

    const result = await buildStateCompilationOutput({ store, buildRoot, now: '2026-06-01T09:00:00.000Z' });

    assert.equal(result.compilationOutput.sections.length, 6);
    assert.ok(result.regions.what_is_next.includes('No active'), 'empty store should say no active WU');
  });
});

// ---------------------------------------------------------------------------
// Test 3: splice preserves authored prose byte-for-byte
// ---------------------------------------------------------------------------

describe('cmdStateCompile — authored prose preservation', () => {
  test('only generated regions change; authored prose is byte-identical', async () => {
    const { buildRoot, workflowsPath, workspace } = await makeWorkspace('splice-prose');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Consume NuWiki', 'in_progress'));
    store.put(makeDecisionRecord('D132', 'STATE.md hybrid compile'));

    await writeFile(path.join(buildRoot, 'decisions', '_index.md'), makeDecisionsIndex([
      { id: 'D132', title: 'STATE.md hybrid compile', date: '2026-06-01', status: 'accepted' },
    ]));
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));
    await writeFile(path.join(buildRoot, 'risks', '_index.md'), makeRisksIndex([]));

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

    // The authored prose must be byte-identical
    assert.ok(after.includes(authoredProse), 'authored prose string was not preserved');
    assert.ok(after.includes('This is authored prose above the first generated region.'), 'authored prose above first region was changed');
    assert.ok(after.includes('## What was just done'), 'authored What-was-just-done section was removed');
    assert.ok(after.includes('This authored section is hand-maintained'), 'authored section body was changed');

    // The generated regions must have changed (they contained placeholder text)
    assert.ok(!after.includes('(generated content goes here)'), 'placeholder text was not replaced');

    // Generated regions must contain real content
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
    await writeFile(path.join(buildRoot, 'decisions', '_index.md'), makeDecisionsIndex([]));
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));
    await writeFile(path.join(buildRoot, 'risks', '_index.md'), makeRisksIndex([]));

    // STATE.md with NO sentinel pairs
    const stateMdContent = '# STATE\n\nAuthored content only — no sentinel pairs.\n\n## What was just done\n\nSome history.\n';
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
    assert.ok(result.output.includes('Stage B'), 'output should reference Stage B cutover guidance');

    // File must be unchanged
    const after = await readFile(fixturePath, 'utf8');
    assert.equal(after, stateMdContent, 'file was modified despite missing sentinels');
  });
});

// ---------------------------------------------------------------------------
// Test 5: Idempotent — re-running with same state is a no-op
// ---------------------------------------------------------------------------

describe('cmdStateCompile — idempotent', () => {
  test('second compile with unchanged store produces identical output', async () => {
    const { buildRoot, workflowsPath, workspace } = await makeWorkspace('idempotent');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Consume NuWiki', 'in_progress'));
    await writeFile(path.join(buildRoot, 'decisions', '_index.md'), makeDecisionsIndex([]));
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));
    await writeFile(path.join(buildRoot, 'risks', '_index.md'), makeRisksIndex([]));

    const fixturePath = path.join(workspace, 'STATE-idempotent.md');
    await writeFile(fixturePath, makeFixtureStateMd());

    // First compile
    const r1 = await cmdStateCompile(store, { buildRoot, stateMdPath: fixturePath, now: '2026-06-01T10:00:00.000Z' });
    assert.equal(r1.exitCode, 0, `first compile failed: ${r1.output}`);
    const afterFirst = await readFile(fixturePath, 'utf8');

    // Second compile — same store, same now
    const r2 = await cmdStateCompile(store, { buildRoot, stateMdPath: fixturePath, now: '2026-06-01T10:00:00.000Z' });
    assert.equal(r2.exitCode, 0, `second compile failed: ${r2.output}`);
    const afterSecond = await readFile(fixturePath, 'utf8');

    // Output must be byte-identical
    assert.equal(afterSecond, afterFirst, 'second compile changed the file (not idempotent)');

    // Second compile should report no updated regions
    assert.deepEqual(r2.updatedRegions, [], 'second compile should have no updated regions');
  });
});

// ---------------------------------------------------------------------------
// Test 6: Multiple state changes (advance → revert → advance)
// ---------------------------------------------------------------------------

describe('cmdStateCompile — multiple state changes', () => {
  test('recompiles correctly across advance → revert → advance cycle', async () => {
    const { buildRoot, workflowsPath, workspace } = await makeWorkspace('state-changes');
    const store = await openWorkflowStore(workflowsPath);

    await writeFile(path.join(buildRoot, 'decisions', '_index.md'), makeDecisionsIndex([]));
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));
    await writeFile(path.join(buildRoot, 'risks', '_index.md'), makeRisksIndex([]));

    const fixturePath = path.join(workspace, 'STATE-transitions.md');
    await writeFile(fixturePath, makeFixtureStateMd());

    // --- State A: wu-113 is in_progress ---
    store.put(makeWuRecord('wu-113', 'Consume NuWiki', 'in_progress'));
    const rA = await cmdStateCompile(store, { buildRoot, stateMdPath: fixturePath, now: '2026-06-01T10:00:00.000Z' });
    assert.equal(rA.exitCode, 0, `state A compile failed: ${rA.output}`);
    const afterA = await readFile(fixturePath, 'utf8');
    assert.ok(afterA.includes('wu-113'), 'State A: active WU not in output');

    // --- State B: advance wu-113 to done, start wu-114 ---
    store.put({ ...makeWuRecord('wu-113', 'Consume NuWiki', 'done'), status: 'done' });
    store.put(makeWuRecord('wu-114', 'Per-WU notes compile', 'in_progress'));
    const rB = await cmdStateCompile(store, { buildRoot, stateMdPath: fixturePath, now: '2026-06-01T11:00:00.000Z' });
    assert.equal(rB.exitCode, 0, `state B compile failed: ${rB.output}`);
    const afterB = await readFile(fixturePath, 'utf8');
    assert.ok(afterB.includes('wu-114'), 'State B: new active WU not in output');

    // --- State C: revert — wu-113 back to in_progress (simulate undo) ---
    store.put(makeWuRecord('wu-113', 'Consume NuWiki', 'in_progress'));
    store.put({ ...makeWuRecord('wu-114', 'Per-WU notes compile', 'proposed'), status: 'proposed' });
    const rC = await cmdStateCompile(store, { buildRoot, stateMdPath: fixturePath, now: '2026-06-01T12:00:00.000Z' });
    assert.equal(rC.exitCode, 0, `state C compile failed: ${rC.output}`);
    const afterC = await readFile(fixturePath, 'utf8');
    assert.ok(afterC.includes('wu-113'), 'State C: reverted active WU not in output');

    // Authored prose must have survived all transitions
    assert.ok(afterC.includes('## What was just done'), 'authored section removed after state transitions');
    assert.ok(afterC.includes('This authored section is hand-maintained'), 'authored prose body was lost');
  });
});

// ---------------------------------------------------------------------------
// Test 7: Dry run
// ---------------------------------------------------------------------------

describe('cmdStateCompile — dry run', () => {
  test('dry run reports update set but does not write', async () => {
    const { buildRoot, workflowsPath, workspace } = await makeWorkspace('dry-run');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Consume NuWiki', 'in_progress'));
    await writeFile(path.join(buildRoot, 'decisions', '_index.md'), makeDecisionsIndex([]));
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));
    await writeFile(path.join(buildRoot, 'risks', '_index.md'), makeRisksIndex([]));

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

    // File must be unchanged
    const after = await readFile(fixturePath, 'utf8');
    assert.equal(after, fixture, 'dry run modified the file');
  });
});

// ---------------------------------------------------------------------------
// Test 8: checkStateMdDrift
// ---------------------------------------------------------------------------

describe('checkStateMdDrift', () => {
  test('returns clean=true when file matches expected regions', async () => {
    const { buildRoot, workflowsPath, workspace } = await makeWorkspace('drift-clean');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Consume NuWiki', 'in_progress'));
    await writeFile(path.join(buildRoot, 'decisions', '_index.md'), makeDecisionsIndex([]));
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));
    await writeFile(path.join(buildRoot, 'risks', '_index.md'), makeRisksIndex([]));

    const fixturePath = path.join(workspace, 'STATE-drift.md');
    await writeFile(fixturePath, makeFixtureStateMd());

    // First compile to establish baseline
    await cmdStateCompile(store, { buildRoot, stateMdPath: fixturePath, now: '2026-06-01T10:00:00.000Z' });
    const compiled = await readFile(fixturePath, 'utf8');

    // Build expected regions from same adapter call
    const { regions } = await buildStateCompilationOutput({ store, buildRoot, now: '2026-06-01T10:00:00.000Z' });

    const report = checkStateMdDrift(compiled, regions);
    assert.equal(report.clean, true, `drift reported after a clean compile: ${JSON.stringify(report.regions.filter(r => r.status !== 'clean'))}`);
  });

  test('returns clean=false when a generated region has been hand-edited', async () => {
    const { buildRoot, workflowsPath, workspace } = await makeWorkspace('drift-detected');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Consume NuWiki', 'in_progress'));
    await writeFile(path.join(buildRoot, 'decisions', '_index.md'), makeDecisionsIndex([]));
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));
    await writeFile(path.join(buildRoot, 'risks', '_index.md'), makeRisksIndex([]));

    const fixturePath = path.join(workspace, 'STATE-hand-edit.md');
    await writeFile(fixturePath, makeFixtureStateMd());

    // Compile once to populate regions
    await cmdStateCompile(store, { buildRoot, stateMdPath: fixturePath, now: '2026-06-01T10:00:00.000Z' });

    // Hand-edit the metadata region
    const compiled = await readFile(fixturePath, 'utf8');
    const metaMarker = STATE_SENTINEL_CONFIG.markerPattern.replace('{{key}}', STATE_REGION_KEYS.METADATA);
    const openLine = STATE_SENTINEL_CONFIG.openTemplate.replace('{{marker}}', metaMarker);
    const closeLine = STATE_SENTINEL_CONFIG.closeTemplate.replace('{{marker}}', metaMarker);
    const modified = compiled.replace(
      new RegExp(`(${escapeRegex(openLine)}\n)[\\s\\S]*?(\n${escapeRegex(closeLine)})`),
      `$1HAND-EDITED: this should not be here\n$2`
    );
    await writeFile(fixturePath, modified);

    // Build expected regions
    const { regions } = await buildStateCompilationOutput({ store, buildRoot, now: '2026-06-01T10:00:00.000Z' });

    const report = checkStateMdDrift(modified, regions);
    assert.equal(report.clean, false, 'drift not detected after hand-edit');
    const metaDrift = report.regions.find(r => r.key === STATE_REGION_KEYS.METADATA);
    assert.ok(metaDrift, 'metadata region not in drift report');
    assert.equal(metaDrift?.status, 'drifted', 'metadata region should be drifted');
  });
});

// ---------------------------------------------------------------------------
// Test 9: Index parsers (decisions, questions, risks)
// ---------------------------------------------------------------------------

describe('index parsers via buildStateCompilationOutput', () => {
  test('decisions index: recent decisions appear in generated region', async () => {
    const { buildRoot, workflowsPath, workspace } = await makeWorkspace('decisions-index');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Test', 'in_progress'));

    await writeFile(
      path.join(buildRoot, 'decisions', '_index.md'),
      makeDecisionsIndex([
        { id: 'D132', title: 'STATE.md hybrid compile', date: '2026-06-01', status: 'accepted' },
        { id: 'D131', title: 'Memory store separation', date: '2026-06-01', status: 'accepted' },
      ])
    );
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));
    await writeFile(path.join(buildRoot, 'risks', '_index.md'), makeRisksIndex([]));

    const { regions } = await buildStateCompilationOutput({ store, buildRoot, now: '2026-06-01T10:00:00.000Z' });
    assert.ok(regions.recent_decisions.includes('D132'), 'D132 not in decisions region');
    assert.ok(regions.recent_decisions.includes('D131'), 'D131 not in decisions region');
  });

  test('open-questions index: active questions appear in generated region', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('questions-index');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Test', 'in_progress'));

    await writeFile(path.join(buildRoot, 'decisions', '_index.md'), makeDecisionsIndex([]));
    await writeFile(
      path.join(buildRoot, 'open-questions', '_index.md'),
      makeQuestionsIndex([
        { id: 'Q009', title: 'Catalogue maintenance gate', blocks: 'WU 113' },
        { id: 'Q020', title: 'Maintainer Mac bus factor', blocks: 'nuvector release' },
      ])
    );
    await writeFile(path.join(buildRoot, 'risks', '_index.md'), makeRisksIndex([]));

    const { regions } = await buildStateCompilationOutput({ store, buildRoot, now: '2026-06-01T10:00:00.000Z' });
    assert.ok(regions.open_questions.includes('Q009'), 'Q009 not in open_questions region');
    assert.ok(regions.open_questions.includes('Q020'), 'Q020 not in open_questions region');
  });

  test('risks index: active risks appear in generated region', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('risks-index');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Test', 'in_progress'));

    await writeFile(path.join(buildRoot, 'decisions', '_index.md'), makeDecisionsIndex([]));
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));
    await writeFile(
      path.join(buildRoot, 'risks', '_index.md'),
      makeRisksIndex([
        { id: 'R005', title: 'Programme runway', severity: 'Critical', likelihood: 'Medium', status: 'monitoring' },
        { id: 'R007', title: 'Catalogue discipline loss', severity: 'High', likelihood: 'Medium', status: 'monitoring' },
      ])
    );

    const { regions } = await buildStateCompilationOutput({ store, buildRoot, now: '2026-06-01T10:00:00.000Z' });
    assert.ok(regions.risks.includes('R005'), 'R005 not in risks region');
    assert.ok(regions.risks.includes('R007'), 'R007 not in risks region');
  });
});

// ---------------------------------------------------------------------------
// Additional tests (WU 113b Stage A tester pass)
// ---------------------------------------------------------------------------

// AC 1: No LLM in the compile path — code-inspection + run-without-adapter
// ---------------------------------------------------------------------------

describe('AC 1 — No LLM in the compile path', () => {
  test('state-compile.ts contains no llmAdapter.generate call (static inspection)', async () => {
    const { readFile: rf } = await import('node:fs/promises');
    const src = await rf(
      new URL('../src/commands/state-compile.ts', import.meta.url),
      'utf8'
    );
    // The file must not contain llmAdapter.generate or any .generate( call that
    // would imply an LLM round-trip.
    assert.ok(
      !src.includes('llmAdapter.generate'),
      'state-compile.ts must not call llmAdapter.generate'
    );
    assert.ok(
      !src.includes('llmAdapter'),
      'state-compile.ts must not import or reference llmAdapter at all'
    );
  });

  test('buildStateCompilationOutput completes successfully with no LLM or embedder configured', async () => {
    // The test environment has no LLM or embedding provider configured.
    // If the compile path required either, this would throw or return empty regions.
    const { buildRoot, workflowsPath } = await makeWorkspace('ac1-no-llm');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Consume NuWiki', 'in_progress'));
    await writeFile(path.join(buildRoot, 'decisions', '_index.md'), makeDecisionsIndex([
      { id: 'D132', title: 'STATE.md hybrid compile', date: '2026-06-01', status: 'accepted' },
    ]));
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([
      { id: 'Q009', title: 'Catalogue maintenance gate', blocks: 'WU 113' },
    ]));
    await writeFile(path.join(buildRoot, 'risks', '_index.md'), makeRisksIndex([
      { id: 'R005', title: 'Programme runway', severity: 'Critical', likelihood: 'Medium', status: 'monitoring' },
    ]));

    // This must complete with no errors and produce all six regions —
    // no LLM or embedding service is running.
    let result: Awaited<ReturnType<typeof buildStateCompilationOutput>>;
    await assert.doesNotReject(async () => {
      result = await buildStateCompilationOutput({
        store,
        buildRoot,
        now: '2026-06-01T12:00:00.000Z',
      });
    }, 'buildStateCompilationOutput should not throw without an LLM or embedder');

    // All six regions must be non-empty.
    for (const key of Object.values(STATE_REGION_KEYS)) {
      const content = result!.regions[key as keyof typeof result.regions];
      assert.ok(content && content.length > 0, `region "${key}" is empty — possible LLM dependency`);
    }
  });
});

// AC 2: Byte-preservation — span-level comparison (not includes())
// ---------------------------------------------------------------------------

/**
 * Extract the non-generated-region spans from a STATE.md string.
 *
 * The sentinel pairs look like:
 *   <!-- nuos:generated:<key>:start -->
 *   ...generated content...
 *   <!-- nuos:generated:<key>:end -->
 *
 * This function strips everything BETWEEN the open and close sentinel lines
 * (inclusive of the content lines but keeping the sentinel lines themselves),
 * leaving a string that consists only of:
 *   - the open sentinel line
 *   - the close sentinel line
 *   - everything outside the sentinel pairs
 *
 * Two files with identical non-region content will produce identical output
 * from this function, regardless of what was written inside the sentinel pairs.
 */
function extractNonRegionSpans(fileContent: string): string {
  const keys = Object.values(STATE_REGION_KEYS);
  let result = fileContent;

  for (const key of keys) {
    const marker = STATE_SENTINEL_CONFIG.markerPattern.replace('{{key}}', key);
    const openLine = STATE_SENTINEL_CONFIG.openTemplate.replace('{{marker}}', marker);
    const closeLine = STATE_SENTINEL_CONFIG.closeTemplate.replace('{{marker}}', marker);

    // Replace everything between the sentinel lines (exclusive of the sentinel
    // lines themselves) with the empty string.  This normalises the generated
    // content so the comparison only measures the authored spans.
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
  test('authored prose spans are byte-for-byte identical before and after compile (strictEqual on non-region spans)', async () => {
    const { buildRoot, workflowsPath, workspace } = await makeWorkspace('ac2-byte-exact');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Consume NuWiki', 'in_progress'));

    await writeFile(path.join(buildRoot, 'decisions', '_index.md'), makeDecisionsIndex([
      { id: 'D132', title: 'STATE.md hybrid compile', date: '2026-06-01', status: 'accepted' },
    ]));
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));
    await writeFile(path.join(buildRoot, 'risks', '_index.md'), makeRisksIndex([]));

    // Authored prose that is intentionally chosen to include:
    //   - markdown headings
    //   - blank lines
    //   - trailing whitespace on a line
    //   - content that superficially resembles a sentinel marker comment
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

    // This is the safety-critical assertion: every byte outside the six
    // sentinel-delimited regions must be byte-for-byte identical.
    assert.equal(
      afterNonRegionSpans,
      originalNonRegionSpans,
      'Non-region spans are not byte-identical after compile — authored prose was modified'
    );

    // Separately confirm: the placeholder content was replaced.
    assert.ok(
      !after.includes('(generated content goes here)'),
      'placeholder text was not replaced inside sentinel regions'
    );
  });

  test('sentinel lines themselves are preserved verbatim (not rewritten)', async () => {
    const { buildRoot, workflowsPath, workspace } = await makeWorkspace('ac2-sentinel-verbatim');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Consume NuWiki', 'in_progress'));
    await writeFile(path.join(buildRoot, 'decisions', '_index.md'), makeDecisionsIndex([]));
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));
    await writeFile(path.join(buildRoot, 'risks', '_index.md'), makeRisksIndex([]));

    const fixturePath = path.join(workspace, 'STATE-sentinel-verbatim.md');
    const original = makeFixtureStateMd();
    await writeFile(fixturePath, original);

    await cmdStateCompile(store, {
      buildRoot,
      stateMdPath: fixturePath,
      now: '2026-06-01T10:00:00.000Z',
    });

    const after = await readFile(fixturePath, 'utf8');

    // Every sentinel line from the original must still be present verbatim.
    for (const key of Object.values(STATE_REGION_KEYS)) {
      const marker = STATE_SENTINEL_CONFIG.markerPattern.replace('{{key}}', key);
      const openLine = STATE_SENTINEL_CONFIG.openTemplate.replace('{{marker}}', marker);
      const closeLine = STATE_SENTINEL_CONFIG.closeTemplate.replace('{{marker}}', marker);
      assert.ok(after.includes(openLine), `open sentinel for "${key}" was removed or modified`);
      assert.ok(after.includes(closeLine), `close sentinel for "${key}" was removed or modified`);
    }
  });

  test('absent-sentinel path does not write a single byte to the file', async () => {
    // This is the most critical safety test: when sentinels are missing, the
    // file must be completely unchanged — not even a timestamp bump.
    const { buildRoot, workflowsPath, workspace } = await makeWorkspace('ac2-absent-no-write');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Consume NuWiki', 'in_progress'));
    await writeFile(path.join(buildRoot, 'decisions', '_index.md'), makeDecisionsIndex([]));
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));
    await writeFile(path.join(buildRoot, 'risks', '_index.md'), makeRisksIndex([]));

    // A STATE.md with only SOME sentinels (3 of 6 missing).
    const partial = [
      '# STATE',
      '',
      '<!-- nuos:generated:metadata:start -->',
      '(stale)',
      '<!-- nuos:generated:metadata:end -->',
      '',
      '## Authored section',
      '',
      'Some authored prose — no other sentinel regions exist.',
      '',
    ].join('\n');

    const fixturePath = path.join(workspace, 'STATE-partial-sentinels.md');
    await writeFile(fixturePath, partial);

    const result = await cmdStateCompile(store, {
      buildRoot,
      stateMdPath: fixturePath,
      now: '2026-06-01T10:00:00.000Z',
    });

    // Must exit non-zero.
    assert.equal(result.exitCode, 1, 'should exit non-zero when some sentinels are missing');

    // Must report the missing regions.
    assert.ok(result.output.includes('sentinel regions are absent'), `missing-region message absent: ${result.output}`);

    // File bytes must be unchanged — use strictEqual.
    const after = await readFile(fixturePath, 'utf8');
    assert.strictEqual(after, partial, 'file was modified despite absent sentinels (byte-safety failure)');
  });
});

// AC 6: The rename — stateMdLastSessionResolves → stateMdLastSessionPresent
// ---------------------------------------------------------------------------

describe('AC 6 — The rename: stateMdLastSessionPresent in end-of-session.ts', () => {
  test('checkStateMd internal variable is named stateMdLastSessionPresent, not stateMdLastSessionResolves', async () => {
    const { readFile: rf } = await import('node:fs/promises');
    const src = await rf(
      new URL('../src/commands/end-of-session.ts', import.meta.url),
      'utf8'
    );
    // The old variable name must not appear as an internal variable declaration.
    // (It is still used as the returned field name to preserve the published interface.)
    // The internal variable used for the check must be the new name.
    assert.ok(
      src.includes('stateMdLastSessionPresent'),
      'end-of-session.ts must use the renamed variable stateMdLastSessionPresent'
    );
    // The old name may appear once as a returned property key (interface compatibility),
    // but must NOT appear as a let/const/var declaration.
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
    // The published EndOfSessionFacts interface uses stateMdLastSessionResolves —
    // the return statement in checkStateMd must still map to that field name.
    assert.ok(
      src.includes('stateMdLastSessionResolves: stateMdLastSessionPresent'),
      'end-of-session.ts must return { stateMdLastSessionResolves: stateMdLastSessionPresent } to preserve the published interface'
    );
  });
});

// ---------------------------------------------------------------------------
// Test 10: Section-boundary isolation — superseded decisions and resolved risks
// must never appear in the generated regions (WARN fix verification)
// ---------------------------------------------------------------------------

describe('index parsers — section-boundary isolation', () => {
  /**
   * Build a decisions _index.md that matches the real file structure:
   *   ## Active decisions    → active rows
   *   ## Superseded decisions → superseded rows (must NOT appear in output)
   *   ## Withdrawn decisions  → withdrawn rows (must NOT appear in output)
   */
  function makeDecisionsIndexWithSuperseded(
    active: Array<{ id: string; title: string; date: string; status: string }>,
    superseded: Array<{ id: string; title: string; date: string; supersededBy: string }>
  ): string {
    const lines = [
      '# Decisions Index',
      '',
      '> Every architectural decision.',
      '',
      '## Active decisions',
      '',
      '| ID | Title | Date | Status |',
      '|---|---|---|---|',
    ];
    for (const e of active) {
      lines.push(`| [${e.id}](${e.id}-test.md) | ${e.title} | ${e.date} | ${e.status} |`);
    }
    lines.push('');
    lines.push('## Superseded decisions');
    lines.push('');
    lines.push('| ID | Title | Date | Superseded by |');
    lines.push('|---|---|---|---|');
    for (const e of superseded) {
      lines.push(`| [${e.id}](superseded/${e.id}-test.md) | ${e.title} | ${e.date} | ${e.supersededBy} |`);
    }
    lines.push('');
    lines.push('## Withdrawn decisions');
    lines.push('');
    lines.push('(none yet)');
    lines.push('');
    lines.push('## How to write a decision');
    lines.push('');
    lines.push('Use the file format established in D001.');
    return lines.join('\n') + '\n';
  }

  function makeRisksIndexWithResolved(
    active: Array<{ id: string; title: string; severity: string; likelihood: string; status: string }>,
    resolved: Array<{ id: string; title: string; severity: string; likelihood: string; status: string }>
  ): string {
    const lines = [
      '# Risk Register',
      '',
      '## Active risks',
      '',
      '| ID | Title | Severity | Likelihood | Status |',
      '|---|---|---|---|---|',
    ];
    for (const e of active) {
      lines.push(`| ${e.id} | ${e.title} | ${e.severity} | ${e.likelihood} | ${e.status} |`);
    }
    lines.push('');
    lines.push('## Resolved risks');
    lines.push('');
    lines.push('| ID | Title | Severity | Likelihood | Status |');
    lines.push('|---|---|---|---|---|');
    for (const e of resolved) {
      lines.push(`| ${e.id} | ${e.title} | ${e.severity} | ${e.likelihood} | ${e.status} |`);
    }
    lines.push('');
    lines.push('## Format');
    lines.push('');
    lines.push('Each risk file should record the risk in one sentence.');
    return lines.join('\n') + '\n';
  }

  test('superseded decisions (high D-number) must NOT appear in recent_decisions region', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('superseded-decisions');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Test', 'in_progress'));

    // D010 is active; D999 is high-numbered but in the Superseded section — must not leak.
    await writeFile(
      path.join(buildRoot, 'decisions', '_index.md'),
      makeDecisionsIndexWithSuperseded(
        [{ id: 'D010', title: 'Active decision', date: '2026-06-01', status: 'active' }],
        [{ id: 'D999', title: 'High-number superseded decision', date: '2026-06-01', supersededBy: 'D010' }]
      )
    );
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));
    await writeFile(path.join(buildRoot, 'risks', '_index.md'), makeRisksIndex([]));

    const { regions } = await buildStateCompilationOutput({
      store, buildRoot, now: '2026-06-01T10:00:00.000Z',
    });

    assert.ok(
      regions.recent_decisions.includes('D010'),
      'active D010 must appear in recent_decisions'
    );
    assert.ok(
      !regions.recent_decisions.includes('D999'),
      'superseded D999 must NOT appear in recent_decisions — section boundary not respected'
    );
  });

  test('withdrawn decisions must NOT appear in recent_decisions region', async () => {
    // The ## Withdrawn decisions section also follows ## Superseded decisions;
    // the split on /## (?:Superseded|Withdrawn) decisions/ must catch both.
    const { buildRoot, workflowsPath } = await makeWorkspace('withdrawn-decisions');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Test', 'in_progress'));

    // Build a fixture where the ## Withdrawn decisions header comes BEFORE
    // ## Superseded decisions — verifies the regex matches whichever appears first.
    const indexContent = [
      '# Decisions Index',
      '',
      '## Active decisions',
      '',
      '| ID | Title | Date | Status |',
      '|---|---|---|---|',
      '| [D010](D010-test.md) | Active decision | 2026-06-01 | active |',
      '',
      '## Withdrawn decisions',
      '',
      '| ID | Title | Date | Withdrawn by |',
      '|---|---|---|---|',
      '| [D888](D888-test.md) | High-number withdrawn decision | 2026-06-01 | operator |',
      '',
    ].join('\n');

    await writeFile(path.join(buildRoot, 'decisions', '_index.md'), indexContent);
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));
    await writeFile(path.join(buildRoot, 'risks', '_index.md'), makeRisksIndex([]));

    const { regions } = await buildStateCompilationOutput({
      store, buildRoot, now: '2026-06-01T10:00:00.000Z',
    });

    assert.ok(
      regions.recent_decisions.includes('D010'),
      'active D010 must appear in recent_decisions'
    );
    assert.ok(
      !regions.recent_decisions.includes('D888'),
      'withdrawn D888 must NOT appear in recent_decisions — section boundary not respected'
    );
  });

  test('resolved risks must NOT appear in risks region', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('resolved-risks');
    const store = await openWorkflowStore(workflowsPath);
    store.put(makeWuRecord('wu-113', 'Test', 'in_progress'));

    await writeFile(path.join(buildRoot, 'decisions', '_index.md'), makeDecisionsIndex([]));
    await writeFile(path.join(buildRoot, 'open-questions', '_index.md'), makeQuestionsIndex([]));
    await writeFile(
      path.join(buildRoot, 'risks', '_index.md'),
      makeRisksIndexWithResolved(
        [{ id: 'R007', title: 'Active risk', severity: 'High', likelihood: 'Medium', status: 'monitoring' }],
        [{ id: 'R999', title: 'Resolved risk', severity: 'Low', likelihood: 'Low', status: 'resolved' }]
      )
    );

    const { regions } = await buildStateCompilationOutput({
      store, buildRoot, now: '2026-06-01T10:00:00.000Z',
    });

    assert.ok(
      regions.risks.includes('R007'),
      'active R007 must appear in risks region'
    );
    assert.ok(
      !regions.risks.includes('R999'),
      'resolved R999 must NOT appear in risks region — section boundary not respected'
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
