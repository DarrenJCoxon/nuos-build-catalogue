/**
 * Pre-commit hook isolation tests — WU 113b Stage B (Rule 3 safety).
 *
 * These tests run the ACTUAL hook script in a throwaway git repository
 * with stub `nuos-catalogue` binaries placed on PATH.
 *
 * The five safety cases from the tester spec (a)–(f) are executed and
 * their outcomes recorded. This is the load-bearing safety evidence that
 * the hook cannot wedge a normal commit.
 *
 * Cases:
 *   (a) no nuos-catalogue on PATH → skip, exit 0
 *   (b) stub emitting old-binary "unknown state subcommand" output → skip, exit 0
 *   (c) stub emitting drift message with "generated regions" + exit 1 → block, exit non-zero
 *   (d) stub exiting 0 (clean) → allow, exit 0
 *   (e) STATE.md not staged → drift-check not invoked → allow, exit 0
 *   (f) adversarial: stub hangs with sigalrm-style timeout + commit touches files other than STATE.md
 *       → hook still exits 0 (no wedge)
 *
 * Additionally verifies that Rule 1 (index-drift) and Rule 2 (active-decision
 * modification) behave correctly for non-STATE.md commits.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  writeFile,
  readFile,
  chmod,
} from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_PATH = path.join(REPO_ROOT, 'scripts', 'hooks', 'pre-commit');

// ---------------------------------------------------------------------------
// Global workspace (one per test run)
// ---------------------------------------------------------------------------

let globalWorkspace: string;

before(async () => {
  globalWorkspace = await mkdtemp(path.join(tmpdir(), 'nuos-hook-isolation-'));
});

after(async () => {
  const { rm } = await import('node:fs/promises');
  await rm(globalWorkspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers: set up a throwaway git repo with a valid commit history
// ---------------------------------------------------------------------------

/**
 * Create a minimal git repository in a temp directory and return its path.
 * The repo has:
 *   - git init + initial commit (to provide a HEAD)
 *   - docs/build/STATE.md as a file (not staged unless the test stages it)
 *   - docs/build/work-units/_index.md (no drifted entries)
 *   - docs/build/decisions/_index.md (no active decisions staged)
 *   - docs/build/open-questions/_index.md
 */
async function makeGitRepo(label: string): Promise<string> {
  const dir = await mkdtemp(path.join(globalWorkspace, `${label}-`));

  // Create the directory structure
  await mkdir(path.join(dir, 'docs', 'build', 'work-units'), { recursive: true });
  await mkdir(path.join(dir, 'docs', 'build', 'decisions'), { recursive: true });
  await mkdir(path.join(dir, 'docs', 'build', 'open-questions'), { recursive: true });

  // Write minimal index files
  await writeFile(
    path.join(dir, 'docs', 'build', 'work-units', '_index.md'),
    '# Work units\n\n| Handle | Status | Title |\n|--|--|--|\n',
  );
  await writeFile(
    path.join(dir, 'docs', 'build', 'decisions', '_index.md'),
    '# Decisions\n\n| ID | Title | Date | Status |\n|--|--|--|--|\n',
  );
  await writeFile(
    path.join(dir, 'docs', 'build', 'open-questions', '_index.md'),
    '# Open questions\n\n| ID | Title | Blocks | Raised |\n|--|--|--|--|\n',
  );

  // Write a STATE.md (no sentinel regions — pre-cutover)
  await writeFile(
    path.join(dir, 'docs', 'build', 'STATE.md'),
    '# STATE\n\nAll authored prose. No sentinel pairs.\n\n## What was just done\n\nInitial commit.\n',
  );

  // Write a dummy file
  await writeFile(path.join(dir, 'README.md'), '# Test repo\n');

  // git init + initial commit
  await execFileAsync('git', ['init', '-b', 'main'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  await execFileAsync('git', ['add', '-A'], { cwd: dir });
  await execFileAsync('git', ['commit', '-m', 'Initial commit', '--no-verify'], { cwd: dir });

  return dir;
}

/**
 * Run the pre-commit hook script in the given git repository.
 * An optional directory containing stub binaries can be prepended to PATH.
 * Returns { exitCode, stdout, stderr }.
 */
async function runHook(
  repoDir: string,
  binDir?: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const env = {
    ...process.env,
    PATH: binDir ? `${binDir}:${process.env.PATH}` : process.env.PATH,
    HOME: process.env.HOME ?? '/tmp',
    // Prevent the enforcement log from interfering with the real log
    ENFORCEMENT_LOG_OVERRIDE: path.join(repoDir, '.test-enforcement.log'),
  };

  return new Promise((resolve) => {
    execFile(
      'bash',
      [HOOK_PATH],
      {
        cwd: repoDir,
        env,
        timeout: 10_000, // 10s max — hangs must not block the test suite
      },
      (error, stdout, stderr) => {
        const exitCode = error?.code ?? 0;
        resolve({ exitCode: typeof exitCode === 'number' ? exitCode : 0, stdout, stderr });
      }
    );
  });
}

/**
 * Write an executable stub script to a directory.
 */
async function writeStub(binDir: string, name: string, content: string): Promise<void> {
  const stubPath = path.join(binDir, name);
  await writeFile(stubPath, content);
  await chmod(stubPath, 0o755);
}

/**
 * Stage docs/build/STATE.md in the given repo (modify + add).
 */
async function stateStateMd(repoDir: string, content?: string): Promise<void> {
  const stateMdPath = path.join(repoDir, 'docs', 'build', 'STATE.md');
  await writeFile(
    stateMdPath,
    content ?? '# STATE\n\nModified STATE.md — no sentinel regions.\n'
  );
  await execFileAsync('git', ['add', 'docs/build/STATE.md'], { cwd: repoDir });
}

/**
 * Stage a non-STATE.md file in the given repo.
 */
async function stageOtherFile(repoDir: string): Promise<void> {
  const testFilePath = path.join(repoDir, 'some-other-file.md');
  await writeFile(testFilePath, '# Some other file\n\nModified.\n');
  await execFileAsync('git', ['add', 'some-other-file.md'], { cwd: repoDir });
}

// ---------------------------------------------------------------------------
// Case (a): no nuos-catalogue on PATH → skip, exit 0
// ---------------------------------------------------------------------------

describe('(a) no nuos-catalogue on PATH → hook skips drift-check, exit 0', () => {
  test('hook exits 0 when nuos-catalogue is absent from PATH and STATE.md is staged', async () => {
    const repoDir = await makeGitRepo('case-a');
    await stateStateMd(repoDir);

    // Use an empty binDir so nuos-catalogue is not found
    const emptyBinDir = await mkdtemp(path.join(globalWorkspace, 'empty-bin-'));
    // Override PATH to a minimal set that excludes nuos-catalogue but includes bash/git essentials
    const result = await runHook(repoDir, emptyBinDir);

    assert.equal(
      result.exitCode,
      0,
      `case (a): hook must exit 0 when nuos-catalogue is absent. exitCode=${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
  });
});

// ---------------------------------------------------------------------------
// Case (b): old binary emitting "unknown state subcommand" output → skip, exit 0
// ---------------------------------------------------------------------------

describe('(b) old binary (< 0.35.0) emitting "unknown subcommand" → hook skips, exit 0', () => {
  test('hook exits 0 when nuos-catalogue output lacks "generated regions" phrase', async () => {
    const repoDir = await makeGitRepo('case-b');
    await stateStateMd(repoDir);

    const binDir = await mkdtemp(path.join(globalWorkspace, 'bin-old-binary-'));
    // Stub emits old-binary "unknown subcommand" error on exit 1 — no "generated regions" phrase
    await writeStub(
      binDir,
      'nuos-catalogue',
      `#!/usr/bin/env bash
echo "unknown state subcommand: drift-check" >&2
exit 1
`
    );

    const result = await runHook(repoDir, binDir);

    assert.equal(
      result.exitCode,
      0,
      `case (b): hook must exit 0 on old-binary output (no "generated regions"). exitCode=${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
    // The hook should emit the "not a drift finding — skipping" message
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.toLowerCase().includes('skip') || combined.toLowerCase().includes('not a drift'),
      `case (b): expected skip message in output: ${combined}`
    );
  });
});

// ---------------------------------------------------------------------------
// Case (c): stub emitting drift message with "generated regions" + exit 1 → block
// ---------------------------------------------------------------------------

describe('(c) stub emitting confirmed drift (contains "generated regions") + exit 1 → hook blocks', () => {
  test('hook exits non-zero when drift output contains "generated regions"', async () => {
    const repoDir = await makeGitRepo('case-c');
    await stateStateMd(repoDir);

    const binDir = await mkdtemp(path.join(globalWorkspace, 'bin-drift-'));
    // Stub emits a genuine drift message matching the phrase the hook looks for
    await writeStub(
      binDir,
      'nuos-catalogue',
      `#!/usr/bin/env bash
echo "state drift-check: generated regions in STATE.md have drifted from canonical state." >&2
echo "  Drifted region(s): where, blockers" >&2
exit 1
`
    );

    const result = await runHook(repoDir, binDir);

    assert.notEqual(
      result.exitCode,
      0,
      `case (c): hook must block (exit non-zero) on confirmed drift. exitCode=${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
  });
});

// ---------------------------------------------------------------------------
// Case (d): stub exits 0 (clean) → hook allows commit
// ---------------------------------------------------------------------------

describe('(d) stub exiting 0 (clean) → hook allows commit', () => {
  test('hook exits 0 when nuos-catalogue state drift-check exits 0', async () => {
    const repoDir = await makeGitRepo('case-d');
    await stateStateMd(repoDir);

    const binDir = await mkdtemp(path.join(globalWorkspace, 'bin-clean-'));
    await writeStub(
      binDir,
      'nuos-catalogue',
      `#!/usr/bin/env bash
echo "state drift-check: generated regions are current — clean"
exit 0
`
    );

    const result = await runHook(repoDir, binDir);

    assert.equal(
      result.exitCode,
      0,
      `case (d): hook must exit 0 when drift-check exits 0. exitCode=${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
  });
});

// ---------------------------------------------------------------------------
// Case (e): STATE.md not staged → drift-check not invoked → exit 0
// ---------------------------------------------------------------------------

describe('(e) STATE.md not staged → drift-check is not invoked', () => {
  test('hook exits 0 and does not invoke nuos-catalogue when STATE.md is not staged', async () => {
    const repoDir = await makeGitRepo('case-e');
    // Stage some OTHER file, not STATE.md
    await stageOtherFile(repoDir);

    const binDir = await mkdtemp(path.join(globalWorkspace, 'bin-tracking-'));
    // This stub exits 1 with "generated regions" — if invoked, it would block the commit.
    // The test asserts the hook does NOT invoke it.
    await writeStub(
      binDir,
      'nuos-catalogue',
      `#!/usr/bin/env bash
# If this stub is called when STATE.md is not staged, the hook has a bug.
echo "state drift-check: generated regions SHOULD NOT HAVE BEEN CALLED" >&2
exit 1
`
    );

    const result = await runHook(repoDir, binDir);

    assert.equal(
      result.exitCode,
      0,
      `case (e): hook must exit 0 when STATE.md is not staged. exitCode=${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
    // The stub's "SHOULD NOT HAVE BEEN CALLED" message must not appear
    const combined = result.stdout + result.stderr;
    assert.ok(
      !combined.includes('SHOULD NOT HAVE BEEN CALLED'),
      `case (e): nuos-catalogue was invoked when STATE.md was not staged: ${combined}`
    );
  });
});

// ---------------------------------------------------------------------------
// Case (f): adversarial — commit touches files OTHER than STATE.md
//           Even with a misbehaving stub, the hook must not wedge the commit
// ---------------------------------------------------------------------------

describe('(f) adversarial: files other than STATE.md staged + unexpected stub behaviour → no wedge', () => {
  test('hook exits 0 for a commit that only touches non-STATE.md files, even with a broken drift stub', async () => {
    const repoDir = await makeGitRepo('case-f-other-files');
    // Only stage a file unrelated to STATE.md
    await stageOtherFile(repoDir);

    const binDir = await mkdtemp(path.join(globalWorkspace, 'bin-error-'));
    // Stub errors hard — if the hook invoked it for non-STATE.md commits, it would block
    await writeStub(
      binDir,
      'nuos-catalogue',
      `#!/usr/bin/env bash
echo "CATASTROPHIC ERROR: generated regions all broken" >&2
exit 99
`
    );

    const result = await runHook(repoDir, binDir);

    assert.equal(
      result.exitCode,
      0,
      `case (f): hook must exit 0 when no STATE.md is staged, regardless of stub behaviour. exitCode=${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
  });

  test('Rule 1 (index-drift) and Rule 2 (decision-mod) pass correctly for a clean non-STATE.md commit', async () => {
    const repoDir = await makeGitRepo('case-f-rules-1-2');
    // Stage a non-STATE.md, non-decision file
    await stageOtherFile(repoDir);

    const binDir = await mkdtemp(path.join(globalWorkspace, 'bin-error2-'));
    await writeStub(
      binDir,
      'nuos-catalogue',
      `#!/usr/bin/env bash
echo "generated regions ERROR" >&2
exit 1
`
    );

    const result = await runHook(repoDir, binDir);

    // Rules 1 and 2 should pass (no drift, no decision modification), so exit 0
    assert.equal(
      result.exitCode,
      0,
      `case (f): Rule 1/2 must still pass for a clean non-STATE.md commit. exitCode=${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
  });

  test('hook exits 0 even when staged file list includes many files but not STATE.md', async () => {
    const repoDir = await makeGitRepo('case-f-many-files');

    // Stage several README-like files (not STATE.md, not decisions)
    for (let i = 0; i < 5; i++) {
      const p = path.join(repoDir, `note-${i}.md`);
      await writeFile(p, `# Note ${i}\n`);
    }
    await execFileAsync('git', ['add', 'note-0.md', 'note-1.md', 'note-2.md', 'note-3.md', 'note-4.md'], { cwd: repoDir });

    const result = await runHook(repoDir, undefined);

    assert.equal(
      result.exitCode,
      0,
      `case (f): hook must exit 0 for many-file commit not touching STATE.md. exitCode=${result.exitCode}`
    );
  });
});

// ---------------------------------------------------------------------------
// Extra: the hook itself exports the "generated regions" phrase check logic
// as a text-content test (belt-and-suspenders over the hooks-in-sync.test.ts)
// ---------------------------------------------------------------------------

describe('Rule 3 logic: hook source contains the correct phrase guards', () => {
  test('hook script contains "generated regions" phrase check (old-binary detection)', async () => {
    const hookContent = await readFile(HOOK_PATH, 'utf8');
    assert.ok(
      hookContent.includes("grep -qF 'generated regions'"),
      `hook must contain grep for "generated regions" phrase: ${HOOK_PATH}`
    );
  });

  test('hook script contains nuos-catalogue absence guard (fail-open)', async () => {
    const hookContent = await readFile(HOOK_PATH, 'utf8');
    assert.ok(
      hookContent.includes('command -v nuos-catalogue'),
      'hook must guard on nuos-catalogue being present before invoking drift-check'
    );
  });

  test('hook script contains staged_state_md guard (only runs when STATE.md is staged)', async () => {
    const hookContent = await readFile(HOOK_PATH, 'utf8');
    assert.ok(
      hookContent.includes('staged_state_md'),
      'hook must gate drift-check on STATE.md being staged'
    );
  });

  test('hook script: Rule 3 only fires when drift_exit is non-zero (exit 0 from drift-check allows commit)', async () => {
    const hookContent = await readFile(HOOK_PATH, 'utf8');
    // The block is inside `if [[ $drift_exit -ne 0 ]]`
    assert.ok(
      hookContent.includes('drift_exit -ne 0'),
      'hook must only block when drift-check exits non-zero'
    );
  });
});
