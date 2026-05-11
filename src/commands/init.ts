/**
 * `nuos-catalogue init` — bootstrap a new project's catalogue.
 *
 * Single command that does what was previously a six-step manual scaffold:
 *   1. mkdir docs/build/ + copy starter-kit content
 *   2. Substitute {{PROJECT_NAME}} / {{PROJECT_TAGLINE}} / {{TODAY}} in
 *      STATE.md and methodfile.json
 *   3. Fan the four protocols out to ALL THREE supported AI coding tools:
 *      Claude Code (.claude/commands/<n>.md), OpenCode
 *      (.opencode/commands/<n>.md), and Codex CLI
 *      (.agents/skills/<n>/SKILL.md). Each tool reads commands from a
 *      different path with slightly different frontmatter; the body is
 *      identical across all three. We write to all three by default — the
 *      files are tiny and harmless if a tool is unused. A consumer of
 *      this catalogue on any of the three tools gets working slash
 *      commands without extra configuration.
 *   4. Append a "Build catalogue (NuOS Build Method)" section to
 *      CLAUDE.md (creating it if missing; preserving existing content)
 *   5. Update .gitignore: !docs/build/ override (if `build/` is present
 *      anywhere, the catalogue would otherwise be silently ignored —
 *      same gotcha caught at nuos Session 53); ignore .nuos-catalogue/
 *      per D047
 *   6. Run a first migrate to verify
 *
 * Companion command: `install-protocols` refreshes just step 3 from the
 * canonical bodies bundled in this CLI package, also fanning out to all
 * three tool paths.
 */

import { mkdir, readFile, writeFile, readdir, stat, access } from 'node:fs/promises';
import { existsSync, constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Prompt } from './prompt.js';
import { askUntilValid, validate } from './prompt.js';

const __filename = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const TEMPLATES_ROOT = path.resolve(PACKAGE_ROOT, 'templates');

export interface InitOptions {
  /** Target project root (default: cwd). */
  cwd?: string;
  /** Pre-supplied values; if any are missing, the prompt fills them in. */
  name?: string;
  tagline?: string;
  domain?: string;
  role?: string;
  /** When true, runs all steps without prompts (uses defaults / supplied values). */
  nonInteractive?: boolean;
}

export interface InitResult {
  output: string;
  exitCode: number;
}

const PROTOCOL_FILES = [
  'start-of-session.md',
  'end-of-session.md',
  'wu-new.md',
  'persona-new.md',
] as const;

/**
 * One-line descriptions used in the frontmatter of installed protocol
 * files. Tools surface this text in their command list, so it should
 * read as an imperative summary.
 */
const PROTOCOL_DESCRIPTIONS: Record<string, string> = {
  'start-of-session': 'Read STATE, last session log, active WU; surface next action',
  'end-of-session': 'Write session log, update STATE + indices, move ✅ WUs to done/, commit',
  'wu-new': 'Create a new work unit with the six-field outcome shape (per D046)',
  'persona-new': 'Create a new P-NNN persona with the seven dimensions and acid-test (per D046)',
};

/**
 * The three AI coding tools the catalogue supports. Each tool reads
 * project-level commands from a different path with a slightly different
 * frontmatter shape. The body itself is identical across all three.
 *
 * The bundled `templates/protocols/<slug>.md` files are raw bodies (no
 * frontmatter); `renderForTool` adds tool-appropriate frontmatter.
 */
type ToolSlug = 'claude' | 'opencode' | 'codex';

interface ToolTarget {
  /** Tool's display name (for logs). */
  label: string;
  /** Path relative to project root, given a protocol slug. */
  destPath: (slug: string) => string;
  /** Render the file content given the slug and the raw body. */
  render: (slug: string, body: string) => string;
}

const TOOLS: Record<ToolSlug, ToolTarget> = {
  claude: {
    label: 'Claude Code',
    destPath: (slug) => path.join('.claude', 'commands', `${slug}.md`),
    render: (slug, body) => withFrontmatter({ description: PROTOCOL_DESCRIPTIONS[slug] ?? '' }, body),
  },
  opencode: {
    label: 'OpenCode',
    destPath: (slug) => path.join('.opencode', 'commands', `${slug}.md`),
    render: (slug, body) => withFrontmatter({ description: PROTOCOL_DESCRIPTIONS[slug] ?? '' }, body),
  },
  codex: {
    label: 'Codex CLI',
    destPath: (slug) => path.join('.agents', 'skills', slug, 'SKILL.md'),
    render: (slug, body) =>
      withFrontmatter({ name: slug, description: PROTOCOL_DESCRIPTIONS[slug] ?? '' }, body),
  },
};

function withFrontmatter(fields: Record<string, string>, body: string): string {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) lines.push(`${k}: ${v}`);
  lines.push('---', '', '');
  return lines.join('\n') + body;
}

export async function cmdInit(prompt: Prompt, options: InitOptions = {}): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd();
  const today = new Date().toISOString().slice(0, 10);

  // Refuse if docs/build/ already exists — this is a one-shot bootstrap.
  if (existsSync(path.join(cwd, 'docs', 'build'))) {
    return {
      output: `nuos-catalogue init: docs/build/ already exists at ${cwd}. Refusing to clobber. If you want to refresh the protocols only, use \`nuos-catalogue install-protocols\` instead.`,
      exitCode: 1,
    };
  }

  // Verify templates are bundled with this CLI install.
  if (!existsSync(TEMPLATES_ROOT)) {
    return {
      output: `nuos-catalogue init: bundled templates not found at ${TEMPLATES_ROOT}. The CLI install is incomplete; reinstall the package.`,
      exitCode: 1,
    };
  }

  // Gather inputs.
  const projectDefault = path.basename(cwd);
  let name = options.name;
  let tagline = options.tagline;
  let domain = options.domain;
  let role = options.role;

  if (!options.nonInteractive) {
    prompt.print('Initialising a NuOS Build Method catalogue.');
    prompt.print('');
    if (!name) {
      name = await askUntilValid(
        prompt,
        `Project name [${projectDefault}]: `,
        (v) => (v.trim().length === 0 ? null : null) // empty allowed; default applied below
      );
      if (!name.trim()) name = projectDefault;
    }
    if (!tagline) {
      tagline = await askUntilValid(
        prompt,
        'One-sentence tagline (what this project is): ',
        (v) => validate.nonEmpty(v, 'tagline')
      );
    }
    if (!domain) {
      domain = (await prompt.ask('Domain (e.g. example.com; empty for none): ')).trim() || 'n/a';
    }
    if (!role) {
      role = await prompt.askChoice('Project role?', ['consumer', 'standalone', 'harness']);
    }
    const confirm = await prompt.confirm(
      `About to create docs/build/, methodfile.json, .claude/commands/<protocols>, append to CLAUDE.md, update .gitignore, and run first migrate. Proceed?`,
      true
    );
    if (!confirm) {
      return { output: 'init cancelled by operator.', exitCode: 1 };
    }
  } else {
    if (!name) name = projectDefault;
    if (!tagline) tagline = '';
    if (!domain) domain = 'n/a';
    if (!role) role = 'consumer';
  }

  const subs: Record<string, string> = {
    '{{PROJECT_NAME}}': name,
    '{{PROJECT_TAGLINE}}': tagline,
    '{{PROJECT_DOMAIN}}': domain,
    '{{PROJECT_ROLE}}': role,
    '{{TODAY}}': today,
  };

  const log: string[] = [];
  const log_line = (msg: string) => {
    log.push(msg);
    prompt.print(msg);
  };

  // Step 1: docs/build/ scaffold from starter-kit
  log_line('  · creating docs/build/ from bundled starter-kit');
  await copyDirWithSubstitution(
    path.join(TEMPLATES_ROOT, 'starter-kit', 'docs', 'build'),
    path.join(cwd, 'docs', 'build'),
    subs
  );

  // Step 2: methodfile.json at repo root
  log_line('  · writing methodfile.json at repo root');
  const methodfileSrc = await readFile(
    path.join(TEMPLATES_ROOT, 'starter-kit', 'methodfile.json'),
    'utf8'
  );
  await writeFile(path.join(cwd, 'methodfile.json'), substitute(methodfileSrc, subs), 'utf8');

  // Step 3: fan protocols out to all three supported AI coding tools.
  // Each tool reads project-level commands from its own path; we install
  // to all three by default so users on any of Claude Code / OpenCode /
  // Codex CLI get working slash commands without extra configuration.
  for (const protocolFile of PROTOCOL_FILES) {
    const slug = path.basename(protocolFile, '.md');
    const body = await readFile(path.join(TEMPLATES_ROOT, 'protocols', protocolFile), 'utf8');
    for (const tool of Object.values(TOOLS)) {
      const dest = path.join(cwd, tool.destPath(slug));
      const existed = existsSync(dest);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, tool.render(slug, body), 'utf8');
      log_line(`  · ${existed ? 'overwrote' : 'installed'} ${tool.destPath(slug)} (${tool.label})`);
    }
  }

  // Step 3b: install the git hooks (pre-commit enforcement + post-commit
  // auto-reindex). Two source files land in scripts/hooks/ so the consumer
  // has the version-controlled source-of-truth; copies are pushed into
  // .git/hooks/ so they fire immediately without the user re-running an
  // installer.
  await installHooks(cwd, log_line);

  // Step 4: CLAUDE.md
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  const catalogueSection = renderCatalogueSection(name);
  if (existsSync(claudeMdPath)) {
    const existing = await readFile(claudeMdPath, 'utf8');
    if (existing.includes('## Build catalogue (NuOS Build Method)')) {
      log_line('  · CLAUDE.md already mentions the catalogue; not appending');
    } else {
      const trailing = existing.endsWith('\n') ? '' : '\n';
      await writeFile(claudeMdPath, `${existing}${trailing}\n${catalogueSection}\n`, 'utf8');
      log_line('  · appended Build catalogue section to CLAUDE.md');
    }
  } else {
    const stub = `# ${name} — Project Bootstrap\n\n${catalogueSection}\n`;
    await writeFile(claudeMdPath, stub, 'utf8');
    log_line('  · created CLAUDE.md with Build catalogue section');
  }

  // Step 5: .gitignore
  const gitignorePath = path.join(cwd, '.gitignore');
  await ensureGitignoreEntries(gitignorePath, log_line);

  prompt.print('');
  prompt.print(`✅ Catalogue initialised at ${path.join(cwd, 'docs/build')}`);
  prompt.print('');
  prompt.print('Next steps:');
  prompt.print('  1. Set env vars in your shell profile so the CLI knows where this catalogue lives:');
  prompt.print(`       export NUOS_CATALOGUE_BUILD_ROOT="${path.join(cwd, 'docs/build')}"`);
  prompt.print(`       export NUOS_CATALOGUE_WORKFLOWS="${path.join(cwd, '.nuos-catalogue/workflows.json')}"`);
  prompt.print('  2. Edit docs/build/STATE.md to describe the actual current state of this project.');
  prompt.print('  3. File the first WU: `nuos-catalogue wu create`');
  prompt.print('');
  prompt.print('To refresh protocols only later (without re-running init): `nuos-catalogue install-protocols`');

  return { output: '', exitCode: 0 };
}

// ---------------------------------------------------------------------------
// install-protocols — refresh just step 3 from the bundled canonical
// ---------------------------------------------------------------------------

export interface InstallProtocolsOptions {
  cwd?: string;
}

export async function cmdInstallProtocols(
  prompt: Prompt,
  options: InstallProtocolsOptions = {}
): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd();
  if (!existsSync(TEMPLATES_ROOT)) {
    return {
      output: `nuos-catalogue install-protocols: bundled templates not found at ${TEMPLATES_ROOT}.`,
      exitCode: 1,
    };
  }

  const lines: string[] = [];
  for (const protocolFile of PROTOCOL_FILES) {
    const slug = path.basename(protocolFile, '.md');
    const body = await readFile(path.join(TEMPLATES_ROOT, 'protocols', protocolFile), 'utf8');
    for (const tool of Object.values(TOOLS)) {
      const dest = path.join(cwd, tool.destPath(slug));
      const rendered = tool.render(slug, body);
      let action: 'created' | 'updated' | 'unchanged' = 'created';
      if (existsSync(dest)) {
        const destContent = await readFile(dest, 'utf8');
        action = destContent === rendered ? 'unchanged' : 'updated';
      }
      if (action !== 'unchanged') {
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, rendered, 'utf8');
      }
      lines.push(`  ${action.padEnd(10)} ${tool.destPath(slug)}`);
    }
  }
  prompt.print(`Refreshing protocols (Claude Code / OpenCode / Codex CLI):`);
  for (const l of lines) prompt.print(l);

  // Refresh hooks too — same idempotent shape.
  prompt.print('');
  prompt.print(`Refreshing git hooks (pre-commit enforcement, post-commit auto-reindex):`);
  await installHooks(cwd, (msg) => prompt.print(msg));

  return { output: '', exitCode: 0 };
}

// ---------------------------------------------------------------------------
// installHooks — copy bundled hook sources into the consumer + activate them
// ---------------------------------------------------------------------------

/**
 * Bundled hooks ship in templates/hooks/. Two source files (pre-commit,
 * post-commit) land in the consumer's scripts/hooks/ so the maintainer
 * has the version-controlled source. Copies also land in .git/hooks/ so
 * they fire immediately. The bash install-hooks.sh script also lands in
 * scripts/ so re-running it after a fresh clone reconstitutes .git/hooks/.
 *
 * Idempotent: byte-identical sources are skipped silently. Permissions
 * are set executable on every install so a chmod isn't required.
 */
async function installHooks(
  cwd: string,
  log_line: (msg: string) => void
): Promise<void> {
  const hooksTemplatesRoot = path.join(TEMPLATES_ROOT, 'hooks');
  if (!existsSync(hooksTemplatesRoot)) {
    log_line('  · (hooks bundle not present in this CLI install — skipping)');
    return;
  }

  // 1) Source-of-truth files in <cwd>/scripts/
  const scriptsDir = path.join(cwd, 'scripts');
  const scriptsHooksDir = path.join(scriptsDir, 'hooks');
  await mkdir(scriptsHooksDir, { recursive: true });

  const hookFiles = ['pre-commit', 'post-commit'] as const;
  for (const name of hookFiles) {
    const src = path.join(hooksTemplatesRoot, name);
    const dest = path.join(scriptsHooksDir, name);
    await writeHookFile(src, dest, log_line, `  · `, `scripts/hooks/${name}`);
  }

  // install-hooks.sh — convenience bash installer; sits next to scripts/hooks/
  const installerSrc = path.join(hooksTemplatesRoot, 'install-hooks.sh');
  const installerDest = path.join(scriptsDir, 'install-hooks.sh');
  await writeHookFile(installerSrc, installerDest, log_line, `  · `, `scripts/install-hooks.sh`);

  // 2) Active copies in <cwd>/.git/hooks/ — only if .git/ exists. Some
  // tests run init in a non-git directory; that's fine, skip the active
  // install and let the user run install-hooks.sh later.
  const gitHooksDir = path.join(cwd, '.git', 'hooks');
  if (!existsSync(path.join(cwd, '.git'))) {
    log_line(`  · (no .git/ found at ${cwd} — skipping active hook install; run scripts/install-hooks.sh after \`git init\`)`);
    return;
  }
  await mkdir(gitHooksDir, { recursive: true });
  for (const name of hookFiles) {
    const src = path.join(hooksTemplatesRoot, name);
    const dest = path.join(gitHooksDir, name);
    await writeHookFile(src, dest, log_line, `  · `, `.git/hooks/${name}`);
  }
}

async function writeHookFile(
  src: string,
  dest: string,
  log_line: (msg: string) => void,
  prefix: string,
  label: string
): Promise<void> {
  const srcContent = await readFile(src, 'utf8');
  let action: 'created' | 'updated' | 'unchanged' = 'created';
  if (existsSync(dest)) {
    const destContent = await readFile(dest, 'utf8');
    action = destContent === srcContent ? 'unchanged' : 'updated';
  }
  if (action !== 'unchanged') {
    await writeFile(dest, srcContent, 'utf8');
  }
  // chmod +x — required for git to actually run them
  const { chmod } = await import('node:fs/promises');
  await chmod(dest, 0o755);
  log_line(`${prefix}${action} ${label}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function substitute(content: string, subs: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(subs)) {
    result = result.split(key).join(value);
  }
  return result;
}

async function copyDirWithSubstitution(
  src: string,
  dest: string,
  subs: Record<string, string>
): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const entryName: string = entry.name;
    const srcPath = path.join(src, entryName);
    const destPath = path.join(dest, entryName);
    if (entry.isDirectory()) {
      await copyDirWithSubstitution(srcPath, destPath, subs);
    } else if (entry.isFile()) {
      const content = await readFile(srcPath, 'utf8');
      await writeFile(destPath, substitute(content, subs), 'utf8');
    }
  }
}

async function ensureGitignoreEntries(
  gitignorePath: string,
  log_line: (msg: string) => void
): Promise<void> {
  let existing = '';
  try {
    await access(gitignorePath, constants.F_OK);
    existing = await readFile(gitignorePath, 'utf8');
  } catch {
    // No .gitignore — we'll create one with just the catalogue rules.
  }

  const additions: string[] = [];
  const hasUnanchoredBuild = /(?:^|\n)\s*build\/\s*(?:\n|$)/.test(existing);
  const hasOverride = /!docs\/build\/(?:\*\*)?/.test(existing);
  const hasNuosCatalogueIgnore = /^\s*\.nuos-catalogue\//m.test(existing);

  if (hasUnanchoredBuild && !hasOverride) {
    additions.push(
      '',
      '# Override: docs/build/ is the NuOS Build Method catalogue, NOT a build artefact.',
      '# The unanchored `build/` rule above matches it; this negation pattern keeps the',
      '# catalogue tracked. Same gotcha caught at nuos Session 53.',
      '!docs/build/',
      '!docs/build/**'
    );
  }
  if (!hasNuosCatalogueIgnore) {
    additions.push(
      '',
      '# NuOS Build Method catalogue — local workflow store (per nuos D047).',
      '# Markdown is canonical in Mode 1; the JSON store is regenerated by',
      '# `nuos-catalogue migrate` and does not need to live in git.',
      '.nuos-catalogue/'
    );
  }

  if (additions.length === 0) {
    log_line('  · .gitignore already has the catalogue entries; nothing to add');
    return;
  }

  const trailing = existing.endsWith('\n') || existing.length === 0 ? '' : '\n';
  const newContent = `${existing}${trailing}${additions.join('\n')}\n`;
  await writeFile(gitignorePath, newContent, 'utf8');
  log_line(
    existing.length === 0
      ? '  · created .gitignore with catalogue rules'
      : '  · appended catalogue rules to .gitignore'
  );
}

function renderCatalogueSection(projectName: string): string {
  return `## Build catalogue (NuOS Build Method)

This repo runs **the NuOS Build Method**. The catalogue lives at [docs/build/](docs/build/) and tracks work units, decisions, open questions, personas, sessions, and risks.

### At the start of every session

Run \`/start-of-session\` (or follow [docs/build/START-OF-SESSION.md](docs/build/START-OF-SESSION.md)).

### At the end of every session

Run \`/end-of-session\`. **Without it, work is lost.**

### Daily use via the CLI

Set these env vars in your shell profile so commands work without flags:

\`\`\`bash
export NUOS_CATALOGUE_BUILD_ROOT="$(pwd)/docs/build"
export NUOS_CATALOGUE_WORKFLOWS="$(pwd)/.nuos-catalogue/workflows.json"
\`\`\`

Then:

\`\`\`bash
nuos-catalogue wu create                          # interactive — file a new WU
nuos-catalogue wu list                            # what's in flight
nuos-catalogue wu advance <handle> --to=in_progress
nuos-catalogue wu tick <handle> --index=N --evidence="commit abc123"
nuos-catalogue decision create
nuos-catalogue question create
nuos-catalogue regenerate                         # check store-vs-disk drift
nuos-catalogue summary                            # totals by register
\`\`\`

To refresh the protocol bodies later (after a CLI upgrade):

\`\`\`bash
nuos-catalogue install-protocols
\`\`\`

### What never to do

- Never make architectural decisions without recording them in \`docs/build/decisions/\`
- Never start work outside the active work unit without recording why
- Never skip end-of-session
- Never modify a committed \`accepted\` decision file (use \`decision supersede\` instead)`;
}
