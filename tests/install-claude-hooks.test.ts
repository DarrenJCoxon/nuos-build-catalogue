/**
 * Tests for the install-hooks command (WU 136) — focused on the pure
 * helpers (settings.json merge + gitignore append). The end-to-end
 * filesystem copy is exercised indirectly via the smoke test that
 * runs the installer against a temp dir.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  addPreToolUseHook,
  cmdInstallClaudeHooks,
  ensureGitignoreEntry,
} from '../src/commands/install-claude-hooks.js';

const MATCHER = 'Write|Edit|MultiEdit|NotebookEdit';
const COMMAND = 'bash .claude/hooks/check-implementation-write.sh';

function makeTempProject(): string {
  return mkdtempSync(join(tmpdir(), 'nuos-install-hooks-'));
}

test('addPreToolUseHook adds the entry to a fresh settings object', () => {
  const { value, changed } = addPreToolUseHook({}, MATCHER, COMMAND);
  assert.equal(changed, true);
  const hooks = value.hooks as { PreToolUse: unknown[] };
  assert.ok(Array.isArray(hooks.PreToolUse));
  assert.equal(hooks.PreToolUse.length, 1);
});

test('addPreToolUseHook preserves any existing PreToolUse entries', () => {
  const existing = {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: 'bash .claude/hooks/other.sh' }],
        },
      ],
    },
  };
  const { value, changed } = addPreToolUseHook(existing, MATCHER, COMMAND);
  assert.equal(changed, true);
  const pre = (value.hooks as { PreToolUse: unknown[] }).PreToolUse;
  assert.equal(pre.length, 2);
});

test('addPreToolUseHook is idempotent — same command twice is a no-op', () => {
  const first = addPreToolUseHook({}, MATCHER, COMMAND);
  const second = addPreToolUseHook(first.value, MATCHER, COMMAND);
  assert.equal(second.changed, false);
  const pre = (second.value.hooks as { PreToolUse: unknown[] }).PreToolUse;
  assert.equal(pre.length, 1);
});

test('ensureGitignoreEntry appends a missing line', () => {
  const cwd = makeTempProject();
  try {
    const path = join(cwd, '.gitignore');
    writeFileSync(path, 'node_modules\n.env\n', 'utf8');
    const added = ensureGitignoreEntry(path, '.nuos-catalogue/active-wu');
    assert.equal(added, true);
    const body = readFileSync(path, 'utf8');
    assert.match(body, /\.nuos-catalogue\/active-wu/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('ensureGitignoreEntry does not duplicate an existing line', () => {
  const cwd = makeTempProject();
  try {
    const path = join(cwd, '.gitignore');
    writeFileSync(path, 'node_modules\n.nuos-catalogue/active-wu\n', 'utf8');
    const added = ensureGitignoreEntry(path, '.nuos-catalogue/active-wu');
    assert.equal(added, false);
    const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l === '.nuos-catalogue/active-wu');
    assert.equal(lines.length, 1);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('ensureGitignoreEntry creates the file if missing', () => {
  const cwd = makeTempProject();
  try {
    const path = join(cwd, '.gitignore');
    assert.equal(existsSync(path), false);
    const added = ensureGitignoreEntry(path, '.nuos-catalogue/active-wu');
    assert.equal(added, true);
    assert.equal(existsSync(path), true);
    assert.match(readFileSync(path, 'utf8'), /\.nuos-catalogue\/active-wu/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('cmdInstallClaudeHooks copies the hook, merges settings, and updates gitignore', () => {
  const cwd = makeTempProject();
  try {
    const r = cmdInstallClaudeHooks({ cwd });
    assert.equal(r.exitCode, 0);
    // Hook file copied.
    assert.equal(existsSync(join(cwd, '.claude', 'hooks', 'check-implementation-write.sh')), true);
    // Settings file created with the matcher entry.
    const settingsPath = join(cwd, '.claude', 'settings.json');
    assert.equal(existsSync(settingsPath), true);
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.ok(settings.hooks?.PreToolUse?.length >= 1);
    // .gitignore updated.
    assert.match(readFileSync(join(cwd, '.gitignore'), 'utf8'), /\.nuos-catalogue\/active-wu/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('cmdInstallClaudeHooks is idempotent', () => {
  const cwd = makeTempProject();
  try {
    cmdInstallClaudeHooks({ cwd });
    const r2 = cmdInstallClaudeHooks({ cwd });
    assert.equal(r2.exitCode, 0);
    // No duplicate settings entries — all hooks share one matcher entry.
    const settings = JSON.parse(readFileSync(join(cwd, '.claude', 'settings.json'), 'utf8'));
    assert.equal(settings.hooks.PreToolUse.length, 1);
    // No duplicate gitignore lines.
    const lines = readFileSync(join(cwd, '.gitignore'), 'utf8').split('\n').filter((l) => l === '.nuos-catalogue/active-wu');
    assert.equal(lines.length, 1);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('cmdInstallClaudeHooks installs every hook shipped in templates/claude-hooks/', () => {
  const cwd = makeTempProject();
  try {
    const r = cmdInstallClaudeHooks({ cwd });
    assert.equal(r.exitCode, 0);
    // Every hook this package ships ends up in .claude/hooks/.
    const hooksDir = join(cwd, '.claude', 'hooks');
    assert.equal(existsSync(join(hooksDir, 'check-implementation-write.sh')), true);
    assert.equal(existsSync(join(hooksDir, 'check-design-system-compliance.sh')), true);
    assert.equal(existsSync(join(hooksDir, 'check-module-discipline.sh')), true);
    // Each gets a settings.json command entry, all under a single matcher.
    const settings = JSON.parse(readFileSync(join(cwd, '.claude', 'settings.json'), 'utf8'));
    assert.equal(settings.hooks.PreToolUse.length, 1);
    const commands = settings.hooks.PreToolUse[0].hooks.map((h: { command: string }) => h.command);
    assert.ok(commands.includes('bash .claude/hooks/check-implementation-write.sh'));
    assert.ok(commands.includes('bash .claude/hooks/check-design-system-compliance.sh'));
    assert.ok(commands.includes('bash .claude/hooks/check-module-discipline.sh'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('addPreToolUseHook appends to an existing matcher with the same key rather than creating a new one', () => {
  const existing = {
    hooks: {
      PreToolUse: [
        {
          matcher: MATCHER,
          hooks: [{ type: 'command', command: 'bash .claude/hooks/first.sh' }],
        },
      ],
    },
  };
  const { value, changed } = addPreToolUseHook(existing, MATCHER, 'bash .claude/hooks/second.sh');
  assert.equal(changed, true);
  const pre = (value.hooks as { PreToolUse: { matcher: string; hooks: { command: string }[] }[] }).PreToolUse;
  // Still a single matcher entry — the second command was appended into it,
  // not split into a second entry.
  assert.equal(pre.length, 1);
  assert.equal(pre[0].hooks.length, 2);
  assert.equal(pre[0].hooks[0].command, 'bash .claude/hooks/first.sh');
  assert.equal(pre[0].hooks[1].command, 'bash .claude/hooks/second.sh');
});
