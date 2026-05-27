/**
 * `install-hooks` — copy every Claude Code PreToolUse hook shipped in
 * the package into the consumer's `.claude/hooks/`, wire them into the
 * consumer's `.claude/settings.json` under a single shared matcher,
 * and add the active-WU marker file to `.gitignore`.
 *
 * Hooks discovered automatically by scanning `templates/claude-hooks/`
 * for `*.sh` files — adding a new hook to that directory is enough to
 * have it installed on the next consumer upgrade.
 *
 * Idempotent. Safe to re-run after package upgrades — hook scripts
 * are overwritten, settings entries are added only if missing, and the
 * gitignore line is appended only if not present.
 *
 * @module commands/install-claude-hooks
 */

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
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

const SETTINGS_MATCHER = "Write|Edit|MultiEdit|NotebookEdit";

// The active-WU marker is read only by check-implementation-write.sh.
// We add it to .gitignore whenever that hook is being installed.
const IMPLEMENTATION_HOOK = "check-implementation-write.sh";
const ACTIVE_WU_MARKER = ".nuos-catalogue/active-wu";

/**
 * Resolve the path to the bundled `templates/claude-hooks/` directory.
 * When running from `dist/` (the published package) the templates dir
 * sits at `../templates/claude-hooks/` relative to the compiled JS.
 * When running from source (tsx during development) it's at
 * `../../templates/claude-hooks/` relative to this file.
 */
function resolveTemplatesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "..", "..", "templates", "claude-hooks"),
    resolve(here, "..", "templates", "claude-hooks"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0]!;
}

/**
 * Idempotently install every Claude PreToolUse hook into the project at
 * `cwd`. Returns a CommandResult describing what was done.
 */
export function cmdInstallClaudeHooks(
  opts: InstallClaudeHooksOptions = {},
): CommandResult {
  const cwd = opts.cwd ?? process.cwd();
  const templatesDir = opts.templatesDir ?? resolveTemplatesDir();

  if (!existsSync(templatesDir)) {
    return {
      output: `✖ nuos: hook templates directory not found at ${templatesDir}\n   The package may be installed incorrectly. Try reinstalling.`,
      exitCode: 1,
    };
  }

  const hookFiles = readdirSync(templatesDir)
    .filter((f) => f.endsWith(".sh"))
    .sort();

  if (hookFiles.length === 0) {
    return {
      output: `✖ nuos: no hook scripts found in ${templatesDir}`,
      exitCode: 1,
    };
  }

  const lines: string[] = [];
  const hooksDir = join(cwd, ".claude", "hooks");
  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });

  // 1. Copy every hook script into .claude/hooks/.
  for (const filename of hookFiles) {
    const src = join(templatesDir, filename);
    const dest = join(hooksDir, filename);
    copyFileSync(src, dest);
    try {
      chmodSync(dest, 0o755);
    } catch {
      // chmod is best-effort on filesystems that don't support it.
    }
    lines.push(`  ✓ installed hook → .claude/hooks/${filename}`);
  }

  // 2. Merge into .claude/settings.json. All hooks share one PreToolUse
  //    matcher; each contributes one command entry.
  const settingsPath = join(cwd, ".claude", "settings.json");
  let settings = readJsonOrEmpty(settingsPath);
  let settingsChanged = false;
  for (const filename of hookFiles) {
    const command = `bash .claude/hooks/${filename}`;
    const updated = addPreToolUseHook(settings, SETTINGS_MATCHER, command);
    settings = updated.value;
    if (updated.changed) settingsChanged = true;
  }
  if (settingsChanged) {
    writeFileSync(
      settingsPath,
      JSON.stringify(settings, null, 2) + "\n",
      "utf8",
    );
    lines.push("  ✓ updated .claude/settings.json (PreToolUse entries added)");
  } else {
    lines.push("  · .claude/settings.json already has every PreToolUse entry");
  }

  // 3. Add the active-WU marker to .gitignore — only relevant when the
  //    implementation-write hook is part of the bundle.
  if (hookFiles.includes(IMPLEMENTATION_HOOK)) {
    const gitignorePath = join(cwd, ".gitignore");
    const added = ensureGitignoreEntry(gitignorePath, ACTIVE_WU_MARKER);
    if (added) {
      lines.push(`  ✓ added ${ACTIVE_WU_MARKER} to .gitignore`);
    } else {
      lines.push(`  · ${ACTIVE_WU_MARKER} already in .gitignore`);
    }
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

/**
 * Add a `{type:"command", command}` hook entry under the PreToolUse
 * matcher. If a matcher entry with the same `matcher` string already
 * exists, the command is appended to its `hooks` array (deduped by
 * command string). Otherwise a new matcher entry is created. Settings
 * that already contain the command anywhere under PreToolUse are
 * returned unchanged.
 *
 * Pure function: takes settings in, returns a new settings object plus
 * a `changed` flag indicating whether anything was actually added.
 */
export function addPreToolUseHook(
  settings: Record<string, unknown>,
  matcher: string,
  command: string,
): { value: Record<string, unknown>; changed: boolean } {
  const next: Record<string, unknown> = { ...settings };
  const hooksField = (next.hooks as Record<string, unknown> | undefined) ?? {};
  const preToolUse =
    (hooksField.PreToolUse as MatcherEntry[] | undefined) ?? [];

  // Already present anywhere? Dedupe by command string.
  for (const entry of preToolUse) {
    for (const h of entry.hooks ?? []) {
      if (h.command === command) {
        return { value: next, changed: false };
      }
    }
  }

  // Look for an existing matcher with the same matcher string and
  // append to it — keeps all our hooks under a single matcher entry,
  // matching the shape the catalogue uses in its own settings.json.
  const matchingIndex = preToolUse.findIndex((e) => e.matcher === matcher);
  let newPreToolUse: MatcherEntry[];
  if (matchingIndex >= 0) {
    const existing = preToolUse[matchingIndex]!;
    const merged: MatcherEntry = {
      matcher: existing.matcher,
      hooks: [...(existing.hooks ?? []), { type: "command", command }],
    };
    newPreToolUse = [
      ...preToolUse.slice(0, matchingIndex),
      merged,
      ...preToolUse.slice(matchingIndex + 1),
    ];
  } else {
    newPreToolUse = [
      ...preToolUse,
      { matcher, hooks: [{ type: "command", command }] },
    ];
  }

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
  const newBody =
    body.endsWith("\n") || body.length === 0
      ? body + line + "\n"
      : body + "\n" + line + "\n";
  writeFileSync(path, newBody, "utf8");
  return true;
}
