#!/usr/bin/env bash
#
# NuOS Build Method — Design System Compliance Hook (PreToolUse)
#
# Blocks Write / Edit / MultiEdit when:
#   (a) the target file is a UI file (.css, .scss, .less, .html, .tsx,
#       .jsx, .vue, .svelte, .astro), AND
#   (b) the written content contains hardcoded colour values (hex literals,
#       CSS named colours) in colour-property positions, AND
#   (c) the project has a design system at docs/build/design-system/
#
# Rationale
# ─────────
#   Agents write UI code without first reading the design system, producing
#   raw hex values that bypass the project's token contracts. The reviewer
#   agent catches this after the fact — but by then the coder has already
#   satisfied its acceptance criteria and treats the finding as "cleanup."
#   This hook closes the gap at the moment of writing: the write is blocked
#   and the agent is shown exactly where to look before it can retry.
#
# What is checked
# ───────────────
#   1. CSS/SCSS/Less: colour property with hardcoded hex literal
#        color: #fff       ← BLOCKED
#        --colour-x: #fff  ← allowed (token definition line; starts with --)
#        color: var(--x)   ← allowed
#   2. JSX/TSX: inline style object with hex string
#        color: '#1a2b3c'  ← BLOCKED
#   3. HTML: style attribute containing a hex colour
#        style="color: #fff"  ← BLOCKED
#
# Degrade-safe: if content cannot be reliably parsed (no jq or python3,
# or parse failure), the hook exits 0. Never block on ambiguous input.
#
# Exit codes
# ──────────
#   0 — allow (no violations, design system absent, or degrade-safe skip)
#   2 — block (stderr is surfaced to the model by Claude Code)

set -uo pipefail

INPUT="$(cat 2>/dev/null || true)"

# ── Project root ──────────────────────────────────────────────────────────────
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-}"
if [[ -z "$PROJECT_ROOT" ]]; then
  PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
fi
if [[ -z "$PROJECT_ROOT" ]]; then exit 0; fi

# ── Extract file path ─────────────────────────────────────────────────────────
FILE=$(printf '%s' "$INPUT" \
  | grep -oE '"(file_path|notebook_path)"[[:space:]]*:[[:space:]]*"[^"]+"' \
  | head -1 \
  | sed -E 's/"(file_path|notebook_path)"[[:space:]]*:[[:space:]]*"//' \
  | tr -d '"')

if [[ -z "${FILE:-}" ]]; then exit 0; fi

# Normalise to absolute path
case "$FILE" in
  /*) ABSOLUTE_FILE="$FILE" ;;
  *)  ABSOLUTE_FILE="$(pwd)/$FILE" ;;
esac

# ── Skip the design-system directory itself ───────────────────────────────────
if [[ "$ABSOLUTE_FILE" == *"/docs/build/design-system/"* ]]; then
  exit 0
fi

# Skip generated output directories
case "$ABSOLUTE_FILE" in
  */node_modules/*|*/dist/*|*/.next/*|*/build/*|*/.nuxt/*) exit 0 ;;
esac

# ── Only check UI file types ──────────────────────────────────────────────────
EXTENSION="${FILE##*.}"
case "$EXTENSION" in
  css|scss|less|html|tsx|jsx|vue|svelte|astro) : ;;
  *) exit 0 ;;
esac

# ── Find the design system ────────────────────────────────────────────────────
DS_DIR=""
if [[ -d "$PROJECT_ROOT/docs/build/design-system" ]]; then
  DS_DIR="$PROJECT_ROOT/docs/build/design-system"
else
  # Split-repo pattern: look for a sibling catalogue that owns the design system
  PARENT="$(dirname "$PROJECT_ROOT")"
  for sibling in "$PARENT"/*/docs/build/design-system; do
    if [[ -d "$sibling" ]]; then
      DS_DIR="$sibling"
      break
    fi
  done
fi

if [[ -z "$DS_DIR" ]]; then exit 0; fi

COLOUR_FILE="$DS_DIR/tokens-colour.md"
if [[ ! -f "$COLOUR_FILE" ]]; then exit 0; fi

# ── Extract the content being written ─────────────────────────────────────────
# Write  → tool_input.content
# Edit   → tool_input.new_string
# MultiEdit → tool_input.edits[].new_string (joined)
CONTENT=""
if command -v jq &>/dev/null; then
  CONTENT=$(printf '%s' "$INPUT" | jq -r '
    .tool_input.content //
    .tool_input.new_string //
    (.tool_input.edits // [] | map(.new_string // "") | join("\n")) //
    ""
  ' 2>/dev/null || true)
elif command -v python3 &>/dev/null; then
  CONTENT=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input', {})
    out = ti.get('content') or ti.get('new_string')
    if out is None:
        edits = ti.get('edits', [])
        out = '\n'.join(e.get('new_string', '') for e in edits)
    print(out or '')
except: pass
" 2>/dev/null || true)
fi

if [[ -z "${CONTENT:-}" ]]; then exit 0; fi

# ── Detect hardcoded colour violations ───────────────────────────────────────

# 1. CSS/SCSS/Less: colour property with a hex literal value.
#    Excludes lines that start with optional whitespace followed by '--'
#    (those are CSS custom property definitions — they SET the token value).
CSS_HEX=$(printf '%s' "$CONTENT" \
  | grep -E '(color|background(-color)?|border(-color)?|fill|stroke|outline(-color)?|accent-color)[[:space:]]*:[[:space:]]*#[0-9a-fA-F]{3,8}' \
  | grep -vE '^\s*--' \
  | grep -oE '(color|background(-color)?|border(-color)?|fill|stroke|outline(-color)?|accent-color)[[:space:]]*:[[:space:]]*#[0-9a-fA-F]{3,8}' \
  | head -3 || true)

# 2. JSX/TSX: inline style object with a hex colour string.
#    e.g. color: '#fff'  or  backgroundColor: "#1a2b3c"
JSX_HEX=$(printf '%s' "$CONTENT" \
  | grep -oE "(color|backgroundColor|borderColor|fill|stroke|outlineColor)[[:space:]]*:[[:space:]]*['\"]#[0-9a-fA-F]{3,8}" \
  | head -3 || true)

# 3. HTML: style attribute that contains a hex colour value.
HTML_HEX=$(printf '%s' "$CONTENT" \
  | grep -oE 'style=[^>]*#[0-9a-fA-F]{3,8}' \
  | head -3 || true)

if [[ -z "${CSS_HEX:-}" && -z "${JSX_HEX:-}" && -z "${HTML_HEX:-}" ]]; then
  exit 0
fi

# ── Build the violation summary ───────────────────────────────────────────────
VIOLATIONS=""
[[ -n "${CSS_HEX:-}" ]]  && VIOLATIONS="$VIOLATIONS
   CSS:  $(printf '%s' "$CSS_HEX" | head -1)"
[[ -n "${JSX_HEX:-}" ]]  && VIOLATIONS="$VIOLATIONS
   JSX:  $(printf '%s' "$JSX_HEX" | head -1)"
[[ -n "${HTML_HEX:-}" ]] && VIOLATIONS="$VIOLATIONS
   HTML: $(printf '%s' "$HTML_HEX" | head -1)"

# ── Read token excerpt for the error message ──────────────────────────────────
TOKEN_HINT=""
TOKEN_EXCERPT=$(grep -E '`colour\.' "$COLOUR_FILE" 2>/dev/null | head -12 || true)
if [[ -n "$TOKEN_EXCERPT" ]]; then
  TOKEN_HINT="
Available colour tokens (from $(basename "$DS_DIR")/tokens-colour.md):
$TOKEN_EXCERPT

  → Use the token name. Do NOT use the raw hex value."
fi

# ── Block ─────────────────────────────────────────────────────────────────────
cat >&2 <<EOF
✖ nuos: design-system compliance block — hardcoded colour values detected.

   File:       $FILE
   Violations:$VIOLATIONS

   ── Required action ──────────────────────────────────────────────────────────

   Before writing any UI file you MUST:

     1. Read the full design system:
          $DS_DIR/tokens-colour.md
          $DS_DIR/tokens-typography.md
          $DS_DIR/tokens-spacing.md
          $DS_DIR/tokens-radius-elevation.md

     2. Identify how this project references tokens by reading existing UI
        files in the codebase — look for one of these patterns:
          CSS custom properties:  color: var(--colour-text-primary);
          JSX theme object:       color: theme.colour.text.primary
          Tailwind config tokens: text-text-primary (if configured)

     3. Replace EVERY hardcoded hex or named colour with the correct token
        reference. If no token covers the value you need, STOP and surface
        the gap to the coordinator — do NOT invent a one-off value.

   This hook will block every write that contains a raw colour value.
   The design system is the contract; the implementation must honour it.
$TOKEN_HINT

EOF

exit 2
