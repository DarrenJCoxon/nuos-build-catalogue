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

# ---- Ensure nuos-catalogue CLI is installed --------------------------------
#
# The CLI is a global npm tool with no presence in any package.json — it
# disappears silently when global packages are cleared. Install it here so
# the build memory system is always ready after a post-clone setup run.

if ! command -v nuos-catalogue &>/dev/null; then
  echo "▶ nuos-catalogue not found — installing @nusoft/nuos-build-catalogue globally..."
  npm install -g @nusoft/nuos-build-catalogue
  echo "✓ nuos-catalogue installed"
else
  echo "✓ nuos-catalogue present ($(nuos-catalogue --version 2>/dev/null | head -1 || echo 'version unknown'))"
fi
echo

# ---- Patch ~/.claude/settings.json with the Playwright singleton hook ------
#
# Each VS Code Claude Code window spawns its own playwright-mcp process. They
# all share one Chrome profile, and Chrome's singleton lock means only the first
# one to open Chrome succeeds — every later session gets "browser already in use".
# This PreToolUse hook kills the locked Chrome before each browser_navigate so
# the current session always gets a clean launch.

CLAUDE_SETTINGS="$HOME/.claude/settings.json"
PLAYWRIGHT_HOOK_MARKER="mcp__plugin_playwright_playwright__browser_navigate"

if [[ -f "$CLAUDE_SETTINGS" ]] && ! grep -q "$PLAYWRIGHT_HOOK_MARKER" "$CLAUDE_SETTINGS"; then
  echo "▶ Patching ~/.claude/settings.json with Playwright singleton hook..."
  node -e "
    const fs = require('fs');
    const path = '$CLAUDE_SETTINGS';
    const settings = JSON.parse(fs.readFileSync(path, 'utf8'));
    settings.hooks = settings.hooks || {};
    settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];
    const alreadySet = settings.hooks.PreToolUse.some(h => h.matcher === '$PLAYWRIGHT_HOOK_MARKER');
    if (!alreadySet) {
      settings.hooks.PreToolUse.push({
        matcher: '$PLAYWRIGHT_HOOK_MARKER',
        hooks: [{
          type: 'command',
          command: \"pkill -f 'user-data-dir.*mcp-chrome' 2>/dev/null; sleep 0.5; exit 0\",
          timeout: 5,
          statusMessage: 'Clearing stale Playwright browser...'
        }]
      });
      fs.writeFileSync(path, JSON.stringify(settings, null, 2) + '\n');
      console.log('✓ Playwright singleton hook added');
    } else {
      console.log('✓ Playwright singleton hook already present');
    }
  "
elif [[ ! -f "$CLAUDE_SETTINGS" ]]; then
  echo "⚠ ~/.claude/settings.json not found — skipping Playwright hook patch (Claude Code not installed?)"
else
  echo "✓ Playwright singleton hook already present in ~/.claude/settings.json"
fi
echo

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
