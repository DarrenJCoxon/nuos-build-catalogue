/**
 * `wu start` / `wu end` / `wu current` — manage the active-WU marker
 * consumed by the Claude PreToolUse hook (WU 136).
 *
 * The marker is a single-line file at `.nuos-catalogue/active-wu`
 * containing the handle of the WU currently being implemented. The hook
 * reads it to decide whether a sibling-repo write is allowed.
 *
 * These commands are intentionally minimal — file read / write / unlink
 * with friendly stdout. No workflow-store interaction, no validation of
 * whether the handle resolves to a real WU. Validation could be added
 * later if the unverified-handle pattern becomes a problem in practice;
 * today's risk is low because the operator types the handle themselves.
 *
 * @module commands/wu-active
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface CommandResult {
  output: string;
  exitCode: number;
}

export interface WuActiveOptions {
  /** Project root. Defaults to process.cwd(). */
  cwd?: string;
}

/** Compute the path to the active-WU marker for a given project root. */
export function activeWuMarkerPath(cwd: string): string {
  return join(cwd, ".nuos-catalogue", "active-wu");
}

/**
 * `wu start <handle>` — write the handle into the marker. Creates the
 * `.nuos-catalogue/` directory if it doesn't yet exist (idempotent).
 *
 * Overwrites any existing marker without ceremony — the operator's
 * `start` is authoritative. If they want to know the current value
 * before overwriting, they use `wu current`.
 */
export function cmdWuStart(
  handle: string | undefined,
  opts: WuActiveOptions = {},
): CommandResult {
  if (!handle || handle.trim().length === 0) {
    return {
      output: "Usage: nuos-catalogue wu start <handle>",
      exitCode: 2,
    };
  }
  const cwd = opts.cwd ?? process.cwd();
  const marker = activeWuMarkerPath(cwd);
  const dir = dirname(marker);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(marker, handle.trim() + "\n", "utf8");
  return {
    output: `nuos: active work unit set to "${handle.trim()}"`,
    exitCode: 0,
  };
}

/**
 * `wu end` — remove the marker. Succeeds silently if no marker is
 * present (idempotent: stopping a stopped state is fine).
 */
export function cmdWuEnd(opts: WuActiveOptions = {}): CommandResult {
  const cwd = opts.cwd ?? process.cwd();
  const marker = activeWuMarkerPath(cwd);
  if (existsSync(marker)) {
    const prev = readFileSync(marker, "utf8").trim();
    unlinkSync(marker);
    return {
      output: `nuos: cleared active work unit (was "${prev}")`,
      exitCode: 0,
    };
  }
  return {
    output: "nuos: no active work unit to clear",
    exitCode: 0,
  };
}

/**
 * `wu current` — print the current active WU handle or `(none)`.
 * Always exits 0; absence is not an error.
 */
export function cmdWuCurrent(opts: WuActiveOptions = {}): CommandResult {
  const cwd = opts.cwd ?? process.cwd();
  const marker = activeWuMarkerPath(cwd);
  if (existsSync(marker)) {
    const handle = readFileSync(marker, "utf8").trim();
    if (handle.length > 0) {
      return { output: handle, exitCode: 0 };
    }
  }
  return { output: "(none)", exitCode: 0 };
}
