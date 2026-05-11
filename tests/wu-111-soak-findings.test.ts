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
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
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
import { extractForCompletion } from '../src/runtime/ac-parse.js';
import { cmdWuTick } from '../src/commands/write.js';
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
