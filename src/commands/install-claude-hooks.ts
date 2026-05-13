/**
 * `install-hooks` — copy the package's Claude Code PreToolUse hook
 * into the consumer's `.claude/hooks/`, wire it into the consumer's
 * `.claude/settings.json`, and add the active-WU marker file to
 * `.gitignore` so the per-session marker doesn't pollute commits.
 *
 * Idempotent. Safe to re-run after package upgrades — the hook script
 * is overwritten, the settings entry is added only if missing, and the
 * gitignore line is appended only if not present.
 *
 * @module commands/install-claude-hooks
 */

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface CommandResult {
  output: string;
  exitCode: number;
}

export interface InstallClaudeHooksOptions {
  cwd?: string;
  /** Override the path the templates are resolved from (testing only). */
  templatesDir?: string;
}

const HOOK_FILENAME = "check-implementation-write.sh";
const SETTINGS_MATCHER = "Write|Edit|MultiEdit|NotebookEdit";
const SETTINGS_COMMAND = `bash .claude/hooks/${HOOK_FILENAME}`;

/**
 * Resolve the path to the bundled `templates/claude-hooks/` directory.
 * When running from `dist/` (the published package) the templates dir
 * sits at `../templates/claude-hooks/` relative to the compiled JS.
 * When running from source (tsx during development) it's at
 * `../../templates/claude-hooks/` relative to this file.
 */
function resolveTemplatesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Look at sibling-of-parent first (compiled dist/commands/ → dist/../templates/),
  // then grandparent-of-parent (src/commands/ → repo-root/templates/).
  const candidates = [
    resolve(here, "..", "..", "templates", "claude-hooks"),
    resolve(here, "..", "templates", "claude-hooks"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Last resort: return the first candidate so the error message names
  // a real-ish path.
  return candidates[0]!;
}

/**
 * Idempotently install the Claude PreToolUse hook into the project at
 * `cwd`. Returns a CommandResult describing what was done.
 */
export function cmdInstallClaudeHooks(
  opts: InstallClaudeHooksOptions = {},
): CommandResult {
  const cwd = opts.cwd ?? process.cwd();
  const templatesDir = opts.templatesDir ?? resolveTemplatesDir();
  const srcHook = join(templatesDir, HOOK_FILENAME);

  if (!existsSync(srcHook)) {
    return {
      output: `✖ nuos: hook template not found at ${srcHook}\n   The package may be installed incorrectly. Try reinstalling.`,
      exitCode: 1,
    };
  }

  const lines: string[] = [];

  // 1. Copy the hook script into .claude/hooks/.
  const hooksDir = join(cwd, ".claude", "hooks");
  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });
  const destHook = join(hooksDir, HOOK_FILENAME);
  copyFileSync(srcHook, destHook);
  // Mark executable. bash is invoked explicitly via the matcher's
  // `command`, but the exec bit helps when the hook is invoked
  // directly during debugging.
  try {
    chmodSync(destHook, 0o755);
  } catch {
    // chmod is best-effort on filesystems that don't support it.
  }
  lines.push(`  ✓ installed hook → .claude/hooks/${HOOK_FILENAME}`);

  // 2. Merge into .claude/settings.json. We add a PreToolUse matcher
  //    entry only if no entry with the same command already exists.
  const settingsPath = join(cwd, ".claude", "settings.json");
  const settings = readJsonOrEmpty(settingsPath);
  const updated = addPreToolUseHook(settings, SETTINGS_MATCHER, SETTINGS_COMMAND);
  if (updated.changed) {
    writeFileSync(settingsPath, JSON.stringify(updated.value, null, 2) + "\n", "utf8");
    lines.push("  ✓ updated .claude/settings.json (PreToolUse entry added)");
  } else {
    lines.push("  · .claude/settings.json already has the PreToolUse entry");
  }

  // 3. Add the active-WU marker to .gitignore.
  const gitignorePath = join(cwd, ".gitignore");
  const addedGitignore = ensureGitignoreEntry(gitignorePath, ".nuos-catalogue/active-wu");
  if (addedGitignore) {
    lines.push("  ✓ added .nuos-catalogue/active-wu to .gitignore");
  } else {
    lines.push("  · .nuos-catalogue/active-wu already in .gitignore");
  }

  return {
    output: [
      "nuos: Claude Code hooks installed.",
      ...lines,
      "",
      "Next: declare an active work unit before substantive sibling-repo work:",
      "    nuos-catalogue wu start <handle>",
    ].join("\n"),
    exitCode: 0,
  };
}

// ── helpers ─────────────────────────────────────────────────────────────

function readJsonOrEmpty(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

interface HookEntry {
  type: "command";
  command: string;
}
interface MatcherEntry {
  matcher: string;
  hooks: HookEntry[];
}

export function addPreToolUseHook(
  settings: Record<string, unknown>,
  matcher: string,
  command: string,
): { value: Record<string, unknown>; changed: boolean } {
  // Defensive copy so callers can't accidentally see in-place mutation.
  const next: Record<string, unknown> = { ...settings };
  const hooksField = (next.hooks as Record<string, unknown> | undefined) ?? {};
  const preToolUse = (hooksField.PreToolUse as MatcherEntry[] | undefined) ?? [];

  // Already present? Check by command string (any matcher).
  for (const entry of preToolUse) {
    for (const h of entry.hooks ?? []) {
      if (h.command === command) {
        return { value: next, changed: false };
      }
    }
  }

  const newEntry: MatcherEntry = {
    matcher,
    hooks: [{ type: "command", command }],
  };
  const newPreToolUse = [...preToolUse, newEntry];
  const newHooks = { ...hooksField, PreToolUse: newPreToolUse };
  next.hooks = newHooks;
  return { value: next, changed: true };
}

export function ensureGitignoreEntry(path: string, line: string): boolean {
  let body = "";
  if (existsSync(path)) {
    body = readFileSync(path, "utf8");
  }
  const lines = body.split("\n").map((l) => l.trim());
  if (lines.includes(line)) return false;
  const newBody = body.endsWith("\n") || body.length === 0 ? body + line + "\n" : body + "\n" + line + "\n";
  writeFileSync(path, newBody, "utf8");
  return true;
}
