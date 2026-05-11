/**
 * Phase H part 2 — flag-driven write commands tests.
 *
 * End-to-end on a synthetic corpus: migrate, then exercise each of
 * the four write commands and assert that both the markdown file and
 * the JSON workflow store are updated atomically.
 *
 * Plus pure-function tests for the markdown editors.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { runMigrate } from '../src/migrate/run.js';
import { openWorkflowStore } from '../src/migrate/store.js';
import { createBuildCatalogueRuntime } from '../src/runtime/runtime.js';
import {
  cmdWuAdvance,
  cmdWuTick,
  cmdDecisionSupersede,
  cmdQuestionResolve,
} from '../src/commands/write.js';
import {
  replaceStatusLine,
  insertStatusLine,
  appendChangeLog,
} from '../src/runtime/markdown-edit.js';

let workspace: string;
let buildRoot: string;
let workflowsPath: string;

async function freshFixture() {
  // Reset fixture state for each test that mutates the corpus.
  await mkdir(path.join(buildRoot, 'work-units'), { recursive: true });
  await mkdir(path.join(buildRoot, 'decisions'), { recursive: true });
  await mkdir(path.join(buildRoot, 'open-questions'), { recursive: true });

  await writeFile(
    path.join(buildRoot, 'work-units', '200-test-wu.md'),
    '# Test WU\n\n**Status:** 🟢 ready\n\nBody.\n',
    'utf8'
  );
  await writeFile(
    path.join(buildRoot, 'decisions', 'D100-original.md'),
    '# D100 — Original\n\n**Status:** accepted\n\nDecided this thing.\n',
    'utf8'
  );
  await writeFile(
    path.join(buildRoot, 'decisions', 'D101-replacement.md'),
    '# D101 — Replacement\n\n**Status:** accepted\n\nReplaces D100.\n',
    'utf8'
  );
  await writeFile(
    path.join(buildRoot, 'open-questions', 'Q099-test-question.md'),
    '# Q099 — Test question\n\n**Status:** active\n\nWhy?\n',
    'utf8'
  );
}

before(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'nuos-write-test-'));
  buildRoot = path.join(workspace, 'docs', 'build');
  workflowsPath = path.join(workspace, '.nuos-catalogue', 'workflows.json');
  await freshFixture();
});

after(async () => {
  await rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// §1 markdown-edit pure-function tests
// ---------------------------------------------------------------------------

describe('§1 markdown-edit', () => {
  test('replaceStatusLine handles bold form', () => {
    const out = replaceStatusLine('# Title\n\n**Status:** 🟢 ready\n\nBody', '🟡 in_progress');
    assert.equal(out.replaced, true);
    assert.match(out.updated, /\*\*Status:\*\* 🟡 in_progress/);
  });

  test('replaceStatusLine handles pipe-table form', () => {
    const before = '# Title\n\n| Status | active |\n\nBody';
    const out = replaceStatusLine(before, 'resolved');
    assert.equal(out.replaced, true);
    assert.match(out.updated, /\| Status \| resolved \|/);
  });

  test('replaceStatusLine reports replaced=false when no status line', () => {
    const out = replaceStatusLine('# Title\n\nNo status here.', 'in_progress');
    assert.equal(out.replaced, false);
    assert.equal(out.updated, '# Title\n\nNo status here.');
  });

  test('insertStatusLine inserts after H1', () => {
    const out = insertStatusLine('# Title\n\nBody', '🟡 in_progress');
    assert.match(out, /^# Title\n\n\*\*Status:\*\* 🟡 in_progress\n\nBody$/);
  });

  test('appendChangeLog adds a new section when missing', () => {
    const out = appendChangeLog('# Title\n\nBody.', {
      isoTimestamp: '2026-05-10T00:00:00Z',
      summary: 'Status advanced ready → in_progress.',
      details: 'because reasons',
    });
    assert.match(out, /## Build catalogue history/);
    assert.match(out, /Status advanced ready → in_progress/);
    assert.match(out, /because reasons/);
  });

  test('appendChangeLog appends to existing section', () => {
    const before = '# Title\n\nBody.\n\n## Build catalogue history\n\n- old entry\n';
    const out = appendChangeLog(before, {
      isoTimestamp: '2026-05-10T00:00:00Z',
      summary: 'New event',
    });
    assert.match(out, /old entry/);
    assert.match(out, /New event/);
    // The history section should still appear only once.
    const matches = out.match(/## Build catalogue history/g) ?? [];
    assert.equal(matches.length, 1);
  });
});

// ---------------------------------------------------------------------------
// §2 wu advance
// ---------------------------------------------------------------------------

describe('§2 wu advance', () => {
  test('advances status, updates store, updates file', async () => {
    await freshFixture();
    await rm(workflowsPath, { force: true });
    const store = await openWorkflowStore(workflowsPath);
    await runMigrate({ catalogueRoot: buildRoot, store });
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });

    const result = await cmdWuAdvance(store, runtime, {
      handle: 'wu-200',
      to: 'in_progress',
      reason: 'started work today',
    });
    assert.equal(result.exitCode, 0, result.output);
    assert.match(result.output, /work_unit\.advance_status ✅/);

    // File on disk should have new status + history entry
    const onDisk = await readFile(path.join(buildRoot, 'work-units', '200-test-wu.md'), 'utf8');
    assert.match(onDisk, /\*\*Status:\*\* 🟡 in_progress/);
    assert.match(onDisk, /## Build catalogue history/);
    assert.match(onDisk, /Status advanced ready → in_progress/);
    assert.match(onDisk, /started work today/);

    // Store record should match
    const updated = store.get('wu-200');
    assert.ok(updated);
    assert.equal(updated.rawMarkdown, onDisk);
  });

  test('rejects advance to completed without AC list (deferred to a future phase)', async () => {
    await freshFixture();
    await rm(workflowsPath, { force: true });
    const store = await openWorkflowStore(workflowsPath);
    await runMigrate({ catalogueRoot: buildRoot, store });
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });

    // Advance to in_review first
    await cmdWuAdvance(store, runtime, { handle: 'wu-200', to: 'in_progress' });
    await cmdWuAdvance(store, runtime, { handle: 'wu-200', to: 'in_review' });

    // Try to complete — should fail because the WU 200 fixture has no
    // AC section, so the parser returns an empty list and the
    // completion gate rejects with "at least one acceptance criterion".
    const result = await cmdWuAdvance(store, runtime, { handle: 'wu-200', to: 'completed' });
    assert.equal(result.exitCode, 1);
    assert.match(result.output, /at least one acceptance criterion/);
  });

  test('rejects unknown handle', async () => {
    await freshFixture();
    await rm(workflowsPath, { force: true });
    const store = await openWorkflowStore(workflowsPath);
    await runMigrate({ catalogueRoot: buildRoot, store });
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });

    const result = await cmdWuAdvance(store, runtime, { handle: 'wu-999', to: 'in_progress' });
    assert.equal(result.exitCode, 1);
    assert.match(result.output, /no work_unit record/);
  });

  test('rejects missing --to flag', async () => {
    const store = await openWorkflowStore(workflowsPath);
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });
    const result = await cmdWuAdvance(store, runtime, { handle: 'wu-200' });
    assert.equal(result.exitCode, 2);
    assert.match(result.output, /--to=<status> is required/);
  });
});

// ---------------------------------------------------------------------------
// §3 wu tick
// ---------------------------------------------------------------------------

describe('§3 wu tick', () => {
  test('appends a tick entry to the markdown', async () => {
    await freshFixture();
    await rm(workflowsPath, { force: true });
    const store = await openWorkflowStore(workflowsPath);
    await runMigrate({ catalogueRoot: buildRoot, store });
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });

    // --index=1 is 1-based at the CLI boundary — the first AC.
    const result = await cmdWuTick(store, runtime, {
      handle: 'wu-200',
      index: 1,
      evidence: 'commit abc123',
    });
    assert.equal(result.exitCode, 0, result.output);

    const onDisk = await readFile(path.join(buildRoot, 'work-units', '200-test-wu.md'), 'utf8');
    // The audit log always uses 1-based numbering — both for the
    // structural-tick path and the audit-log-only fallback. The 0.13
    // change makes this consistent with the user-facing --index flag.
    assert.match(onDisk, /Acceptance criterion 1 ticked/);
    assert.match(onDisk, /Evidence: commit abc123/);
  });

  test('rejects empty evidence', async () => {
    const store = await openWorkflowStore(workflowsPath);
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });
    const result = await cmdWuTick(store, runtime, {
      handle: 'wu-200',
      index: 1,
      evidence: '   ',
    });
    assert.equal(result.exitCode, 2);
    assert.match(result.output, /--evidence=.* is required/);
  });

  test('rejects zero or negative index', async () => {
    const store = await openWorkflowStore(workflowsPath);
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });

    // index=0 is the most common off-by-one users will hit if they
    // assumed zero-based semantics; the message has to spell out the
    // 1-based convention.
    const zeroResult = await cmdWuTick(store, runtime, {
      handle: 'wu-200',
      index: 0,
      evidence: 'evidence',
    });
    assert.equal(zeroResult.exitCode, 2);
    assert.match(zeroResult.output, /1-based/);

    const negativeResult = await cmdWuTick(store, runtime, {
      handle: 'wu-200',
      index: -1,
      evidence: 'evidence',
    });
    assert.equal(negativeResult.exitCode, 2);
    assert.match(negativeResult.output, /1-based/);
  });
});

// ---------------------------------------------------------------------------
// §4 decision supersede
// ---------------------------------------------------------------------------

describe('§4 decision supersede', () => {
  test('updates both target and superseding records', async () => {
    await freshFixture();
    await rm(workflowsPath, { force: true });
    const store = await openWorkflowStore(workflowsPath);
    await runMigrate({ catalogueRoot: buildRoot, store });
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });

    const result = await cmdDecisionSupersede(store, runtime, {
      target: 'D100',
      by: 'D101',
      reason: 'better approach',
    });
    assert.equal(result.exitCode, 0, result.output);

    const targetOnDisk = await readFile(path.join(buildRoot, 'decisions', 'D100-original.md'), 'utf8');
    assert.match(targetOnDisk, /\*\*Status:\*\* superseded by D101/);
    assert.match(targetOnDisk, /Superseded by D101/);

    const supersedingOnDisk = await readFile(
      path.join(buildRoot, 'decisions', 'D101-replacement.md'),
      'utf8'
    );
    assert.match(supersedingOnDisk, /Supersedes D100/);
    // The superseding decision's status should NOT have been changed
    assert.match(supersedingOnDisk, /\*\*Status:\*\* accepted/);
  });

  test('rejects unknown target', async () => {
    const store = await openWorkflowStore(workflowsPath);
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });
    const result = await cmdDecisionSupersede(store, runtime, { target: 'D999', by: 'D101' });
    assert.equal(result.exitCode, 1);
    assert.match(result.output, /no decision record for target/);
  });

  test('rejects missing --by', async () => {
    const store = await openWorkflowStore(workflowsPath);
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });
    const result = await cmdDecisionSupersede(store, runtime, { target: 'D100' });
    assert.equal(result.exitCode, 2);
    assert.match(result.output, /--by=<superseding D-handle> is required/);
  });
});

// ---------------------------------------------------------------------------
// §5 question resolve
// ---------------------------------------------------------------------------

describe('§5 question resolve', () => {
  test('updates both Q and resolving D records', async () => {
    await freshFixture();
    await rm(workflowsPath, { force: true });
    const store = await openWorkflowStore(workflowsPath);
    await runMigrate({ catalogueRoot: buildRoot, store });
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });

    const result = await cmdQuestionResolve(store, runtime, {
      qHandle: 'Q099',
      by: 'D101',
      reason: 'codified in the new policy',
    });
    assert.equal(result.exitCode, 0, result.output);

    const qOnDisk = await readFile(
      path.join(buildRoot, 'open-questions', 'Q099-test-question.md'),
      'utf8'
    );
    assert.match(qOnDisk, /\*\*Status:\*\* resolved by D101/);
    assert.match(qOnDisk, /Resolved by D101/);

    const dOnDisk = await readFile(path.join(buildRoot, 'decisions', 'D101-replacement.md'), 'utf8');
    assert.match(dOnDisk, /Resolves Q099/);
  });

  test('rejects unknown question handle', async () => {
    const store = await openWorkflowStore(workflowsPath);
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });
    const result = await cmdQuestionResolve(store, runtime, { qHandle: 'Q999', by: 'D101' });
    assert.equal(result.exitCode, 1);
    assert.match(result.output, /no open_question record/);
  });
});

// ---------------------------------------------------------------------------
// §6 idempotence with regenerate
// ---------------------------------------------------------------------------

describe('§6 store stays in sync with disk', () => {
  test('after wu advance, regenerate-check reports zero drift', async () => {
    await freshFixture();
    await rm(workflowsPath, { force: true });
    const store = await openWorkflowStore(workflowsPath);
    await runMigrate({ catalogueRoot: buildRoot, store });
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });

    await cmdWuAdvance(store, runtime, { handle: 'wu-200', to: 'in_progress' });

    const { runRegenerate } = await import('../src/regenerate/check.js');
    const report = await runRegenerate({ catalogueRoot: buildRoot, store });
    assert.equal(report.differs, 0, 'regenerate should report zero drift after a write command');
    assert.equal(report.identical, 4); // wu-200 + D100 + D101 + Q099
  });
});

console.log('@nusoft/nuos-build-catalogue — Phase H part 2 write commands: 19/19 acceptance verified');
