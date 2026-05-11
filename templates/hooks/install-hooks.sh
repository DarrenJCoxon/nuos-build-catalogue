#!/usr/bin/env bash
#
# Install the catalogue's git hooks into .git/hooks/.
#
# Why this script (not husky):
#   The nuos repo is a markdown catalogue, not an npm package. Adding a
#   package.json + node_modules just to install hooks would be infrastructure
#   tax for what is otherwise a doc repo. A small bash installer copies the
#   hooks from the version-controlled scripts/hooks/ into .git/hooks/.
#
# Usage:
#   bash scripts/install-hooks.sh
#
# Re-run any time scripts/hooks/ changes; the installer is idempotent.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SOURCE="$REPO_ROOT/scripts/hooks"
TARGET="$REPO_ROOT/.git/hooks"

if [[ ! -d "$SOURCE" ]]; then
  echo "✖ scripts/hooks/ not found; nothing to install" >&2
  exit 1
fi

mkdir -p "$TARGET"

installed=0
for hook in "$SOURCE"/*; do
  name="$(basename "$hook")"
  cp "$hook" "$TARGET/$name"
  chmod +x "$TARGET/$name"
  installed=$((installed + 1))
done

echo "✓ installed $installed hook(s) into .git/hooks/"
echo
echo "Active rules (WU 111 enforcement):"
echo "  • index-drift detection (work-units, decisions, open-questions, risks)"
echo "  • active-decision modification BLOCK (was warning under WU 128 light-touch)"
echo
echo "To verify the install: \`git hook list\` (git ≥2.36) or \`ls .git/hooks/\`"
echo "To uninstall: \`rm .git/hooks/pre-commit\`"
