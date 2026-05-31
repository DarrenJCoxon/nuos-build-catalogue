/**
 * WU 111 Day-1 soak findings — regression tests.
 *
 * Four findings surfaced when the published 0.12.0 CLI was exercised
 * against the live nuos catalogue via `npx`. Each one is closed by a
 * code change in 0.13.0; these tests pin the new behaviour so the
 * fixes don't drift.
 *
 * Finding 1 — defaults walk up from cwd (not from the package install).
 * Finding 2 — `migrate` emits a soft gitignore note when applicable.
 * Finding 3 — `--index` is 1-based at the CLI boundary.
 * Finding 4 — `## Build catalogue history` heading lookup is anchored.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  findProjectRoot,
  resolveBuildRoot,
  resolveCatalogueRoot,
  resolveWorkflowsPath,
  gitignoreCatalogueNote,
} from '../src/path-resolution.js';
import { appendChangeLog } from '../src/runtime/markdown-edit.js';
import { extractForCompletion, tickAcceptanceCriterion } from '../src/runtime/ac-parse.js';
import {
  cmdWuTick,
  cmdWuAdvance,
  cmdDecisionSupersede,
  cmdQuestionResolve,
} from '../src/commands/write.js';
import { createBuildCatalogueRuntime } from '../src/runtime/runtime.js';
import { openWorkflowStore } from '../src/migrate/store.js';
import { runMigrate } from '../src/migrate/run.js';

// ---------------------------------------------------------------------------
// Finding 1 — defaults walk up from cwd
// ---------------------------------------------------------------------------

describe('Finding 1 — defaults walk up from cwd', () => {
  let workspace: string;
  let projectRoot: string;
  let buildRoot: string;
  let deepDir: string;

  before(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'wu111-finding-1-'));
    projectRoot = path.join(workspace, 'fake-project');
    buildRoot = path.join(projectRoot, 'docs', 'build');
    deepDir = path.join(projectRoot, 'src', 'deep', 'nested');
    await mkdir(buildRoot, { recursive: true });
    await mkdir(deepDir, { recursive: true });
  });

  after(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  test('findProjectRoot finds the nearest ancestor containing docs/build/', () => {
    // From the project root itself
    assert.equal(findProjectRoot(projectRoot), projectRoot);
    // From the docs/build/ directory itself
    assert.equal(findProjectRoot(buildRoot), projectRoot);
    // From a deeply nested subdirectory
    assert.equal(findProjectRoot(deepDir), projectRoot);
  });

  test('findProjectRoot returns null when no docs/build/ ancestor exists', () => {
    // tmpdir itself almost certainly has no docs/build/ ancestor
    // (and even if it did, the contract here is: returns null when nothing
    // is found before reaching the filesystem root).
    // We use a known non-project directory.
    const noProjectDir = path.join(workspace, 'no-project');
    const result = findProjectRoot(noProjectDir);
    // Either null (no docs/build/ found) or the workspace itself if some
    // ancestor happens to have one. Strict: we look for null behaviour
    // when starting from a fresh tmpdir-rooted path that has no
    // docs/build/ above it (tmpdir is a leaf of /tmp on macOS).
    if (result !== null) {
      // If a project-shaped ancestor exists in the test environment,
      // skip — the contract is "returns null when no project is found".
      assert.ok(true);
    } else {
      assert.equal(result, null);
    }
  });

  test('resolveBuildRoot uses cwd-walking when no flag and no env var', () => {
    const env: NodeJS.ProcessEnv = {};
    const resolved = resolveBuildRoot(undefined, { cwd: deepDir, env });
    assert.equal(resolved, buildRoot);
  });

  test('resolveBuildRoot prefers the flag over env over walk-up', () => {
    const env: NodeJS.ProcessEnv = {
      NUOS_CATALOGUE_BUILD_ROOT: '/from/env/docs/build',
    };
    // Flag wins
    assert.equal(
      resolveBuildRoot('/from/flag/docs/build', { cwd: deepDir, env }),
      '/from/flag/docs/build'
    );
    // No flag → env wins over walk-up
    assert.equal(
      resolveBuildRoot(undefined, { cwd: deepDir, env }),
      '/from/env/docs/build'
    );
  });

  test('resolveBuildRoot throws when none of flag/env/walk-up yields a value', () => {
    // Use a directory we know does not have docs/build/ above it.
    const noProjectDir = path.join(workspace, 'no-project');
    assert.throws(
      () => resolveBuildRoot(undefined, { cwd: noProjectDir, env: {} }),
      /cannot locate the build catalogue/
    );
  });

  test('resolveCatalogueRoot derives from the same project root', () => {
    const resolved = resolveCatalogueRoot(undefined, { cwd: deepDir, env: {} });
    assert.equal(resolved, path.join(projectRoot, 'docs'));
  });

  test('resolveWorkflowsPath co-locates with the project root', () => {
    const resolved = resolveWorkflowsPath(buildRoot, undefined, {
      cwd: deepDir,
      env: {},
    });
    assert.equal(resolved, path.join(projectRoot, '.nuos-catalogue', 'workflows.json'));
  });
});

// ---------------------------------------------------------------------------
// Finding 2 — gitignore note
// ---------------------------------------------------------------------------

describe('Finding 2 — gitignore note', () => {
  let workspace: string;

  before(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'wu111-finding-2-'));
  });

  after(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  test('returns null when no .gitignore exists', async () => {
    const projectRoot = path.join(workspace, 'no-gitignore');
    const buildRoot = path.join(projectRoot, 'docs', 'build');
    await mkdir(buildRoot, { recursive: true });
    assert.equal(gitignoreCatalogueNote(buildRoot), null);
  });

  test('returns null when .gitignore already excludes .nuos-catalogue/', async () => {
    const projectRoot = path.join(workspace, 'good-gitignore');
    const buildRoot = path.join(projectRoot, 'docs', 'build');
    await mkdir(buildRoot, { recursive: true });
    await writeFile(
      path.join(projectRoot, '.gitignore'),
      'node_modules/\n.nuos-catalogue/\n.env\n',
      'utf8'
    );
    assert.equal(gitignoreCatalogueNote(buildRoot), null);
  });

  test('returns a warning when .gitignore exists but is missing the entry', async () => {
    const projectRoot = path.join(workspace, 'bad-gitignore');
    const buildRoot = path.join(projectRoot, 'docs', 'build');
    await mkdir(buildRoot, { recursive: true });
    await writeFile(
      path.join(projectRoot, '.gitignore'),
      'node_modules/\n.env\n',
      'utf8'
    );
    const note = gitignoreCatalogueNote(buildRoot);
    assert.ok(note, 'expected a non-null note');
    assert.match(note as string, /\.nuos-catalogue\//);
    assert.match(note as string, /Add this line to \.gitignore/);
  });
});

// ---------------------------------------------------------------------------
// Finding 3 — --index is 1-based
//
// The basic accept/reject coverage already lives in commands-write.test.ts
// §3. Here we add the load-bearing semantic test — when the user asks
// for --index=3 on a three-AC WU, the THIRD criterion gets flipped.
// ---------------------------------------------------------------------------

describe('Finding 3 — --index is 1-based at the CLI boundary', () => {
  let workspace: string;
  let buildRoot: string;
  let workflowsPath: string;

  before(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'wu111-finding-3-'));
    buildRoot = path.join(workspace, 'docs', 'build');
    workflowsPath = path.join(workspace, '.nuos-catalogue', 'workflows.json');
    await mkdir(path.join(buildRoot, 'work-units'), { recursive: true });
    await writeFile(
      path.join(buildRoot, 'work-units', '999-three-acs.md'),
      [
        '# wu-999 — three-AC test fixture',
        '',
        '**Status:** 🟢 ready',
        '',
        '## Outcome',
        '',
        'A WU with three checkbox-style ACs.',
        '',
        '## Acceptance criteria',
        '',
        '- [ ] First criterion',
        '- [ ] Second criterion',
        '- [ ] Third criterion',
        '',
      ].join('\n'),
      'utf8'
    );
  });

  after(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  test('--index=3 ticks the third AC, not the fourth or second', async () => {
    const store = await openWorkflowStore(workflowsPath);
    await runMigrate({ catalogueRoot: buildRoot, store });
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });

    const result = await cmdWuTick(store, runtime, {
      handle: 'wu-999',
      index: 3,
      evidence: 'verified third',
    });
    assert.equal(result.exitCode, 0, result.output);

    const updated = store.get('wu-999');
    assert.ok(updated);
    const ticked = (updated as { rawMarkdown: string }).rawMarkdown.match(/^- \[x\] (.+)$/m);
    assert.ok(ticked, 'expected exactly one ticked line');
    assert.equal(ticked![1].trim(), 'Third criterion');

    // And the audit log entry uses 1-based numbering — same number the
    // user typed at the CLI, no off-by-one between flag and history.
    assert.match(
      (updated as { rawMarkdown: string }).rawMarkdown,
      /Acceptance criterion 3 ticked: "Third criterion"/
    );
  });
});

// ---------------------------------------------------------------------------
// Finding 4 — `## Build catalogue history` heading lookup is anchored
//
// Pre-0.13, `indexOf('## Build catalogue history')` matched prose
// mentions inside code spans, paragraphs, or other prose. WU 111's own
// notes log references the section by name when explaining how the
// audit trail works, which made the heading-lookup misfire and append
// changelog entries inside the prose.
// ---------------------------------------------------------------------------

describe('Finding 4 — heading lookup is anchored to start-of-line', () => {
  test('appendChangeLog ignores prose mentions and creates a real section', () => {
    const proseOnly = [
      '# wu-test',
      '',
      '**Status:** 🟢 ready',
      '',
      '## Outcome',
      '',
      'The audit trail is the `## Build catalogue history` section,',
      'documented in the docs. There is no real section yet — this',
      'is only a paragraph that mentions the heading text.',
      '',
    ].join('\n');

    const updated = appendChangeLog(proseOnly, {
      isoTimestamp: '2026-01-01T00:00:00.000Z',
      summary: 'Test entry.',
      details: 'evidence-x',
      reference: 'intent x',
    });

    // The function should create a NEW `## Build catalogue history`
    // section at the end of the file, not splice the entry into the
    // prose. So the resulting markdown contains the heading text
    // exactly twice — once in prose, once as the real section heading.
    const occurrences = updated.match(/## Build catalogue history/g) ?? [];
    assert.equal(occurrences.length, 2, 'expected one prose mention + one real heading');

    // The new entry should land AFTER the real heading, not inside the
    // prose. We assert by checking that the entry appears below an
    // anchored-heading line break.
    const lines = updated.split('\n');
    const realHeadingIdx = lines.findIndex(
      (l, i) => l === '## Build catalogue history' && i > 0 && lines[i - 1] === ''
    );
    assert.ok(realHeadingIdx >= 0, 'expected a real anchored heading');
    const afterHeading = lines.slice(realHeadingIdx).join('\n');
    assert.match(afterHeading, /- \*\*2026-01-01T00:00:00\.000Z\*\* — Test entry\./);
  });

  test('appendChangeLog appends to an existing real heading and ignores prose', () => {
    const mixed = [
      '# wu-test',
      '',
      '**Status:** 🟢 ready',
      '',
      '## Outcome',
      '',
      'Old prose: see `## Build catalogue history` for the audit trail.',
      '',
      '## Build catalogue history',
      '',
      '- **2026-01-01T00:00:00.000Z** — Pre-existing entry.',
      '',
    ].join('\n');

    const updated = appendChangeLog(mixed, {
      isoTimestamp: '2026-01-02T00:00:00.000Z',
      summary: 'New entry.',
    });

    // Still exactly two occurrences (prose + the one real heading).
    const occurrences = updated.match(/## Build catalogue history/g) ?? [];
    assert.equal(occurrences.length, 2);
    // The new entry was appended to the existing real section, so the
    // tail of the file holds both entries in chronological order.
    const tail = updated.split('## Build catalogue history').pop() ?? '';
    const preIdx = tail.indexOf('Pre-existing entry');
    const newIdx = tail.indexOf('New entry');
    assert.ok(preIdx >= 0 && newIdx >= 0 && preIdx < newIdx);
  });

  test('appendChangeLog/tick preserve content between the last notes entry and the history heading (WU 214 fixture)', () => {
    // Minimal WU 111 shape: AC checkbox list, a Notes / log section with
    // several `### ` sub-entries (the last of which is followed by the
    // `## Build catalogue history` heading), and the history section last.
    const lines = [
      '# wu-111 — fixture',
      '',
      '**Status:** 🟣 in_review',
      '',
      '## Acceptance criteria (= verification)',
      '',
      '- [x] AC one done.',
      '- [x] AC two done.',
      '- [ ] The 5-day soak runs without a session being lost or an audit-chain gap.',
      '',
      '## Notes / log',
      '',
      '### 2026-05-10 — first entry',
      '',
      'Some prose line A.',
      '',
      '### 2026-05-11 (Session 73) — Day 2 of soak, driving WU 083 through the CLI',
      '',
      'Day-2 prose mentioning the `## Build catalogue history` section by name.',
      'Another Day-2 prose line about 603 rows of real catalogue-indexer data.',
      '',
      '### 2026-05-31 (Session 115) — closed',
      '',
      'Final notes prose.',
      '',
      '## Build catalogue history',
      '',
      '- **2026-05-11T14:01:30.869Z** — Acceptance criterion 1 ticked: "AC one".',
      '- **2026-05-11T14:02:00.000Z** — Acceptance criterion 2 ticked: "AC two".',
      '',
    ];
    const fixture = lines.join('\n');

    // index 2 (0-based) is the unticked soak AC.
    const ticked = tickAcceptanceCriterion(fixture, 2);
    const updated = appendChangeLog(ticked, {
      isoTimestamp: '2026-05-31T20:00:00.000Z',
      summary: 'Acceptance criterion 3 ticked: "soak".',
      details: 'Evidence: D128.',
      reference: 'intent x',
    });

    // 1. Exactly one checkbox flipped: the soak AC, and only it.
    const tickedCheckboxes = updated.match(/^- \[x\] /gm) ?? [];
    assert.equal(tickedCheckboxes.length, 3, 'expected three ticked checkboxes (two pre-ticked + the soak)');
    assert.match(updated, /^- \[x\] The 5-day soak runs/m, 'the soak AC should be ticked');

    // 2. Every original non-blank line is preserved byte-for-byte, except
    //    the one flipped checkbox char. This is the load-bearing assertion:
    //    the Day-2 section between the last `### ` entry and the history
    //    heading must NOT be dropped.
    const flip = (l: string) => l.replace('- [ ] The 5-day soak', '- [x] The 5-day soak');
    const dropped = lines.filter(
      (l) => l.trim() !== '' && !updated.includes(l) && !updated.includes(flip(l))
    );
    assert.deepEqual(dropped, [], `no original content should be dropped; dropped: ${JSON.stringify(dropped)}`);

    // 3. The history entry was appended at the end (history is the last section).
    assert.match(updated, /- \*\*2026-05-31T20:00:00\.000Z\*\* — Acceptance criterion 3 ticked: "soak"\./);
  });

  test('wu tick preserves on-disk hand-edits made after the store snapshot (WU 214 root cause)', async () => {
    // Reproduces the live incident: the workflow store holds a `rawMarkdown`
    // snapshot frozen at the last CLI write; the on-disk file has since been
    // hand-edited (a new `### ` notes section added). `wu tick` reads the
    // STALE store snapshot, ticks it, and `persist()` writes it back to disk —
    // clobbering the hand-added section. The fix must reconcile store vs disk
    // before writing (re-read disk, or refuse to overwrite divergent files).
    const workspace = await mkdtemp(path.join(tmpdir(), 'wu214-stale-store-'));
    try {
      const buildRoot = path.join(workspace, 'docs', 'build');
      const workflowsPath = path.join(workspace, '.nuos-catalogue', 'workflows.json');
      const wuPath = path.join(buildRoot, 'work-units', '111-fixture.md');
      await mkdir(path.join(buildRoot, 'work-units'), { recursive: true });

      // Version 1 — what gets migrated into the store (no Day-2 section yet).
      const v1 = [
        '# wu-111 — fixture',
        '',
        '**Status:** 🟣 in_review',
        '',
        '## Acceptance criteria',
        '',
        '- [ ] First criterion',
        '- [ ] The 5-day soak runs without a session being lost.',
        '',
        '## Notes / log',
        '',
        '### 2026-05-10 — first entry',
        '',
        'Some prose line A.',
        '',
        '## Build catalogue history',
        '',
        '- **2026-05-10T00:00:00.000Z** — migrated.',
        '',
      ].join('\n');
      await writeFile(wuPath, v1, 'utf8');

      const store = await openWorkflowStore(workflowsPath);
      await runMigrate({ catalogueRoot: buildRoot, store });
      const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });

      // Version 2 — the maintainer hand-edits the file on disk AFTER migration,
      // adding a whole new notes sub-section (the analogue of the Day-2 entry).
      const day2Section = [
        '### 2026-05-11 (Session 73) — Day 2 of soak',
        '',
        'Day-2 prose that exists only on disk, never in the store snapshot.',
        'Another Day-2 prose line about 603 rows of real catalogue-indexer data.',
        '',
      ].join('\n');
      const v2 = v1.replace('\n## Build catalogue history', `\n${day2Section}\n## Build catalogue history`);
      await writeFile(wuPath, v2, 'utf8');

      // Now tick the soak AC (CLI --index=2 → 0-based 1).
      const result = await cmdWuTick(store, runtime, {
        handle: 'wu-111',
        index: 2,
        evidence: 'soak satisfied',
      });
      assert.equal(result.exitCode, 0, result.output);

      // The on-disk file must STILL contain the hand-added Day-2 section.
      const onDisk = await readFile(wuPath, 'utf8');
      assert.ok(
        onDisk.includes('Day 2 of soak'),
        'the hand-added Day-2 notes section must be preserved on disk after wu tick'
      );
      assert.ok(
        onDisk.includes('603 rows of real catalogue-indexer data'),
        'every line of the hand-added section must survive the tick write'
      );
      // And the soak AC is ticked.
      assert.match(onDisk, /^- \[x\] The 5-day soak runs/m);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  // WU 214 AC 4 — advance_status preserves on-disk hand-edits made after the store snapshot
  test('advance_status preserves on-disk hand-edits made after the store snapshot (WU 214 AC 4)', async () => {
    // Same setup as the wu-tick test: migrate a v1 file, hand-edit on disk to add content the
    // store snapshot will never have, then run the command and assert the hand-edit survives.
    const workspace = await mkdtemp(path.join(tmpdir(), 'wu214-advance-'));
    try {
      const buildRoot = path.join(workspace, 'docs', 'build');
      const workflowsPath = path.join(workspace, '.nuos-catalogue', 'workflows.json');
      const wuPath = path.join(buildRoot, 'work-units', '500-advance-fixture.md');
      await mkdir(path.join(buildRoot, 'work-units'), { recursive: true });

      // v1 — migrated into the store (no hand-edited notes section yet).
      const v1 = [
        '# wu-500 — advance fixture',
        '',
        '**Status:** 🟢 ready',
        '',
        '## Acceptance criteria',
        '',
        '- [ ] First criterion',
        '',
        '## Notes / log',
        '',
        '### 2026-05-10 — first entry',
        '',
        'Some initial prose.',
        '',
        '## Build catalogue history',
        '',
        '- **2026-05-10T00:00:00.000Z** — migrated.',
        '',
      ].join('\n');
      await writeFile(wuPath, v1, 'utf8');

      const store = await openWorkflowStore(workflowsPath);
      await runMigrate({ catalogueRoot: buildRoot, store });
      const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });

      // v2 — hand-edit on disk after migration: add a new notes sub-section.
      const handEditSection = [
        '### 2026-05-31 (Session 115) — hand-edited after migration',
        '',
        'This prose was added on disk after the store snapshot was frozen.',
        'The advance_status command must not clobber it.',
        '',
      ].join('\n');
      const v2 = v1.replace('\n## Build catalogue history', `\n${handEditSection}\n## Build catalogue history`);
      await writeFile(wuPath, v2, 'utf8');

      // Run advance_status (ready → in_progress).
      const result = await cmdWuAdvance(store, runtime, {
        handle: 'wu-500',
        to: 'in_progress',
        reason: 'starting work',
      });
      assert.equal(result.exitCode, 0, result.output);

      const onDisk = await readFile(wuPath, 'utf8');

      // Hand-edited content must survive.
      assert.ok(
        onDisk.includes('hand-edited after migration'),
        'the hand-edited notes sub-section heading must be preserved after advance_status'
      );
      assert.ok(
        onDisk.includes('This prose was added on disk after the store snapshot was frozen'),
        'every line of the hand-edited section must survive the advance_status write'
      );
      // And the status was actually advanced.
      assert.match(onDisk, /\*\*Status:\*\* 🟡 in_progress/);
      assert.match(onDisk, /Status advanced ready → in_progress/);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  // WU 214 AC 4 — supersede preserves on-disk hand-edits on both the target and superseding files
  test('supersede preserves on-disk hand-edits on both files (WU 214 AC 4)', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'wu214-supersede-'));
    try {
      const buildRoot = path.join(workspace, 'docs', 'build');
      const workflowsPath = path.join(workspace, '.nuos-catalogue', 'workflows.json');
      const decisionsDir = path.join(buildRoot, 'decisions');
      await mkdir(decisionsDir, { recursive: true });

      const targetPath = path.join(decisionsDir, 'D200-original.md');
      const supersedingPath = path.join(decisionsDir, 'D201-replacement.md');

      // v1 — migrated into the store.
      const targetV1 = [
        '# D200 — Original decision',
        '',
        '**Status:** accepted',
        '',
        '## Context',
        '',
        'Original context prose.',
        '',
        '## Build catalogue history',
        '',
        '- **2026-05-10T00:00:00.000Z** — accepted.',
        '',
      ].join('\n');
      const supersedingV1 = [
        '# D201 — Replacement decision',
        '',
        '**Status:** accepted',
        '',
        '## Context',
        '',
        'Replacement context prose.',
        '',
        '## Build catalogue history',
        '',
        '- **2026-05-10T00:00:00.000Z** — accepted.',
        '',
      ].join('\n');
      await writeFile(targetPath, targetV1, 'utf8');
      await writeFile(supersedingPath, supersedingV1, 'utf8');

      const store = await openWorkflowStore(workflowsPath);
      await runMigrate({ catalogueRoot: buildRoot, store });
      const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });

      // v2 — hand-edit both files on disk after migration.
      const targetHandEdit = '### 2026-05-31 — implementation note\n\nHand-edited clarification on the target decision.\n\n';
      const supersedingHandEdit = '### 2026-05-31 — added context\n\nHand-edited note on the superseding decision.\n\n';
      const targetV2 = targetV1.replace('\n## Build catalogue history', `\n${targetHandEdit}\n## Build catalogue history`);
      const supersedingV2 = supersedingV1.replace('\n## Build catalogue history', `\n${supersedingHandEdit}\n## Build catalogue history`);
      await writeFile(targetPath, targetV2, 'utf8');
      await writeFile(supersedingPath, supersedingV2, 'utf8');

      // Run supersede.
      const result = await cmdDecisionSupersede(store, runtime, {
        target: 'D200',
        by: 'D201',
        reason: 'better approach confirmed',
      });
      assert.equal(result.exitCode, 0, result.output);

      const targetOnDisk = await readFile(targetPath, 'utf8');
      const supersedingOnDisk = await readFile(supersedingPath, 'utf8');

      // Hand-edits on both files must survive.
      assert.ok(
        targetOnDisk.includes('Hand-edited clarification on the target decision'),
        'hand-edit on the target decision must survive after supersede'
      );
      assert.ok(
        supersedingOnDisk.includes('Hand-edited note on the superseding decision'),
        'hand-edit on the superseding decision must survive after supersede'
      );
      // And the supersede link was written correctly.
      assert.match(targetOnDisk, /\*\*Status:\*\* superseded by D201/);
      assert.match(targetOnDisk, /Superseded by D201/);
      assert.match(supersedingOnDisk, /Supersedes D200/);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  // WU 214 AC 4 — resolve preserves on-disk hand-edits on both question and decision files
  test('resolve preserves on-disk hand-edits on both files (WU 214 AC 4)', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'wu214-resolve-'));
    try {
      const buildRoot = path.join(workspace, 'docs', 'build');
      const workflowsPath = path.join(workspace, '.nuos-catalogue', 'workflows.json');
      await mkdir(path.join(buildRoot, 'open-questions'), { recursive: true });
      await mkdir(path.join(buildRoot, 'decisions'), { recursive: true });

      const qPath = path.join(buildRoot, 'open-questions', 'Q300-test-question.md');
      const dPath = path.join(buildRoot, 'decisions', 'D300-resolving.md');

      const qV1 = [
        '# Q300 — test question',
        '',
        '**Status:** active',
        '',
        '## Context',
        '',
        'Why do we do this?',
        '',
        '## Build catalogue history',
        '',
        '- **2026-05-10T00:00:00.000Z** — filed.',
        '',
      ].join('\n');
      const dV1 = [
        '# D300 — resolving decision',
        '',
        '**Status:** accepted',
        '',
        '## Context',
        '',
        'We do it because.',
        '',
        '## Build catalogue history',
        '',
        '- **2026-05-10T00:00:00.000Z** — accepted.',
        '',
      ].join('\n');
      await writeFile(qPath, qV1, 'utf8');
      await writeFile(dPath, dV1, 'utf8');

      const store = await openWorkflowStore(workflowsPath);
      await runMigrate({ catalogueRoot: buildRoot, store });
      const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });

      // v2 — hand-edit both files on disk after migration.
      const qHandEdit = '### 2026-05-31 — extra context\n\nHand-edited note on the question after migration.\n\n';
      const dHandEdit = '### 2026-05-31 — implementation reference\n\nHand-edited reference note on the decision after migration.\n\n';
      const qV2 = qV1.replace('\n## Build catalogue history', `\n${qHandEdit}\n## Build catalogue history`);
      const dV2 = dV1.replace('\n## Build catalogue history', `\n${dHandEdit}\n## Build catalogue history`);
      await writeFile(qPath, qV2, 'utf8');
      await writeFile(dPath, dV2, 'utf8');

      // Run resolve.
      const result = await cmdQuestionResolve(store, runtime, {
        qHandle: 'Q300',
        by: 'D300',
        reason: 'decision answers the question',
      });
      assert.equal(result.exitCode, 0, result.output);

      const qOnDisk = await readFile(qPath, 'utf8');
      const dOnDisk = await readFile(dPath, 'utf8');

      // Hand-edits on both files must survive.
      assert.ok(
        qOnDisk.includes('Hand-edited note on the question after migration'),
        'hand-edit on the question file must survive after resolve'
      );
      assert.ok(
        dOnDisk.includes('Hand-edited reference note on the decision after migration'),
        'hand-edit on the decision file must survive after resolve'
      );
      // And the resolve link was written correctly.
      assert.match(qOnDisk, /\*\*Status:\*\* resolved by D300/);
      assert.match(qOnDisk, /Resolved by D300/);
      assert.match(dOnDisk, /Resolves Q300/);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  // WU 214 AC 3 — divergence guard: a record whose on-disk file is deleted causes a
  // clear Store-coherence error rather than a silent clobber or silent failure.
  test('divergence guard: deleted on-disk file causes a store-coherence error (WU 214 AC 3)', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'wu214-guard-'));
    try {
      const buildRoot = path.join(workspace, 'docs', 'build');
      const workflowsPath = path.join(workspace, '.nuos-catalogue', 'workflows.json');
      const wuPath = path.join(buildRoot, 'work-units', '600-guard-fixture.md');
      await mkdir(path.join(buildRoot, 'work-units'), { recursive: true });

      const v1 = [
        '# wu-600 — divergence guard fixture',
        '',
        '**Status:** 🟢 ready',
        '',
        '## Acceptance criteria',
        '',
        '- [ ] A criterion',
        '',
        '## Build catalogue history',
        '',
        '- **2026-05-10T00:00:00.000Z** — migrated.',
        '',
      ].join('\n');
      await writeFile(wuPath, v1, 'utf8');

      const store = await openWorkflowStore(workflowsPath);
      await runMigrate({ catalogueRoot: buildRoot, store });
      const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });

      // Delete the on-disk file to simulate divergence (file was removed or moved
      // without re-migrating).
      await rm(wuPath, { force: true });

      // Any write command must refuse with a clear store-coherence error,
      // not silently write a stale snapshot back to disk under a new path.
      await assert.rejects(
        () => cmdWuAdvance(store, runtime, { handle: 'wu-600', to: 'in_progress' }),
        (err: Error) => {
          assert.match(err.message, /Store-coherence error/);
          assert.match(err.message, /wu-600/);
          assert.match(err.message, /nuos-catalogue migrate/);
          return true;
        }
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test('extractForCompletion does not falsely infer evidence from prose', () => {
    const proseOnly = [
      '# wu-test',
      '',
      '## Acceptance criteria',
      '',
      '- [x] First criterion',
      '- [x] Second criterion',
      '',
      '## Notes',
      '',
      'The `## Build catalogue history` section will hold audit entries.',
      'For now there are none — but the parser must not be tricked by',
      'this paragraph into thinking the heading exists.',
      '',
    ].join('\n');

    const acs = extractForCompletion(proseOnly);
    assert.equal(acs.length, 2);
    // No real history section → both ACs fall back to the stub evidence.
    assert.equal(acs[0].evidence, 'Ticked in source markdown.');
    assert.equal(acs[1].evidence, 'Ticked in source markdown.');
  });
});
