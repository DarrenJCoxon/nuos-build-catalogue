#!/usr/bin/env bash
#
# NuOS Build Method — Claude Code PreToolUse hook (WU 136).
#
# Blocks Edit / Write / MultiEdit / NotebookEdit tool calls when:
#   (a) the target file is OUTSIDE the catalogue project root, AND
#   (b) no active work unit has been declared via `nuos-catalogue wu start <handle>`.
#
# Rationale
# ─────────
#   The existing git pre-commit hook (templates/hooks/pre-commit) catches
#   catalogue-side drift on commit. It does not see writes to sibling
#   implementation repos (sensight/, nuvector/, …) — those are different
#   git roots. So an agent can ship hours of substantive implementation
#   work across many sibling-repo files before any catalogue trace gets
#   recorded. This hook closes that gap at the earliest possible moment:
#   the file-write itself.
#
#   This is a soft-gate. The block is honest about what it is and how to
#   release it (declare the active WU). The catalogue stays in charge of
#   the project's discipline; the operator can override locally if a
#   one-off write is genuinely needed (see "Manual override" below).
#
# Behaviour
# ─────────
#   1. Read the tool-call JSON on stdin (Claude Code PreToolUse contract).
#   2. Extract `tool_input.file_path` or `tool_input.notebook_path`.
#      If neither is present (parse failure), exit 0 — never block on
#      ambiguous input.
#   3. Determine the catalogue project root via $CLAUDE_PROJECT_DIR, falling
#      back to `git rev-parse --show-toplevel` from cwd. If neither works,
#      exit 0 (degrade-safe).
#   4. Classify the target path:
#        — Inside the project root: ALLOW. Editing the catalogue itself
#          (work units, decisions, indexes, hooks, scripts) is the
#          catalogue trace — no WU declaration required.
#        — Outside the project root: this is sibling-repo implementation
#          work and requires a declared active WU.
#   5. For sibling-repo paths, check for an active-WU marker at
#      `$PROJECT_ROOT/.nuos-catalogue/active-wu`.
#        — Marker present (non-empty file): ALLOW. Log the touch with the
#          declared WU handle so the audit trail names the work.
#        — Marker absent or empty: BLOCK with exit 2 and a stderr message
#          telling the operator what was blocked, what's missing, and the
#          two commands to recover.
#
# Manual override
# ───────────────
#   If a write to a sibling repo is genuinely catalogue-orthogonal (e.g.
#   adjusting a personal dotfile, applying a hotfix unrelated to project
#   work), the operator can either:
#     (a) declare a temporary "ad-hoc" WU: `nuos-catalogue wu start adhoc`
#         then `nuos-catalogue wu end` when done. The audit log records
#         the touches under "adhoc" — visible at end-of-session.
#     (b) set NUOS_SKIP_IMPLEMENTATION_GATE=1 in the environment for that
#         single tool call. The block is bypassed and a STRONG warning is
#         emitted to stderr. The bypass is logged.
#
#   Bypass log lives at $PROJECT_ROOT/.nuos-enforcement.log alongside the
#   catalogue-write hook's audit trail.
#
# Exit codes
# ──────────
#   0 — allow (or degrade-safe)
#   2 — block (Claude Code surfaces stderr to the model)

set -uo pipefail

# ── Inputs ──────────────────────────────────────────────────────────────

INPUT="$(cat 2>/dev/null || true)"

# Project root: prefer the Claude-provided env var, fall back to git.
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-}"
if [[ -z "$PROJECT_ROOT" ]]; then
  PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
fi
if [[ -z "$PROJECT_ROOT" ]]; then exit 0; fi

LOG="$PROJECT_ROOT/.nuos-enforcement.log"

# Extract the target file path. Edit/Write use `file_path`; NotebookEdit
# uses `notebook_path`. MultiEdit also uses `file_path` (single root
# file for the batch).
FILE=$(printf '%s' "$INPUT" \
  | grep -oE '"(file_path|notebook_path)"[[:space:]]*:[[:space:]]*"[^"]+"' \
  | head -1 \
  | sed -E 's/.*"([^"]+)"$/\1/')

# Parse failure: degrade safe (never block on ambiguous input).
if [[ -z "${FILE:-}" ]]; then exit 0; fi

# ── Classify the target path ────────────────────────────────────────────

# Normalise: if the path is relative, treat it as relative to cwd. The
# tool always passes absolute paths in practice, but we guard regardless.
case "$FILE" in
  /*) ABSOLUTE_FILE="$FILE" ;;
  *)  ABSOLUTE_FILE="$(pwd)/$FILE" ;;
esac

# Trailing-slash-tolerant prefix match.
case "$ABSOLUTE_FILE/" in
  "$PROJECT_ROOT"/*) IS_INTERNAL=1 ;;
  *)                 IS_INTERNAL=0 ;;
esac

log_event() {
  printf '%s | %s | %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1" "$2" >> "$LOG" 2>/dev/null || true
}

# ── Internal write: always allowed ──────────────────────────────────────

if [[ "$IS_INTERNAL" == "1" ]]; then
  exit 0
fi

# ── Sibling-repo write: requires an active WU declaration ──────────────

# Manual override (escape hatch). Logged loudly.
if [[ "${NUOS_SKIP_IMPLEMENTATION_GATE:-}" == "1" ]]; then
  log_event "implementation-gate-bypassed" "$ABSOLUTE_FILE"
  printf '⚠ nuos: NUOS_SKIP_IMPLEMENTATION_GATE=1 — sibling-repo write allowed without a WU declaration.\n' >&2
  exit 0
fi

MARKER="$PROJECT_ROOT/.nuos-catalogue/active-wu"
ACTIVE_WU=""
if [[ -f "$MARKER" ]]; then
  ACTIVE_WU="$(head -n 1 "$MARKER" 2>/dev/null | tr -d '[:space:]')"
fi

if [[ -n "$ACTIVE_WU" ]]; then
  log_event "implementation-write-allowed[$ACTIVE_WU]" "$ABSOLUTE_FILE"
  exit 0
fi

# Block. Stderr is surfaced to the model.
log_event "implementation-write-blocked" "$ABSOLUTE_FILE"
cat >&2 <<EOF
✖ nuos: implementation write blocked (WU 136 gate).

   Target file: $ABSOLUTE_FILE
   Reason:      This path is OUTSIDE the catalogue project root
                ($PROJECT_ROOT)
                and no active work unit has been declared.

   Substantive implementation work in a sibling repo must trace to a
   catalogued work unit. Choose one of:

     1. Declare an existing WU as active for this session:
          nuos-catalogue wu start <handle>      e.g. wu start 136

     2. File a new WU first, then declare it active:
          nuos-catalogue wu create
          nuos-catalogue wu start <new-handle>

     3. When done, clear the marker:
          nuos-catalogue wu end

   Genuinely catalogue-orthogonal write? Set
   NUOS_SKIP_IMPLEMENTATION_GATE=1 to bypass for one call (logged to
   .nuos-enforcement.log for the audit trail).

EOF

exit 2
