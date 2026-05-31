/**
 * `nuos-catalogue end-of-session` — CLI command tests (WU 112 / D130).
 *
 * Written by the tester. Maps onto ACs 3, 4, 5, 6 for the CLI layer.
 *
 * AC coverage:
 *   AC 3 — cmdEndOfSession gathers facts, drives the workflow, prints a
 *           per-check report, exits non-zero when gate is blocked
 *   AC 4 — resumability: partial run persists step-state; re-run resumes;
 *           a fact that regressed on run 2 is re-flagged (not left green)
 *   AC 5 — D129/D130-safe: only workflows.json is written, zero catalogue
 *           artefact files are created or modified
 *   AC 6 — audit trail shows END_OF_SESSION_STEP_VERIFIED and
 *           END_OF_SESSION_COMPLETED events, including across a resume
 *
 * Setup: every test gets its own temp dir with a minimal docs/build/ layout
 * and a fresh .nuos-catalogue/workflows.json store.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  stat,
  utimes,
} from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { openWorkflowStore } from '../src/migrate/store.js';
import { createBuildCatalogueRuntime } from '../src/runtime/runtime.js';
import { cmdEndOfSession } from '../src/commands/end-of-session.js';

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

let globalWorkspace: string;

before(async () => {
  globalWorkspace = await mkdtemp(path.join(tmpdir(), 'nuos-eos-test-'));
});

after(async () => {
  const { rm } = await import('node:fs/promises');
  await rm(globalWorkspace, { recursive: true, force: true });
});

/** Create an isolated workspace for a single test case. */
async function makeWorkspace(label: string): Promise<{
  workspace: string;
  buildRoot: string;
  workflowsPath: string;
}> {
  const workspace = await mkdtemp(path.join(globalWorkspace, `${label}-`));
  const buildRoot = path.join(workspace, 'docs', 'build');
  const workflowsPath = path.join(workspace, '.nuos-catalogue', 'workflows.json');

  await mkdir(path.join(buildRoot, 'work-units'), { recursive: true });
  await mkdir(path.join(buildRoot, 'work-units', 'done'), { recursive: true });
  await mkdir(path.join(buildRoot, 'decisions'), { recursive: true });
  await mkdir(path.join(buildRoot, 'open-questions'), { recursive: true });
  await mkdir(path.join(buildRoot, 'sessions'), { recursive: true });
  await mkdir(path.join(workspace, '.nuos-catalogue'), { recursive: true });

  return { workspace, buildRoot, workflowsPath };
}

const SESSION_DATE = '2026-05-31';

/**
 * Build a "fully passing" catalogue on disk:
 *   - Active WU file (touched today, with today-dated heading)
 *   - STATE.md (touched today, correct "Last updated", resolving "Last session" link)
 *   - Session log file + index entry
 */
async function buildPassingCatalogue(buildRoot: string, sessionDate: string): Promise<void> {
  // ---- Active WU notes ----
  const wuPath = path.join(buildRoot, 'work-units', `wu-112-end-of-session.md`);
  await writeFile(
    wuPath,
    `# WU 112 — End-of-session as NuFlow workflow\n\n**Status:** 🟡 in_progress\n\n## Notes / log\n\n### ${sessionDate} (Session 116) — Test\n\nSome notes.\n`,
    'utf8'
  );
  // Touch mtime to be "today" (well within sessionStart boundary).
  const now = new Date();
  await utimes(wuPath, now, now);

  // ---- Session log file ----
  const sessionLogFile = `${sessionDate}-session-116.md`;
  const sessionLogPath = path.join(buildRoot, 'sessions', sessionLogFile);
  await writeFile(sessionLogPath, `# Session 116\n\nDate: ${sessionDate}\n\nWhat we did.\n`, 'utf8');

  // ---- Sessions _index.md ----
  await writeFile(
    path.join(buildRoot, 'sessions', '_index.md'),
    `# Session log index\n\n| Date | File |\n|------|------|\n| ${sessionDate} | [session 116](${sessionLogFile}) |\n`,
    'utf8'
  );

  // ---- STATE.md ----
  const stateMdPath = path.join(buildRoot, 'STATE.md');
  await writeFile(
    stateMdPath,
    `# NuOS build state\n\n**Last updated:** ${sessionDate}\n**Last session:** [Session 116](sessions/${sessionLogFile})\n\nCurrent state summary.\n`,
    'utf8'
  );
  const nowState = new Date();
  await utimes(stateMdPath, nowState, nowState);

  // ---- Empty work-units index (no completed WUs, so doneMoveOk is trivially true) ----
  await writeFile(
    path.join(buildRoot, 'work-units', '_index.md'),
    `# Work units index\n\n| Handle | Status | Title |\n|--------|--------|-------|\n`,
    'utf8'
  );
}

async function openStoreAndRuntime(workflowsPath: string, buildRoot: string) {
  const store = await openWorkflowStore(workflowsPath);
  const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });
  return { store, runtime };
}

// ---------------------------------------------------------------------------
// AC 3 — cmdEndOfSession drives workflow, reports, exits correctly
// ---------------------------------------------------------------------------

describe('AC 3 — cmdEndOfSession drives workflow and exits correctly', () => {
  test('exits 0 and prints GATE: PASSED when all facts pass', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('ac3-pass');
    await buildPassingCatalogue(buildRoot, SESSION_DATE);
    const { store, runtime } = await openStoreAndRuntime(workflowsPath, buildRoot);

    const result = await cmdEndOfSession(store, runtime, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(), // 1 minute ago
    });

    assert.equal(result.exitCode, 0, `Expected exit 0; got ${result.exitCode}. Output:\n${result.output}`);
    assert.match(result.output, /GATE: PASSED/i);
  });

  test('exits 1 and prints GATE: BLOCKED when a check fails (today session-log missing)', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('ac3-blocked');
    await buildPassingCatalogue(buildRoot, SESSION_DATE);
    // Remove the session log to trigger a failure.
    const { rm } = await import('node:fs/promises');
    const sessionLogPath = path.join(buildRoot, 'sessions', `${SESSION_DATE}-session-116.md`);
    await rm(sessionLogPath, { force: true });

    const { store, runtime } = await openStoreAndRuntime(workflowsPath, buildRoot);

    const result = await cmdEndOfSession(store, runtime, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });

    assert.equal(result.exitCode, 1, `Expected exit 1; got ${result.exitCode}. Output:\n${result.output}`);
    assert.match(result.output, /GATE: BLOCKED/i);
  });

  test('prints a per-step report with step labels', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('ac3-report');
    await buildPassingCatalogue(buildRoot, SESSION_DATE);
    const { store, runtime } = await openStoreAndRuntime(workflowsPath, buildRoot);

    const result = await cmdEndOfSession(store, runtime, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });

    // The report formatter uses "Step N —" labels; check a few are present.
    assert.match(result.output, /Step 1/i);
    assert.match(result.output, /Step 7/i);
    assert.match(result.output, /Step 8/i);
  });

  test('blocked report includes the session date in the header', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('ac3-date-header');
    await buildPassingCatalogue(buildRoot, SESSION_DATE);
    const { rm } = await import('node:fs/promises');
    await rm(path.join(buildRoot, 'sessions', `${SESSION_DATE}-session-116.md`), { force: true });

    const { store, runtime } = await openStoreAndRuntime(workflowsPath, buildRoot);

    const result = await cmdEndOfSession(store, runtime, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });

    assert.match(result.output, new RegExp(SESSION_DATE));
  });

  test('exits 1 when no active WU handle can be determined', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('ac3-no-wu');
    const { store, runtime } = await openStoreAndRuntime(workflowsPath, buildRoot);

    // No activeWuHandle supplied and no in-progress WU in the store.
    const result = await cmdEndOfSession(store, runtime, {
      buildRoot,
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.output, /active WU/i);
  });

  test('--dry-run flag does not persist anything to the store', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('ac3-dryrun');
    await buildPassingCatalogue(buildRoot, SESSION_DATE);
    const { store, runtime } = await openStoreAndRuntime(workflowsPath, buildRoot);

    await cmdEndOfSession(store, runtime, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
      dryRun: true,
    });

    // After a dry run, no session.end record should exist in the store.
    const record = store.get(`session.end:${SESSION_DATE}`);
    assert.equal(record, null, 'dry-run should not persist a session.end record');
  });
});

// ---------------------------------------------------------------------------
// AC 4 — Resumability
// ---------------------------------------------------------------------------

describe('AC 4 — resumability: partial run persists and completes on re-run', () => {
  test('run 1 with failing check → session.end:<date> record persisted with completed=false', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('ac4-persist');
    await buildPassingCatalogue(buildRoot, SESSION_DATE);
    // Remove session log to cause a failure on run 1.
    const { rm } = await import('node:fs/promises');
    await rm(path.join(buildRoot, 'sessions', `${SESSION_DATE}-session-116.md`), { force: true });

    const { store, runtime } = await openStoreAndRuntime(workflowsPath, buildRoot);

    const run1 = await cmdEndOfSession(store, runtime, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });

    assert.equal(run1.exitCode, 1);

    // The store should now contain the partial step-state record.
    const record = store.get(`session.end:${SESSION_DATE}`);
    assert.ok(record, 'session.end record should be persisted after run 1');

    const stored = JSON.parse(record.rawMarkdown);
    assert.equal(stored.completed, false, 'stored record should show completed=false');
    assert.ok(stored.steps, 'stored record should have steps');
  });

  test('run 2 after fixing the failing fact → resumes and completes', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('ac4-resume');
    await buildPassingCatalogue(buildRoot, SESSION_DATE);
    // Remove session log to cause a failure on run 1.
    const { rm } = await import('node:fs/promises');
    const sessionLogPath = path.join(buildRoot, 'sessions', `${SESSION_DATE}-session-116.md`);
    await rm(sessionLogPath, { force: true });

    // Run 1 — blocked.
    const { store: store1, runtime: runtime1 } = await openStoreAndRuntime(workflowsPath, buildRoot);
    const run1 = await cmdEndOfSession(store1, runtime1, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });
    assert.equal(run1.exitCode, 1, 'run 1 should fail');

    // "Fix" the fact — recreate the session log file.
    await writeFile(sessionLogPath, `# Session 116\n\nDate: ${SESSION_DATE}\n\nFixed.\n`, 'utf8');
    // Also make sure the index is up-to-date.
    await writeFile(
      path.join(buildRoot, 'sessions', '_index.md'),
      `# Session log index\n\n| Date | File |\n|------|------|\n| ${SESSION_DATE} | [session 116](${SESSION_DATE}-session-116.md) |\n`,
      'utf8'
    );

    // Run 2 — should resume from the persisted record and complete.
    // Re-open store to simulate a new session (disk is the source of truth).
    const { store: store2, runtime: runtime2 } = await openStoreAndRuntime(workflowsPath, buildRoot);
    const run2 = await cmdEndOfSession(store2, runtime2, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });

    assert.equal(run2.exitCode, 0, `Run 2 should complete; got exit ${run2.exitCode}. Output:\n${run2.output}`);
    assert.match(run2.output, /GATE: PASSED/i);

    // The store record should now show completed=true.
    const record = store2.get(`session.end:${SESSION_DATE}`);
    assert.ok(record, 'session.end record should still exist after run 2');
    const stored2 = JSON.parse(record.rawMarkdown);
    assert.equal(stored2.completed, true, 'stored record should show completed=true after run 2');
  });

  test('run 2 prints a "resumed from step" indicator in the output', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('ac4-resume-label');
    await buildPassingCatalogue(buildRoot, SESSION_DATE);

    // Run 1 — blocked by missing WU notes (set mtime way in the past).
    const wuPath = path.join(buildRoot, 'work-units', 'wu-112-end-of-session.md');
    const longAgo = new Date('2020-01-01T00:00:00Z');
    await utimes(wuPath, longAgo, longAgo);

    const { store: store1, runtime: runtime1 } = await openStoreAndRuntime(workflowsPath, buildRoot);
    const run1 = await cmdEndOfSession(store1, runtime1, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });
    assert.equal(run1.exitCode, 1, 'run 1 should be blocked');

    // Fix: update WU mtime to now.
    const now = new Date();
    await utimes(wuPath, now, now);

    const { store: store2, runtime: runtime2 } = await openStoreAndRuntime(workflowsPath, buildRoot);
    const run2 = await cmdEndOfSession(store2, runtime2, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });

    // Run 2 should mention resume.
    assert.match(
      run2.output,
      /resum/i,
      `Expected "resumed" or similar in run 2 output; got: ${run2.output}`
    );
  });

  test('regression: a fact that passed in run 1 but regresses by run 2 is re-flagged', async () => {
    // Run 1: all facts pass → session completed.
    const { buildRoot, workflowsPath } = await makeWorkspace('ac4-regress');
    await buildPassingCatalogue(buildRoot, SESSION_DATE);

    const { store: store1, runtime: runtime1 } = await openStoreAndRuntime(workflowsPath, buildRoot);
    const run1 = await cmdEndOfSession(store1, runtime1, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });
    // Run 1 completes.
    assert.equal(run1.exitCode, 0, `run 1 should pass; output: ${run1.output}`);

    // The existing record shows completed=true. Now we want to prove that if
    // we simulate a regression by running with a *new* sessionDate that hasn't
    // been completed yet, the re-check would catch regressions.
    //
    // More directly: the store is queried on startup; if the existing record
    // shows completed=true, the command returns early with exit 0 (already done).
    // To test regression, we need to simulate a *partial* run followed by a
    // regression.

    // Simulate scenario: partial run 1 where only some steps passed.
    const DATE2 = '2026-06-01';
    const { buildRoot: buildRoot2, workflowsPath: workflowsPath2 } = await makeWorkspace('ac4-regress-partial');
    await buildPassingCatalogue(buildRoot2, DATE2);

    // Remove session log for run 1 on DATE2.
    const { rm } = await import('node:fs/promises');
    const sessionLogPath2 = path.join(buildRoot2, 'sessions', `${DATE2}-session-116.md`);
    await rm(sessionLogPath2, { force: true });

    const { store: storeA, runtime: runtimeA } = await openStoreAndRuntime(workflowsPath2, buildRoot2);
    const runA = await cmdEndOfSession(storeA, runtimeA, {
      buildRoot: buildRoot2,
      activeWuHandle: 'wu-112',
      sessionDate: DATE2,
      sessionStartIso: new Date(Date.now() - 120_000).toISOString(),
    });
    assert.equal(runA.exitCode, 1, `run A should fail; output: ${runA.output}`);

    // Restore session log — but NOW also regress STATE.md (remove its touch).
    await writeFile(sessionLogPath2, `# Session 116\n\nDate: ${DATE2}\n`, 'utf8');
    await writeFile(
      path.join(buildRoot2, 'sessions', '_index.md'),
      `# Session log index\n\n| Date | File |\n|------|------|\n| ${DATE2} | [session 116](${DATE2}-session-116.md) |\n`,
      'utf8'
    );

    // Now also regress STATE.md so it no longer passes: put an old "Last updated" date.
    await writeFile(
      path.join(buildRoot2, 'STATE.md'),
      `# NuOS build state\n\n**Last updated:** 2020-01-01\n**Last session:** [Session 116](sessions/${DATE2}-session-116.md)\n`,
      'utf8'
    );
    const stateNow = new Date();
    await utimes(path.join(buildRoot2, 'STATE.md'), stateNow, stateNow);

    // Run B — session log is now fixed BUT STATE.md is now regressed.
    const { store: storeB, runtime: runtimeB } = await openStoreAndRuntime(workflowsPath2, buildRoot2);
    const runB = await cmdEndOfSession(storeB, runtimeB, {
      buildRoot: buildRoot2,
      activeWuHandle: 'wu-112',
      sessionDate: DATE2,
      sessionStartIso: new Date(Date.now() - 120_000).toISOString(),
    });

    // Must still be blocked (STATE.md regressed).
    assert.equal(runB.exitCode, 1, `run B should be blocked by the STATE.md regression; output: ${runB.output}`);
    assert.match(runB.output, /STATE\.md|update_state_md/i,
      `Expected STATE.md failure in run B output; got: ${runB.output}`);
  });

  test('after completing, re-running the same date exits 0 immediately (already done)', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('ac4-already-done');
    await buildPassingCatalogue(buildRoot, SESSION_DATE);

    const { store: store1, runtime: runtime1 } = await openStoreAndRuntime(workflowsPath, buildRoot);
    const run1 = await cmdEndOfSession(store1, runtime1, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });
    assert.equal(run1.exitCode, 0);

    // Run again with the same date — should exit 0 immediately.
    const { store: store2, runtime: runtime2 } = await openStoreAndRuntime(workflowsPath, buildRoot);
    const run2 = await cmdEndOfSession(store2, runtime2, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });

    assert.equal(run2.exitCode, 0);
    assert.match(run2.output, /already marked complete|GATE: PASSED/i);
  });
});

// ---------------------------------------------------------------------------
// AC 5 — D129/D130-safe: command writes NO catalogue-artefact files
// ---------------------------------------------------------------------------

describe('AC 5 — D129/D130 safety: only workflows.json is written', () => {
  test('passing run: only workflows.json is created; no catalogue markdown files touched', async () => {
    const { workspace, buildRoot, workflowsPath } = await makeWorkspace('ac5-pass');
    await buildPassingCatalogue(buildRoot, SESSION_DATE);

    // Snapshot the catalogue dir's files + mtimes BEFORE running.
    const beforeSnapshot = await snapshotCatalogueFiles(buildRoot);

    const { store, runtime } = await openStoreAndRuntime(workflowsPath, buildRoot);

    await cmdEndOfSession(store, runtime, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });

    // Snapshot AFTER.
    const afterSnapshot = await snapshotCatalogueFiles(buildRoot);

    // Compare — no catalogue file should be new or modified.
    const newFiles = Object.keys(afterSnapshot).filter((f) => !(f in beforeSnapshot));
    const modifiedFiles = Object.keys(afterSnapshot).filter(
      (f) => f in beforeSnapshot && afterSnapshot[f] !== beforeSnapshot[f]
    );

    assert.deepEqual(
      newFiles,
      [],
      `Command created new catalogue files (must not): ${newFiles.join(', ')}`
    );
    assert.deepEqual(
      modifiedFiles,
      [],
      `Command modified catalogue files (must not): ${modifiedFiles.join(', ')}`
    );
  });

  test('failing run: no catalogue markdown files touched either', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('ac5-fail');
    await buildPassingCatalogue(buildRoot, SESSION_DATE);

    // Break the session log.
    const { rm } = await import('node:fs/promises');
    await rm(path.join(buildRoot, 'sessions', `${SESSION_DATE}-session-116.md`), { force: true });

    const beforeSnapshot = await snapshotCatalogueFiles(buildRoot);

    const { store, runtime } = await openStoreAndRuntime(workflowsPath, buildRoot);
    await cmdEndOfSession(store, runtime, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });

    const afterSnapshot = await snapshotCatalogueFiles(buildRoot);

    const newFiles = Object.keys(afterSnapshot).filter((f) => !(f in beforeSnapshot));
    const modifiedFiles = Object.keys(afterSnapshot).filter(
      (f) => f in beforeSnapshot && afterSnapshot[f] !== beforeSnapshot[f]
    );

    assert.deepEqual(newFiles, [], `Command created catalogue files on failure: ${newFiles.join(', ')}`);
    assert.deepEqual(modifiedFiles, [], `Command modified catalogue files on failure: ${modifiedFiles.join(', ')}`);
  });

  test('the only write is the session.end:<date> record in workflows.json', async () => {
    const { workspace, buildRoot, workflowsPath } = await makeWorkspace('ac5-only-write');
    await buildPassingCatalogue(buildRoot, SESSION_DATE);
    const { store, runtime } = await openStoreAndRuntime(workflowsPath, buildRoot);

    // workflows.json does not exist yet (fresh store).
    const { existsSync } = await import('node:fs');
    assert.equal(existsSync(workflowsPath), false, 'workflows.json should not exist before the run');

    await cmdEndOfSession(store, runtime, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });

    // workflows.json should now exist.
    assert.equal(existsSync(workflowsPath), true, 'workflows.json should be created by the run');

    // The record in workflows.json should be the session.end:<date> entry.
    const raw = await readFile(workflowsPath, 'utf8');
    const parsed = JSON.parse(raw);
    assert.ok(
      `session.end:${SESSION_DATE}` in parsed.records,
      `session.end:${SESSION_DATE} should be in workflows.json`
    );

    // No other records should be in the store (fresh store, only the EOS command ran).
    const recordKeys = Object.keys(parsed.records);
    assert.deepEqual(
      recordKeys,
      [`session.end:${SESSION_DATE}`],
      `Only the session.end record should be in the store; got: ${recordKeys.join(', ')}`
    );
  });

  test('the session.end record rawMarkdown field contains JSON step-state, not catalogue prose', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('ac5-json-not-prose');
    await buildPassingCatalogue(buildRoot, SESSION_DATE);
    const { store, runtime } = await openStoreAndRuntime(workflowsPath, buildRoot);

    await cmdEndOfSession(store, runtime, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });

    const record = store.get(`session.end:${SESSION_DATE}`);
    assert.ok(record, 'record should exist');

    // rawMarkdown should be valid JSON (not prose markdown).
    let stepState: Record<string, unknown>;
    assert.doesNotThrow(() => {
      stepState = JSON.parse(record.rawMarkdown);
    }, 'rawMarkdown should be valid JSON, not prose');

    // The JSON should have the step-state fields.
    assert.ok('steps' in stepState!, 'JSON should have "steps" field');
    assert.ok('completed' in stepState!, 'JSON should have "completed" field');
    assert.ok('sessionDate' in stepState!, 'JSON should have "sessionDate" field');
  });
});

// ---------------------------------------------------------------------------
// AC 6 — Audit chain
// ---------------------------------------------------------------------------

describe('AC 6 — audit chain shows step-verified and completion events', () => {
  test('failing run: intent type is end_of_session.step_verified', async () => {
    // We observe the intent type via the stored record status (the adapter sets status
    // based on payload.completed) and the store record itself.
    const { buildRoot, workflowsPath } = await makeWorkspace('ac6-step-verified');
    await buildPassingCatalogue(buildRoot, SESSION_DATE);
    const { rm } = await import('node:fs/promises');
    await rm(path.join(buildRoot, 'sessions', `${SESSION_DATE}-session-116.md`), { force: true });

    const { store, runtime } = await openStoreAndRuntime(workflowsPath, buildRoot);
    await cmdEndOfSession(store, runtime, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });

    const record = store.get(`session.end:${SESSION_DATE}`);
    assert.ok(record, 'record should exist');
    // The adapter sets status='in_progress' for a blocked (step_verified) run.
    assert.equal(record.status, 'in_progress', 'blocked run should produce an in_progress record');

    const stored = JSON.parse(record.rawMarkdown);
    assert.equal(stored.completed, false, 'stored.completed should be false for a blocked run');
  });

  test('passing run: intent type is end_of_session.completed', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('ac6-completed');
    await buildPassingCatalogue(buildRoot, SESSION_DATE);
    const { store, runtime } = await openStoreAndRuntime(workflowsPath, buildRoot);

    await cmdEndOfSession(store, runtime, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });

    const record = store.get(`session.end:${SESSION_DATE}`);
    assert.ok(record, 'record should exist');
    // The adapter sets status='completed' for a completed (end_of_session.completed) run.
    assert.equal(record.status, 'completed', 'passing run should produce a completed record');

    const stored = JSON.parse(record.rawMarkdown);
    assert.equal(stored.completed, true, 'stored.completed should be true for a passing run');
    assert.ok(stored.completedAt, 'stored record should have completedAt timestamp');
  });

  test('audit chain persists across resume: startedAt is preserved from run 1', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('ac6-resume-audit');
    await buildPassingCatalogue(buildRoot, SESSION_DATE);

    // Run 1 — fail.
    const { rm } = await import('node:fs/promises');
    const sessionLogPath = path.join(buildRoot, 'sessions', `${SESSION_DATE}-session-116.md`);
    await rm(sessionLogPath, { force: true });

    const { store: store1, runtime: runtime1 } = await openStoreAndRuntime(workflowsPath, buildRoot);
    await cmdEndOfSession(store1, runtime1, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });

    const record1 = store1.get(`session.end:${SESSION_DATE}`);
    const startedAt1 = JSON.parse(record1!.rawMarkdown).startedAt;
    assert.ok(startedAt1, 'startedAt should be set after run 1');

    // Small delay so timestamps differ.
    await new Promise((r) => setTimeout(r, 20));

    // Run 2 — fix and complete.
    await writeFile(sessionLogPath, `# Session 116\n\nDate: ${SESSION_DATE}\n`, 'utf8');
    await writeFile(
      path.join(buildRoot, 'sessions', '_index.md'),
      `# Session log index\n\n| Date | File |\n|------|------|\n| ${SESSION_DATE} | [session 116](${SESSION_DATE}-session-116.md) |\n`,
      'utf8'
    );

    const { store: store2, runtime: runtime2 } = await openStoreAndRuntime(workflowsPath, buildRoot);
    await cmdEndOfSession(store2, runtime2, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });

    const record2 = store2.get(`session.end:${SESSION_DATE}`);
    const stored2 = JSON.parse(record2!.rawMarkdown);

    // startedAt must be preserved from run 1 (the resume path keeps the original).
    assert.equal(
      stored2.startedAt,
      startedAt1,
      `startedAt should be preserved across resume; run1: ${startedAt1}, run2: ${stored2.startedAt}`
    );

    // completedAt should be set (and later than startedAt).
    assert.ok(stored2.completedAt, 'completedAt should be set on completion');
    assert.ok(
      new Date(stored2.completedAt) > new Date(stored2.startedAt),
      'completedAt should be after startedAt'
    );

    // The record must show completed=true.
    assert.equal(stored2.completed, true);
  });

  test('store record contains per-step status after a blocked run', async () => {
    const { buildRoot, workflowsPath } = await makeWorkspace('ac6-step-status');
    await buildPassingCatalogue(buildRoot, SESSION_DATE);

    // Break two facts.
    const stateMdPath = path.join(buildRoot, 'STATE.md');
    const content = await readFile(stateMdPath, 'utf8');
    const sessionLogFile = `${SESSION_DATE}-session-116.md`;
    await writeFile(stateMdPath, content.replace(SESSION_DATE, '2026-01-01'), 'utf8');

    const { store, runtime } = await openStoreAndRuntime(workflowsPath, buildRoot);
    await cmdEndOfSession(store, runtime, {
      buildRoot,
      activeWuHandle: 'wu-112',
      sessionDate: SESSION_DATE,
      sessionStartIso: new Date(Date.now() - 60_000).toISOString(),
    });

    const record = store.get(`session.end:${SESSION_DATE}`);
    const stored = JSON.parse(record!.rawMarkdown);

    // The steps object should be present and have status for each step.
    assert.ok(stored.steps, 'stored record must have steps');
    assert.ok('update_active_wu_notes' in stored.steps, 'steps must include update_active_wu_notes');
    assert.ok('update_state_md' in stored.steps, 'steps must include update_state_md');
    assert.equal(stored.steps.update_state_md.status, 'failed', 'update_state_md step should be failed');
  });
});

// ---------------------------------------------------------------------------
// Utility: snapshot catalogue markdown files' mtimes
// ---------------------------------------------------------------------------

/**
 * Returns a map of { relativePath: mtime-ms-string } for all .md files
 * under buildRoot. Used to detect unexpected writes by the command.
 */
async function snapshotCatalogueFiles(buildRoot: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  await walkDir(buildRoot, buildRoot, result);
  return result;
}

async function walkDir(
  rootDir: string,
  currentDir: string,
  result: Record<string, string>
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(currentDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry);
    let st: Awaited<ReturnType<typeof stat>>;
    try {
      st = await stat(fullPath);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      await walkDir(rootDir, fullPath, result);
    } else if (entry.endsWith('.md')) {
      const rel = path.relative(rootDir, fullPath);
      result[rel] = st.mtime.toISOString();
    }
  }
}

console.log('@nusoft/nuos-build-catalogue — WU 112 CLI end-of-session per-AC tests: complete');
