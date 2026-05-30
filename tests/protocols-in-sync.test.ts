/**
 * Drift guard for the protocol fan-out.
 *
 * `templates/protocols/<slug>.md` is the single canonical source for every
 * protocol body. `init` / `install-protocols` render each body — with
 * tool-appropriate frontmatter — into all three supported tool paths:
 *   .claude/commands/<slug>.md      (Claude Code)
 *   .opencode/commands/<slug>.md    (OpenCode)
 *   .agents/skills/<slug>/SKILL.md  (Codex CLI)
 *
 * Those generated copies are committed (this repo dogfoods its own
 * protocols), so they can silently go stale when someone edits a canonical
 * body and forgets to re-run `install-protocols`. That exact drift is what
 * let a stale, divergent protocol be followed instead of the canonical one.
 *
 * This test reuses the installer's *own* render logic (TOOLS / PROTOCOL_FILES
 * exported from init.ts) and asserts every committed copy is byte-identical to
 * what the canonical body would render. If it fails, the fix is mechanical:
 *
 *     nuos-catalogue install-protocols   (or: node dist/cli.js install-protocols)
 *
 * Keeping this in the suite turns "remember to regenerate" into "the build
 * fails if you forget."
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROTOCOL_FILES, TOOLS } from '../src/commands/init.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROTOCOLS_DIR = path.join(REPO_ROOT, 'templates', 'protocols');

for (const protocolFile of PROTOCOL_FILES) {
  const slug = path.basename(protocolFile, '.md');
  for (const [toolName, tool] of Object.entries(TOOLS)) {
    const rel = tool.destPath(slug);
    test(`protocol '${slug}' is in sync for ${toolName} (${rel})`, async () => {
      const body = await readFile(path.join(PROTOCOLS_DIR, protocolFile), 'utf8');
      const expected = tool.render(slug, body);
      const actual = await readFile(path.join(REPO_ROOT, rel), 'utf8');
      assert.equal(
        actual,
        expected,
        `${rel} is stale relative to templates/protocols/${protocolFile}. ` +
          `Run \`nuos-catalogue install-protocols\` (or \`node dist/cli.js install-protocols\`) and commit the result.`
      );
    });
  }
}
