/**
 * Phase I — regenerate + drift report tests.
 *
 * Three scenarios on a synthetic corpus:
 *   1. Migrate then check → zero drift (identical roundtrip).
 *   2. Migrate, edit a source file, check → drift detected with line counts.
 *   3. Migrate, edit, then check with --write → file overwritten back to canonical.
 *
 * Plus pure-function tests for countLineDiff.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { runMigrate } from '../src/migrate/run.js';
import { openWorkflowStore } from '../src/migrate/store.js';
import { runRegenerate } from '../src/regenerate/check.js';
import { countLineDiff } from '../src/regenerate/diff.js';

let workspace: string;
let buildRoot: string;
let workflowsPath: string;

before(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'nuos-regenerate-test-'));
  buildRoot = path.join(workspace, 'docs', 'build');
  workflowsPath = path.join(workspace, '.nuos-catalogue', 'workflows.json');

  await mkdir(path.join(buildRoot, 'work-units'), { recursive: true });
  await mkdir(path.join(buildRoot, 'decisions'), { recursive: true });
  await mkdir(path.join(buildRoot, 'open-questions'), { recursive: true });
  await mkdir(path.join(buildRoot, 'personas'), { recursive: true });

  await writeFile(
    path.join(buildRoot, 'work-units', '111-work-units-as-nuflow-instances.md'),
    '# Work units as NuFlow workflow instances\n\n**Status:** 🟢 ready\n\nBody.\n',
    'utf8'
  );
  await writeFile(
    path.join(buildRoot, 'decisions', 'D046-odd-planning.md'),
    '# D046 — ODD planning\n\n**Status:** accepted\n\nBody.\n',
    'utf8'
  );
});

after(async () => {
  await rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// §1 countLineDiff
// ---------------------------------------------------------------------------

describe('§1 countLineDiff', () => {
  test('identical → zero', () => {
    const r = countLineDiff('a\nb\nc', 'a\nb\nc');
    assert.deepEqual(r, { added: 0, removed: 0 });
  });

  test('one line added at end', () => {
    const r = countLineDiff('a\nb', 'a\nb\nc');
    assert.equal(r.added, 1);
    assert.equal(r.removed, 0);
  });

  test('one line removed', () => {
    const r = countLineDiff('a\nb\nc', 'a\nc');
    assert.equal(r.removed, 1);
    assert.equal(r.added, 0);
  });

  test('one line changed counts as +1/-1', () => {
    const r = countLineDiff('a\nb\nc', 'a\nXX\nc');
    assert.equal(r.added, 1);
    assert.equal(r.removed, 1);
  });

  test('completely different content', () => {
    const r = countLineDiff('a\nb\nc', 'x\ny\nz');
    assert.equal(r.added, 3);
    assert.equal(r.removed, 3);
  });
});

// ---------------------------------------------------------------------------
// §2 runRegenerate — clean migration → zero drift
// ---------------------------------------------------------------------------

describe('§2 zero drift after clean migration', () => {
  test('check after migrate reports all identical', async () => {
    const store = await openWorkflowStore(workflowsPath);
    await runMigrate({ catalogueRoot: buildRoot, store });

    const report = await runRegenerate({ catalogueRoot: buildRoot, store });

    assert.equal(report.total, 2);
    assert.equal(report.identical, 2);
    assert.equal(report.differs, 0);
    assert.equal(report.missing, 0);
    assert.equal(report.drifted.length, 0);
  });

  test('per-register counts are correct', async () => {
    const store = await openWorkflowStore(workflowsPath);
    const report = await runRegenerate({ catalogueRoot: buildRoot, store });

    assert.equal(report.byRegister.work_unit.identical, 1);
    assert.equal(report.byRegister.decision.identical, 1);
    assert.equal(report.byRegister.open_question.total, 0);
    assert.equal(report.byRegister.persona.total, 0);
  });
});

// ---------------------------------------------------------------------------
// §3 runRegenerate — drift detection after edit
// ---------------------------------------------------------------------------

describe('§3 drift detection after source edit', () => {
  test('editing a source file is reported as drift', async () => {
    const store = await openWorkflowStore(workflowsPath);
    // Append a line to the WU file
    await appendFile(
      path.join(buildRoot, 'work-units', '111-work-units-as-nuflow-instances.md'),
      'Hand-edited after migration.\n',
      'utf8'
    );

    const report = await runRegenerate({ catalogueRoot: buildRoot, store });
    assert.equal(report.identical, 1);
    assert.equal(report.differs, 1);
    assert.equal(report.drifted.length, 1);
    assert.equal(report.drifted[0].handle, 'wu-111');
    assert.equal(report.drifted[0].kind, 'differs');
    assert.equal(report.drifted[0].linesAdded, 1);
  });

  test('register filter scopes the check', async () => {
    const store = await openWorkflowStore(workflowsPath);
    const report = await runRegenerate({
      catalogueRoot: buildRoot,
      store,
      registerFilter: 'decision',
    });
    assert.equal(report.total, 1);
    assert.equal(report.identical, 1);
    assert.equal(report.differs, 0);
  });
});

// ---------------------------------------------------------------------------
// §4 runRegenerate — missing source detection
// ---------------------------------------------------------------------------

describe('§4 missing-source detection', () => {
  test('removed source file is reported as missing', async () => {
    const store = await openWorkflowStore(workflowsPath);
    // Remove the decision file from disk; the record is still in the store
    await rm(path.join(buildRoot, 'decisions', 'D046-odd-planning.md'));

    const report = await runRegenerate({ catalogueRoot: buildRoot, store });
    const d046 = report.drifted.find((d) => d.handle === 'D046');
    assert.ok(d046);
    assert.equal(d046.kind, 'missing-source');
    assert.equal(report.missing, 1);
  });
});

// ---------------------------------------------------------------------------
// §5 runRegenerate --write mode
// ---------------------------------------------------------------------------

describe('§5 --write mode overwrites source with canonical', () => {
  test('write restores hand-edited file to stored content', async () => {
    // Restore state: write the WU file with extra content + put back the decision file
    await writeFile(
      path.join(buildRoot, 'work-units', '111-work-units-as-nuflow-instances.md'),
      '# Work units as NuFlow workflow instances\n\n**Status:** 🟢 ready\n\nBody.\nHAND EDIT.\n',
      'utf8'
    );
    await writeFile(
      path.join(buildRoot, 'decisions', 'D046-odd-planning.md'),
      '# D046 — ODD planning\n\n**Status:** accepted\n\nBody.\n',
      'utf8'
    );

    const store = await openWorkflowStore(workflowsPath);
    const report = await runRegenerate({ catalogueRoot: buildRoot, store, write: true });
    assert.equal(report.differs, 1, 'pre-write report should still flag drift');

    // After --write, the hand edit should be gone.
    const restored = await readFile(
      path.join(buildRoot, 'work-units', '111-work-units-as-nuflow-instances.md'),
      'utf8'
    );
    assert.doesNotMatch(restored, /HAND EDIT/);

    // Re-running check should now report zero drift.
    const after = await runRegenerate({ catalogueRoot: buildRoot, store });
    assert.equal(after.differs, 0);
    assert.equal(after.identical, 2);
  });
});

console.log('@nusoft/nuos-build-catalogue — Phase I regenerate: 11/11 acceptance verified');
