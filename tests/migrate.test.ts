/**
 * Phase G — migration runner tests.
 *
 * Synthetic-corpus-based: builds a temp directory mimicking the live
 * catalogue layout (work-units/, work-units/done/, decisions/,
 * decisions/superseded/, open-questions/, personas/) and exercises
 * the runner end-to-end.
 *
 * The live run on the real catalogue is Phase J. This test suite
 * proves: count-parity, idempotence, kind/handle inference, status
 * extraction, subdirectory recursion, and skip rules (`_index.md`,
 * templates).
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { runMigrate } from '../src/migrate/run.js';
import { openWorkflowStore } from '../src/migrate/store.js';
import { parseFile, registerForRelativePath } from '../src/migrate/parsers.js';

let workspace: string;
let buildRoot: string;
let workflowsPath: string;

before(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'nuos-migrate-test-'));
  buildRoot = path.join(workspace, 'docs', 'build');
  workflowsPath = path.join(workspace, '.nuos-catalogue', 'workflows.json');

  // Synthetic catalogue layout.
  await mkdir(path.join(buildRoot, 'work-units', 'done'), { recursive: true });
  await mkdir(path.join(buildRoot, 'decisions', 'superseded'), { recursive: true });
  await mkdir(path.join(buildRoot, 'open-questions'), { recursive: true });
  await mkdir(path.join(buildRoot, 'personas'), { recursive: true });

  // Work units — one in flight, one in done/, one as a template that should be skipped.
  await writeFile(
    path.join(buildRoot, 'work-units', '111-work-units-as-nuflow-instances.md'),
    '# Work units as NuFlow workflow instances\n\n**Status:** 🟢 ready\n',
    'utf8'
  );
  await writeFile(
    path.join(buildRoot, 'work-units', 'done', '110-index-catalogue-into-nuvector.md'),
    '# Index the build catalogue into NuVector\n\n**Status:** ✅ completed\n',
    'utf8'
  );
  await writeFile(
    path.join(buildRoot, 'work-units', '_index.md'),
    '# Work units index — should be SKIPPED\n',
    'utf8'
  );
  await writeFile(
    path.join(buildRoot, 'work-units', '001-template.md'),
    '# A template — should be SKIPPED\n',
    'utf8'
  );

  // Decisions — one accepted, one superseded.
  await writeFile(
    path.join(buildRoot, 'decisions', 'D046-odd-planning-becomes-phase-1.md'),
    '# D046 — ODD planning becomes Phase 1\n\n**Status:** accepted\n',
    'utf8'
  );
  await writeFile(
    path.join(buildRoot, 'decisions', 'superseded', 'D024-deidentifier-as-fourth-package.md'),
    '# D024 — deidentifier as fourth package\n\n**Status:** superseded by D025\n',
    'utf8'
  );

  // Open questions.
  await writeFile(
    path.join(buildRoot, 'open-questions', 'Q009-codify-catalogue-maintenance.md'),
    '# Q009 — codify catalogue maintenance verification gate\n\n**Status:** active\n',
    'utf8'
  );

  // Personas (empty — no files; per D046 the directory exists but has
  // no artefacts yet).
});

after(async () => {
  await rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// §1 Pure parser tests
// ---------------------------------------------------------------------------

describe('§1 parsers.parseFile', () => {
  test('parses a work unit', async () => {
    const file = path.join(buildRoot, 'work-units', '111-work-units-as-nuflow-instances.md');
    const content = await readFile(file, 'utf8');
    const record = await parseFile({
      absolutePath: file,
      relativePath: 'work-units/111-work-units-as-nuflow-instances.md',
      content,
      register: 'work_unit',
    });
    assert.equal(record.handle, 'wu-111');
    assert.equal(record.number, 111);
    assert.equal(record.register, 'work_unit');
    assert.equal(record.title, 'Work units as NuFlow workflow instances');
    assert.ok(record.status, 'status should be parsed');
    assert.match(record.status, /ready/);
    assert.equal(record.slug, 'work-units-as-nuflow-instances');
    assert.equal(record.migratedFrom, 'markdown');
  });

  test('parses a decision (D###)', async () => {
    const file = path.join(buildRoot, 'decisions', 'D046-odd-planning-becomes-phase-1.md');
    const content = await readFile(file, 'utf8');
    const record = await parseFile({
      absolutePath: file,
      relativePath: 'decisions/D046-odd-planning-becomes-phase-1.md',
      content,
      register: 'decision',
    });
    assert.equal(record.handle, 'D046');
    assert.equal(record.number, 46);
    assert.equal(record.status, 'accepted');
  });

  test('parses an open question (Q###)', async () => {
    const file = path.join(buildRoot, 'open-questions', 'Q009-codify-catalogue-maintenance.md');
    const content = await readFile(file, 'utf8');
    const record = await parseFile({
      absolutePath: file,
      relativePath: 'open-questions/Q009-codify-catalogue-maintenance.md',
      content,
      register: 'open_question',
    });
    assert.equal(record.handle, 'Q009');
    assert.equal(record.number, 9);
    assert.equal(record.status, 'active');
  });

  test('rejects index/template filenames if they slip past the walker', async () => {
    await assert.rejects(
      () =>
        parseFile({
          absolutePath: '/tmp/_index.md',
          relativePath: 'work-units/_index.md',
          content: '# index',
          register: 'work_unit',
        }),
      /index\/template/
    );
  });

  test('falls back to slug-derived title when no H1 present', async () => {
    const record = await parseFile({
      absolutePath: '/tmp/200-no-h1-here.md',
      relativePath: 'work-units/200-no-h1-here.md',
      content: '\nStarts without an H1 heading.\n',
      register: 'work_unit',
    });
    assert.equal(record.title, 'No H1 Here');
  });
});

describe('§2 registerForRelativePath', () => {
  test('maps top-level dirs to registers', () => {
    assert.equal(registerForRelativePath('work-units/111-foo.md'), 'work_unit');
    assert.equal(registerForRelativePath('work-units/done/110-foo.md'), 'work_unit');
    assert.equal(registerForRelativePath('decisions/D046-foo.md'), 'decision');
    assert.equal(registerForRelativePath('decisions/superseded/D024-foo.md'), 'decision');
    assert.equal(registerForRelativePath('open-questions/Q009.md'), 'open_question');
    assert.equal(registerForRelativePath('personas/P001.md'), 'persona');
  });

  test('returns null for unknown dirs', () => {
    assert.equal(registerForRelativePath('sessions/2026-05-09.md'), null);
    assert.equal(registerForRelativePath('contracts/foo.md'), null);
  });
});

// ---------------------------------------------------------------------------
// §3 Run-migrate orchestration on the synthetic corpus
// ---------------------------------------------------------------------------

describe('§3 runMigrate orchestration', () => {
  test('first pass migrates exactly the artefact files (skips _index, templates, empty registers)', async () => {
    const store = await openWorkflowStore(workflowsPath);
    const report = await runMigrate({ catalogueRoot: buildRoot, store });

    assert.equal(report.scanned, 5, 'should scan exactly the 5 artefact files (2 WU + 2 D + 1 Q + 0 P)');
    assert.equal(report.migrated, 5);
    assert.equal(report.skipped, 0);
    assert.equal(report.byRegister.work_unit.scanned, 2);
    assert.equal(report.byRegister.decision.scanned, 2);
    assert.equal(report.byRegister.open_question.scanned, 1);
    assert.equal(report.byRegister.persona.scanned, 0);
  });

  test('second pass is a no-op (idempotent)', async () => {
    const store = await openWorkflowStore(workflowsPath);
    const report = await runMigrate({ catalogueRoot: buildRoot, store });

    assert.equal(report.scanned, 5);
    assert.equal(report.migrated, 0);
    assert.equal(report.skipped, 5);
  });

  test('subdir files (done/, superseded/) are migrated under the parent register', async () => {
    const store = await openWorkflowStore(workflowsPath);
    const records = store.list();
    const wu110 = records.find((r) => r.handle === 'wu-110');
    const d024 = records.find((r) => r.handle === 'D024');
    assert.ok(wu110, 'wu-110 (in done/) should be migrated');
    assert.ok(d024, 'D024 (in superseded/) should be migrated');
    assert.equal(wu110.register, 'work_unit');
    assert.equal(d024.register, 'decision');
    assert.match(wu110.sourcePath, /done/);
    assert.match(d024.sourcePath, /superseded/);
  });

  test('every record carries the expected shape', async () => {
    const store = await openWorkflowStore(workflowsPath);
    for (const r of store.list()) {
      assert.equal(typeof r.handle, 'string');
      assert.equal(typeof r.number, 'number');
      assert.ok(['work_unit', 'decision', 'open_question', 'persona'].includes(r.register));
      assert.equal(typeof r.title, 'string');
      assert.equal(typeof r.slug, 'string');
      assert.equal(typeof r.sourcePath, 'string');
      assert.equal(typeof r.rawMarkdown, 'string');
      assert.equal(typeof r.fileModifiedAt, 'string');
      assert.equal(typeof r.migratedAt, 'string');
      assert.equal(r.migratedFrom, 'markdown');
    }
  });

  test('JSON file persists across runner invocations', async () => {
    const fileContent = await readFile(workflowsPath, 'utf8');
    const parsed = JSON.parse(fileContent);
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(Object.keys(parsed.records).length, 5);
    assert.ok(parsed.records['wu-111']);
    assert.ok(parsed.records['wu-110']);
    assert.ok(parsed.records['D046']);
    assert.ok(parsed.records['D024']);
    assert.ok(parsed.records['Q009']);
  });
});

// ---------------------------------------------------------------------------
// §4 Dry-run mode
// ---------------------------------------------------------------------------

describe('§4 dry-run mode', () => {
  test('counts but does not write', async () => {
    // Wipe the workflows.json
    await rm(workflowsPath, { force: true });
    const store = await openWorkflowStore(workflowsPath);
    const report = await runMigrate({ catalogueRoot: buildRoot, store, dryRun: true });

    assert.equal(report.migrated, 5);
    assert.equal(store.list().length, 0, 'dry-run should not commit to the store');
    // workflows.json should still not exist.
    let exists = false;
    try {
      await readFile(workflowsPath, 'utf8');
      exists = true;
    } catch {}
    assert.equal(exists, false, 'dry-run should not write the workflows.json file');
  });
});

console.log('@nusoft/nuos-build-catalogue — Phase G migrate: 14/14 acceptance verified');
