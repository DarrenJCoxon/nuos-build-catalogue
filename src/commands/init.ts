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
import type {} from './prompt.js'; // ensures path resolution stays stable across bundling

const __filename = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const TEMPLATES_ROOT = path.resolve(PACKAGE_ROOT, 'templates');

export interface InitOptions {
  /** Target project root (default: cwd). */
  cwd?: string;
  /** Pre-supplied values; if omitted, sensible defaults are used. */
  name?: string;
  tagline?: string;
  domain?: string;
  role?: string;
  /**
   * Opt into the prompt flow (project name, tagline, role, confirm).
   * Default is non-interactive: scaffolds immediately with sensible
   * defaults. The real configuration happens during Phase A of the
   * planning arc, not at init time.
   */
  interactive?: boolean;
  /**
   * @deprecated kept only for backward compat with the older `--yes` flag;
   * has no effect — init is always non-interactive unless `interactive` is set.
   */
  nonInteractive?: boolean;
  /**
   * Skip the post-scaffold LLM-setup phase (WU 135). When true, `init`
   * scaffolds the catalogue and exits without probing for Ollama or
   * offering to pull the embedding model. Users who skip can run
   * `nuos-catalogue setup-llm` later. Default: false.
   */
  noLlm?: boolean;
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
  'plan-orientation.md',
  'build-wu.md',
] as const;

/**
 * One-line descriptions used in the frontmatter of installed protocol
 * files. Tools surface this text in their command list, so it should
 * read as an imperative summary.
 */
const PROTOCOL_DESCRIPTIONS: Record<string, string> = {
  'start-of-session': 'Read where the project is and propose the next concrete action',
  'end-of-session': 'Capture what happened, update state, write session log, commit',
  'wu-new': 'File a new work unit through a guided plain-English conversation',
  'persona-new': 'File a new persona by walking the seven dimensions conversationally',
  'plan-orientation': 'Phase A of planning — project description, tech stack, personas, the horizon map',
  'build-wu': 'Orchestrate a swarm of agents to build one work unit end-to-end',
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
  //
  // Init is **zero-prompt by default**. The user wants `npx ... init` to
  // just work — sensible defaults fill in everything, the scaffold goes
  // down, and the real planning happens in /start-of-session (Phase A of
  // the planning arc), where the AI walks the user through the project
  // description, personas, and the horizon map IN CONTEXT.
  //
  // Old behavior (4 prompts: name, tagline, domain, role) wasn't load-
  // bearing — tagline gets produced during Phase A; domain is a relic;
  // role is a planning-time annotation rarely used downstream. Users who
  // want the prompts back can pass --interactive.
  const projectDefault = path.basename(cwd);
  let name = options.name ?? projectDefault;
  let tagline = options.tagline ?? '';
  let domain = options.domain ?? '';
  let role = options.role ?? 'consumer';

  if (options.interactive) {
    prompt.print('Setting up the catalogue.');
    prompt.print('');
    if (!options.name) {
      const answer = (await prompt.ask(`Project name [${projectDefault}]: `)).trim();
      if (answer) name = answer;
    }
    if (!options.tagline) {
      tagline = (await prompt.ask('One-line description (or empty — Phase A will fill it in): ')).trim();
    }
    if (!options.role) {
      role = await prompt.askChoice('Project role?', ['consumer', 'standalone', 'harness']);
    }
    const confirm = await prompt.confirm(
      `Create docs/build/, install protocols + hooks, set up the catalogue. Proceed?`,
      true
    );
    if (!confirm) {
      return { output: 'init cancelled.', exitCode: 1 };
    }
  }

  const subs: Record<string, string> = {
    '{{PROJECT_NAME}}': name,
    '{{PROJECT_TAGLINE}}': tagline,
    '{{PROJECT_DOMAIN}}': domain,
    '{{PROJECT_ROLE}}': role,
    '{{TODAY}}': today,
  };

  // Per-step "· created X" messages are kept as an in-memory audit trail
  // but NOT printed by default. The end-user-facing output is just a
  // single "Done. Type /start-of-session" at the close. Pass `interactive`
  // to see the per-step lines (useful for debugging).
  const log: string[] = [];
  const log_line = (msg: string) => {
    log.push(msg);
    if (options.interactive) prompt.print(msg);
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

  // Step 3c: install the swarm agent definitions. Each agent is a markdown
  // file with Claude Code frontmatter (name, description, model, tools).
  // They land in .claude/agents/ so Claude Code's Task tool finds them.
  // The model field per-agent is the default routing — overridable in
  // methodfile.json's swarm.models or per-spawn.
  await installAgents(cwd, log_line);

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

  // Step 6: LLM setup (WU 135). Probes Ollama, offers to install where
  // reliable, pulls the default embedding model with a live progress bar.
  // Skipped when `noLlm` is set, leaving the catalogue scaffolded and
  // usable for markdown-only workflows — the user can run
  // `nuos-catalogue setup-llm` later.
  if (!options.noLlm) {
    const { runLlmSetup } = await import('../setup/run-llm-setup.js');
    const { ensureIndexBuilt } = await import('../setup/auto-index.js');
    await runLlmSetup({
      // The setup module writes its own progress directly to stderr; we
      // don't route through `prompt.print` because the in-place progress
      // bar needs unbuffered control of the line.
      //
      // We always allow prompts here, even though `init` overall is
      // zero-prompt by default. The LLM setup's only prompts are
      // single-key consent gates ("install Ollama?", "open download
      // page?") and they need the user's input on a fresh machine.
      // `runLlmSetup` falls back to no-on-EOF when stdin isn't a TTY,
      // so this is safe in unattended runs too.
      nonInteractive: false,
    });
    // After LLM setup succeeds, auto-build the first search index. On a
    // fresh project this is ~30s of starter-kit boilerplate; trivial,
    // and finishing here means `search` works out of the box. When the
    // LLM stack isn't ready, `ensureIndexBuilt` skips with a hint
    // pointing back to setup-llm.
    const indexResult = await ensureIndexBuilt({ cwd });
    if (indexResult.kind === 'skipped_llm_not_ready') {
      prompt.print('');
      prompt.print(`  · Skipping first-index build: ${indexResult.reason}.`);
      prompt.print(`  · ${indexResult.hint}`);
    }
  } else {
    prompt.print('');
    prompt.print('  · LLM setup skipped (--no-llm). Run `nuos-catalogue setup-llm` later to enable semantic search.');
  }

  prompt.print('');
  prompt.print('✅ Done.');
  prompt.print('');
  prompt.print('Now type  /start-of-session  into Claude Code to begin.');
  prompt.print('');

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

  // Refresh agent definitions too.
  prompt.print('');
  prompt.print(`Refreshing swarm agent definitions (.claude/agents/):`);
  await installAgents(cwd, (msg) => prompt.print(msg));

  // Quick non-interactive probe of the local-inference stack (WU 135).
  // `install-protocols` is the natural upgrade path for existing
  // projects, so we surface the LLM status here too — but as a status
  // report rather than the full install/pull flow (which is what
  // `setup-llm` is for). This keeps install-protocols fast and
  // script-safe while making the LLM state visible without the user
  // needing to know about a separate command.
  prompt.print('');
  prompt.print('Checking local semantic search (Ollama + qwen3-embedding:0.6b):');
  await reportLlmStatus((msg) => prompt.print(`  ${msg}`));

  // Auto-build/refresh the search index when the LLM is ready. The
  // indexer is incremental via per-file SHA hashes: a no-change project
  // takes ~1s, a project with N changed files takes O(N) embed calls.
  // When the LLM stack isn't ready the helper skips silently — the
  // status was already reported above by reportLlmStatus.
  const { ensureIndexBuilt } = await import('../setup/auto-index.js');
  await ensureIndexBuilt({ cwd });

  return { output: '', exitCode: 0 };
}

/**
 * Quick probe + status print for the LLM stack. Non-interactive: never
 * prompts, never installs, never pulls. The full install/pull flow
 * lives in `setup-llm`; this is the "what's the current state?" report.
 *
 * Times out after ~1.5s when Ollama isn't running so the command stays
 * snappy on machines that haven't set up local inference yet.
 */
async function reportLlmStatus(log: (msg: string) => void): Promise<void> {
  const { narrowPlatform } = await import('../setup/types.js');
  const { detectOllamaApi, detectModelPresent } = await import('../setup/ollama-detect.js');
  const { DEFAULT_EMBEDDING_MODEL } = await import('../setup/run-llm-setup.js');

  const platform = narrowPlatform(process.platform);
  const apiHost = process.env.NUOS_CATALOGUE_OLLAMA_HOST ?? 'http://localhost:11434';
  const modelId = process.env.NUOS_CATALOGUE_OLLAMA_MODEL ?? DEFAULT_EMBEDDING_MODEL;

  const api = await detectOllamaApi(apiHost);
  if (!api.reachable) {
    log(`✗ Ollama is not running at ${apiHost}`);
    log('  Run `nuos-catalogue setup-llm` for guided install + pull.');
    return;
  }
  log(`✓ Ollama is running at ${apiHost}`);

  const model = await detectModelPresent(apiHost, modelId);
  if (!model.present) {
    log(`✗ ${modelId} is not pulled`);
    log('  Run `nuos-catalogue setup-llm` to download it (~600 MB).');
    return;
  }
  log(`✓ ${modelId} is pulled (~600 MB)`);
  log(`Semantic search is ready. Try \`nuos-catalogue search "your query"\` after the first index.`);

  // Suppress the unused-variable warning while keeping platform available
  // for future per-OS hints (e.g. "Ollama runs in the menu bar on macOS").
  void platform;
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
// installAgents — copy bundled swarm agent definitions into .claude/agents/
// ---------------------------------------------------------------------------

/**
 * Bundled agent definitions ship in templates/agents/. Each is a markdown
 * file with Claude Code frontmatter (name, description, model, tools). They
 * get copied into <cwd>/.claude/agents/ where Claude Code's Task tool
 * discovers them.
 *
 * Six default agents land in 0.15.0:
 *   architect (opus) — design + contracts
 *   debugger  (opus) — trace failures
 *   coder     (sonnet) — implementation
 *   tester    (sonnet) — tests against acceptance criteria
 *   reviewer  (sonnet) — code review against spec + design system
 *   researcher(haiku) — online lookups + summaries
 *
 * Per-agent model is the default. Project-wide overrides live in
 * methodfile.json under swarm.models. Per-spawn overrides via the Task
 * tool's `model` parameter.
 *
 * Idempotent: byte-identical sources are reported "unchanged".
 */
async function installAgents(
  cwd: string,
  log_line: (msg: string) => void
): Promise<void> {
  const agentsTemplatesRoot = path.join(TEMPLATES_ROOT, 'agents');
  if (!existsSync(agentsTemplatesRoot)) {
    log_line('  · (agents bundle not present in this CLI install — skipping)');
    return;
  }

  const claudeAgentsDir = path.join(cwd, '.claude', 'agents');
  await mkdir(claudeAgentsDir, { recursive: true });

  const entries = await readdir(agentsTemplatesRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const src = path.join(agentsTemplatesRoot, entry.name);
    const dest = path.join(claudeAgentsDir, entry.name);
    const srcContent = await readFile(src, 'utf8');
    let action: 'created' | 'updated' | 'unchanged' = 'created';
    if (existsSync(dest)) {
      const destContent = await readFile(dest, 'utf8');
      action = destContent === srcContent ? 'unchanged' : 'updated';
    }
    if (action !== 'unchanged') {
      await writeFile(dest, srcContent, 'utf8');
    }
    log_line(`  · ${action} .claude/agents/${entry.name}`);
  }
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

This project uses the **NuOS Build Method catalogue** at [docs/build/](docs/build/). It is the project's memory — who it's for, what's been built, what's been decided, what's still unknown, what's at risk. Eleven registers in plain Markdown. The catalogue stays current through two protocols that bookend every session.

**Start here** if you're new:

- [docs/build/WELCOME.md](docs/build/WELCOME.md) — what this catalogue is, in 5 minutes
- [docs/build/GLOSSARY.md](docs/build/GLOSSARY.md) — every term defined once

### Three commands

That's it. Everything else is automatic.

\`\`\`text
/start-of-session       — every time you begin working
/end-of-session         — every time you stop
\`\`\`

(\`init\` runs once at the start; you've already done that.)

If this is a brand-new project, \`/start-of-session\` will detect the empty catalogue and walk you through 5 short planning phases (Orientation, Architecture, UI/UX + Design System, Maps, Initial Work Units) before any building starts. Each phase is its own session. Take them in order; pause whenever you need to.

### The principle that makes it work

**Project memory never drifts from project reality.** Every decision made in conversation gets saved before the session ends. Every change to an existing piece flows through a protocol. The pre-commit hook blocks silent edits to accepted decisions; the post-commit hook auto-refreshes the search index after every commit. What the AI finds when you ask "what did we decide about X?" is always current.

### What never to do

- **Never close a session without \`/end-of-session\`.** Work that isn't written down is work that's lost.
- **Never edit an accepted decision file.** If something changes, file a new decision that supersedes the old one. The pre-commit hook will block silent edits.
- **Never make an architectural decision in conversation without filing it.** If you and the AI agree on "let's go with X", file it as a decision *before moving on*. Drift is the failure mode that makes the catalogue worthless.

### If you need more

- All registers and their templates live under [docs/build/](docs/build/)
- The full CLI surface (creating work units / decisions / personas / questions / contracts / surfaces from the command line) is documented at [docs/build/WELCOME.md](docs/build/WELCOME.md)
- To refresh protocols and hooks later (after a CLI upgrade): \`npx @nusoft/nuos-build-catalogue install-protocols\`
`;
}
