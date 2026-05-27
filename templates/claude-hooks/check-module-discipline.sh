#!/usr/bin/env bash
#
# NuOS Build Method — Deep-Module Discipline Hook (PreToolUse)
#
# Blocks Write / Edit / MultiEdit / NotebookEdit when:
#   (a) the target file is a source file under a recognised source tree,
#       AND
#   (b) the catalogue has an architecture register at
#       docs/build/architecture/ with at least one module filed, AND
#   (c) the target path is NOT claimed by any module's `## Paths claimed`
#       block.
#
# Rationale
# ─────────
#   The catalogue's value over a long build depends on the project staying
#   built from DEEP modules — small interface, large hidden body. The most
#   reliable failure mode is an agent quietly creating a shallow module
#   mid-implementation: a new `src/foo/` directory, a `utils.ts`, a thin
#   wrapper "to keep things tidy." Once written, these are permanent —
#   every later WU builds against them and un-splitting them is too costly
#   to ever happen.
#
#   The /wu-new intake gate and the /build-wu architectural quality gate
#   are the conversational defences. This hook is the mechanical one. It
#   reads the architecture register to learn which source paths are
#   claimed by which module, and blocks any write to an unclaimed source
#   path. The agent's only recovery path is to (a) extend the relevant
#   module's `Paths claimed`, or (b) propose a new module via the
#   architect (which itself must justify depth before it can claim paths).
#
#   Doctrine: docs/philosophy/deep-modules.md
#
# Degrade-safe behaviour
# ──────────────────────
#   The hook exits 0 (allow) without enforcement when:
#     • CLAUDE_PROJECT_DIR is unset and no git root is detectable
#     • the architecture register does not exist
#     • the architecture register exists but contains no module files
#       (only _index.md / module-template.md — project is pre-architecture)
#     • the target file is not a source file (configs, docs, scripts, tests)
#     • the target file lives inside the catalogue itself
#     • the JSON tool input cannot be parsed
#     • jq and python3 are both unavailable
#
#   "Better to wave a violation through than to block a legitimate write
#   the operator did not anticipate" — the conversational gates catch
#   most things; this hook is the safety net, not the only defence.
#
# Override
# ────────
#   Set NUOS_SKIP_MODULE_DISCIPLINE=1 in the environment for one tool call
#   to bypass. Logged to .nuos-enforcement.log for the audit trail.
#
# Exit codes
# ──────────
#   0 — allow (or degrade-safe)
#   2 — block (Claude Code surfaces stderr to the model)

set -uo pipefail

INPUT="$(cat 2>/dev/null || true)"

# ── Project root ──────────────────────────────────────────────────────────────
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-}"
if [[ -z "$PROJECT_ROOT" ]]; then
  PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
fi
if [[ -z "$PROJECT_ROOT" ]]; then exit 0; fi

LOG="$PROJECT_ROOT/.nuos-enforcement.log"

log_event() {
  printf '%s | %s | %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1" "$2" >> "$LOG" 2>/dev/null || true
}

# ── Override ──────────────────────────────────────────────────────────────────
if [[ "${NUOS_SKIP_MODULE_DISCIPLINE:-}" == "1" ]]; then
  log_event "module-discipline-bypassed" "${PWD}"
  printf '⚠ nuos: NUOS_SKIP_MODULE_DISCIPLINE=1 — module-discipline check skipped.\n' >&2
  exit 0
fi

# ── Extract file path ─────────────────────────────────────────────────────────
FILE=$(printf '%s' "$INPUT" \
  | grep -oE '"(file_path|notebook_path)"[[:space:]]*:[[:space:]]*"[^"]+"' \
  | head -1 \
  | sed -E 's/"(file_path|notebook_path)"[[:space:]]*:[[:space:]]*"//' \
  | tr -d '"')

if [[ -z "${FILE:-}" ]]; then exit 0; fi

# Normalise to absolute
case "$FILE" in
  /*) ABSOLUTE_FILE="$FILE" ;;
  *)  ABSOLUTE_FILE="$(pwd)/$FILE" ;;
esac

# ── Skip the catalogue itself ─────────────────────────────────────────────────
# Writes inside docs/build/, docs/philosophy/, docs/guides/, docs/contracts/,
# .claude/, .agents/, .opencode/, templates/, scripts/ etc. are catalogue
# work — never module-implementation work.
case "$ABSOLUTE_FILE" in
  */docs/*|*/.claude/*|*/.agents/*|*/.opencode/*|*/.nuos-catalogue/*|*/CLAUDE.md|*/README.md|*/CHANGELOG.md)
    exit 0 ;;
esac

# Skip common non-source paths
case "$ABSOLUTE_FILE" in
  */node_modules/*|*/dist/*|*/.next/*|*/build/*|*/.nuxt/*|*/coverage/*|*/.git/*|*/.turbo/*|*/.vercel/*)
    exit 0 ;;
  */tests/*|*/test/*|*/__tests__/*|*/e2e/*|*/spec/*|*/__mocks__/*|*/fixtures/*)
    exit 0 ;;
  */scripts/*|*/bin/*|*/migrations/*|*/seed/*|*/seeds/*)
    exit 0 ;;
  */public/*|*/static/*|*/assets/*)
    exit 0 ;;
esac

# Skip non-source file types
case "$ABSOLUTE_FILE" in
  *.test.ts|*.test.tsx|*.test.js|*.test.jsx|*.test.mjs|*.test.cjs)
    exit 0 ;;
  *.spec.ts|*.spec.tsx|*.spec.js|*.spec.jsx|*.spec.mjs|*.spec.cjs)
    exit 0 ;;
  *.d.ts|*.config.ts|*.config.js|*.config.mjs|*.config.cjs)
    exit 0 ;;
  *.json|*.yaml|*.yml|*.toml|*.ini|*.env|*.md|*.txt|*.lock|*.sum|*.mod)
    exit 0 ;;
  *.png|*.jpg|*.jpeg|*.gif|*.svg|*.ico|*.webp|*.avif|*.woff|*.woff2|*.ttf|*.otf|*.eot)
    exit 0 ;;
  *.sh|*.bash|*.zsh|*.fish|*.ps1|*.bat|*.cmd)
    exit 0 ;;
  *.lock|*Dockerfile*|*.dockerignore|*.gitignore|*.gitattributes|*.npmignore)
    exit 0 ;;
esac

# Only enforce on these source extensions
EXTENSION="${ABSOLUTE_FILE##*.}"
case "$EXTENSION" in
  ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|cs|c|cpp|cc|h|hpp|php|ex|exs|erl|hs|ml|scala|clj|elm) : ;;
  vue|svelte|astro) : ;;
  *) exit 0 ;;
esac

# ── Find the architecture register ────────────────────────────────────────────
ARCH_DIR=""
if [[ -d "$PROJECT_ROOT/docs/build/architecture" ]]; then
  ARCH_DIR="$PROJECT_ROOT/docs/build/architecture"
else
  # Split-repo pattern: look for a sibling catalogue
  PARENT="$(dirname "$PROJECT_ROOT")"
  for sibling in "$PARENT"/*/docs/build/architecture; do
    if [[ -d "$sibling" ]]; then
      ARCH_DIR="$sibling"
      break
    fi
  done
fi

# No architecture register → project is pre-architecture; degrade-safe.
if [[ -z "$ARCH_DIR" ]]; then exit 0; fi

# Collect module files (everything except _index.md and module-template.md).
shopt -s nullglob
MODULE_FILES=()
for f in "$ARCH_DIR"/*.md; do
  base="$(basename "$f")"
  case "$base" in
    _index.md|module-template.md) continue ;;
  esac
  MODULE_FILES+=("$f")
done
shopt -u nullglob

# No modules filed yet → degrade-safe.
if [[ ${#MODULE_FILES[@]} -eq 0 ]]; then exit 0; fi

# ── Compute the target's path relative to its repo root ───────────────────────
# In-repo case: relative to PROJECT_ROOT.
# Sibling-repo case: relative to the sibling's git toplevel.
TARGET_REPO_ROOT=""
case "$ABSOLUTE_FILE/" in
  "$PROJECT_ROOT"/*)
    TARGET_REPO_ROOT="$PROJECT_ROOT" ;;
  *)
    # Resolve the sibling repo root by asking git from the file's directory.
    TARGET_DIR="$(dirname "$ABSOLUTE_FILE")"
    if [[ -d "$TARGET_DIR" ]]; then
      TARGET_REPO_ROOT="$(git -C "$TARGET_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
    fi
    ;;
esac

# Couldn't resolve a repo root for the target → degrade-safe.
if [[ -z "$TARGET_REPO_ROOT" ]]; then exit 0; fi

# Strip the repo root prefix → relative path.
RELATIVE_TARGET="${ABSOLUTE_FILE#$TARGET_REPO_ROOT/}"

# If stripping didn't change anything, we couldn't compute a relative path.
if [[ "$RELATIVE_TARGET" == "$ABSOLUTE_FILE" ]]; then exit 0; fi

# Repo-root-level files (no directory) are never source modules.
case "$RELATIVE_TARGET" in
  */*) : ;;
  *) exit 0 ;;
esac

# ── Extract all claimed paths from every module file ──────────────────────────
# A module file's "Paths claimed" section looks like:
#
#   ## Paths claimed
#
#   > *Required. List the source-tree paths...*
#
#   - `src/auth/`
#   - `apps/web/src/auth/**`
#
# We collect every bullet-list entry under that heading, stripping
# backticks, quotes, and trailing glob/slash suffixes to derive a prefix
# we can match against.

extract_claims() {
  local file="$1"
  awk '
    BEGIN { in_section = 0 }
    /^## Paths claimed/ { in_section = 1; next }
    /^## / && in_section { in_section = 0 }
    in_section {
      # bullet line: leading - or * followed by content
      if (match($0, /^[[:space:]]*[-*][[:space:]]+/)) {
        line = substr($0, RSTART + RLENGTH)
        # strip blockquote markers / italics that may leak from template hints
        gsub(/^[[:space:]]*\*[[:space:]]*/, "", line)
        # take only the first backticked token if present, else first whitespace-free token
        if (match(line, /`[^`]+`/)) {
          token = substr(line, RSTART + 1, RLENGTH - 2)
        } else {
          # first whitespace-delimited token
          n = split(line, parts, /[[:space:]]+/)
          token = parts[1]
        }
        # ignore template placeholders like [module-slug]
        if (token ~ /^\[/) next
        if (token == "") next
        print token
      }
    }
  ' "$file"
}

CLAIMS=()
CLAIM_OWNERS=()  # parallel array: which module file each claim came from
for mf in "${MODULE_FILES[@]}"; do
  while IFS= read -r claim; do
    [[ -z "$claim" ]] && continue
    CLAIMS+=("$claim")
    CLAIM_OWNERS+=("$(basename "$mf" .md)")
  done < <(extract_claims "$mf")
done

# No claims declared anywhere → degrade-safe (modules exist but none have
# populated Paths claimed yet — treat as still bootstrapping).
if [[ ${#CLAIMS[@]} -eq 0 ]]; then exit 0; fi

# ── Match target against claims ──────────────────────────────────────────────
# Normalise a claim into a prefix: strip leading `./`, trailing `/**`,
# `/*`, or `/`. Match if RELATIVE_TARGET starts with the prefix followed
# by `/` or equals the prefix exactly.

normalise_claim() {
  local c="$1"
  c="${c#./}"
  c="${c%/}"
  c="${c%/\*\*}"
  c="${c%/\*}"
  printf '%s' "$c"
}

MATCHED=0
for claim in "${CLAIMS[@]}"; do
  prefix="$(normalise_claim "$claim")"
  [[ -z "$prefix" ]] && continue
  if [[ "$RELATIVE_TARGET" == "$prefix" || "$RELATIVE_TARGET" == "$prefix"/* ]]; then
    MATCHED=1
    break
  fi
done

if [[ "$MATCHED" == "1" ]]; then
  exit 0
fi

# ── Block ─────────────────────────────────────────────────────────────────────
log_event "module-discipline-blocked" "$ABSOLUTE_FILE"

# Build the "available modules" summary for the error message.
MODULE_SUMMARY=""
for mf in "${MODULE_FILES[@]}"; do
  slug="$(basename "$mf" .md)"
  # Pull the first non-blank line under "## What this module does".
  desc=$(awk '
    BEGIN { in_section = 0; printed = 0 }
    /^## What this module does/ { in_section = 1; next }
    /^## / && in_section { exit }
    in_section && printed == 0 && NF > 0 && $0 !~ /^>/ {
      print
      printed = 1
      exit
    }
  ' "$mf" 2>/dev/null | head -c 140)
  MODULE_SUMMARY+="
     • $slug — ${desc:-(no summary)}"
done

cat >&2 <<EOF
✖ nuos: deep-module discipline block — unclaimed source path.

   Target file:   $RELATIVE_TARGET
   (resolved to:  $ABSOLUTE_FILE)

   This path is not claimed by any module in
   $ARCH_DIR

   The doctrine: every source file lives inside a deep module that
   explicitly claims it under '## Paths claimed' in its architecture
   file. New unclaimed source paths are the failure mode that creates
   shallow modules (util grab-bags, pass-through wrappers, premature
   splits). See docs/philosophy/deep-modules.md.

   Modules currently filed:$MODULE_SUMMARY

   ── Required action ──────────────────────────────────────────────────────────

   Pick one:

     1. The work belongs in an EXISTING module above. Open that
        module's architecture file and add the path under
        '## Paths claimed', then retry the write.

     2. The work is genuinely a NEW deep module. STOP this write.
        Run the architect to propose the module (interface surface,
        hidden complexity, depth justification, paths claimed),
        file docs/build/architecture/<slug>.md from
        module-template.md, THEN retry.

   Never: invent a name like 'utils', 'helpers', 'common', 'shared',
   'lib', or 'misc' to bypass this gate — those are shallow-module
   patterns and will be rejected by the architectural quality gate.

   Override (logged): NUOS_SKIP_MODULE_DISCIPLINE=1 for one call.

EOF

exit 2
