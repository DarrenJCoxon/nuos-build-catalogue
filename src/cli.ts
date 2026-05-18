#!/usr/bin/env node
/**
 * nuos-catalogue CLI — index and search the build catalogue.
 *
 * Subcommands:
 *   index [--force] [--dry-run]
 *   search "<query>" [--kind=...] [--status=...] [--limit=N] [--json]
 *   info
 *
 * Implementation note — uses minimist-free arg parsing to keep deps lean.
 * If we need richer parsing later, swap in commander/yargs.
 */

// Static imports — these don't pull in NuVector / NuFlow transitively.
// init / migrate / regenerate / summary / list / show / install-protocols all
// work without those native deps being installed.
import { runMigrate } from './migrate/run.js';
import { openWorkflowStore } from './migrate/store.js';
import {
  listRegister,
  showRecord,
  commandToRegister,
  listAcrossRegisters,
} from './commands/handlers.js';
import { runRegenerate } from './regenerate/check.js';
import type { Register } from './migrate/types.js';
import { openPrompt } from './commands/prompt.js';
import { cmdInit, cmdInstallProtocols } from './commands/init.js';
import {
  resolveBuildRoot,
  resolveCatalogueRoot,
  resolveWorkflowsPath,
  resolveIndexPath,
  resolveHashPath,
  gitignoreCatalogueNote,
} from './path-resolution.js';

// Dynamic imports below — index / search / write commands / create commands
// load NuVector or NuFlow transitively. Loading them at module-parse time
// would crash on platforms where the NuVector native binary isn't resolved
// (e.g. fresh npx installs before @nusoft/nuvector ships its platform-specific
// binaries as optionalDependencies). Lazy-load so the lightweight commands
// (init, migrate, etc.) work universally; the heavyweight commands degrade
// gracefully when their deps are missing.

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (const a of rest) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq >= 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        flags[a.slice(2)] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { command: command ?? 'help', positional, flags };
}

async function cmdIndex(flags: Record<string, string | boolean>): Promise<void> {
  const catalogueRoot = resolveCatalogueRoot(flags['catalogue']);
  const buildRoot = resolveBuildRoot(flags['build-root']);
  const indexPath = resolveIndexPath(buildRoot, flags['index']);
  const hashPath = resolveHashPath(buildRoot, flags['hash-file']);

  const { selectEmbedderFromEnv } = await import('./embedder/select.js');
  const { openStore } = await import('./store/open.js');
  const { runIndex } = await import('./indexer/upsert.js');

  const embedder = await selectEmbedderFromEnv();
  const store = await openStore({ storagePath: indexPath, dimensions: embedder.dimensions });

  console.log(`indexing ${catalogueRoot}`);
  console.log(`  embedder: ${embedder.modelId} (${embedder.dimensions} dims)`);
  console.log(`  index file: ${indexPath}`);

  try {
    const report = await runIndex({
      catalogueRoot,
      hashFilePath: hashPath,
      store,
      embedder,
      force: Boolean(flags['force']),
      dryRun: Boolean(flags['dry-run']),
    });

    console.log(
      `\n${report.indexed} indexed, ${report.updated} updated, ${report.deleted} deleted, ` +
        `${report.unchanged} unchanged, ${report.chunks} chunks embedded, ` +
        `${(report.durationMs / 1000).toFixed(2)}s`,
    );
  } finally {
    // Unload-after-use commitment — see Embedder.dispose() docs.
    await embedder.dispose();
  }
}

async function cmdSearch(positional: string[], flags: Record<string, string | boolean>): Promise<void> {
  const query = positional.join(' ');
  if (!query) {
    console.error('Usage: nuos-catalogue search "<query>" [--kind=...] [--status=...] [--limit=N] [--json]');
    process.exit(2);
  }

  const buildRoot = resolveBuildRoot(flags['build-root']);
  const indexPath = resolveIndexPath(buildRoot, flags['index']);
  const { selectEmbedderFromEnv } = await import('./embedder/select.js');
  const { openStore } = await import('./store/open.js');
  const { runSearch } = await import('./search/query.js');
  const { formatHumanReadable, formatJson } = await import('./search/format.js');
  const embedder = await selectEmbedderFromEnv();
  const store = await openStore({ storagePath: indexPath, dimensions: embedder.dimensions });

  const limit = flags['limit'] ? Number(flags['limit']) : 10;
  const kind = flags['kind'] ? String(flags['kind']) : undefined;
  const status = flags['status'] ? String(flags['status']) : undefined;
  const asJson = Boolean(flags['json']);

  try {
    const { hits, embedMs, searchMs } = await runSearch(store, embedder, {
      query,
      limit,
      kind,
      status,
    });

    if (asJson) {
      console.log(formatJson(hits));
    } else {
      console.log(`# query: ${query}`);
      console.log(`# embed ${embedMs}ms · search ${searchMs}ms · ${hits.length} hits\n`);
      console.log(formatHumanReadable(hits));
    }
  } finally {
    // Unload-after-use commitment — see Embedder.dispose() docs.
    await embedder.dispose();
  }
}

async function cmdMigrate(flags: Record<string, string | boolean>): Promise<void> {
  const buildRoot = resolveBuildRoot(flags['build-root']);
  const workflowsPath = resolveWorkflowsPath(buildRoot, flags['workflows']);
  const dryRun = Boolean(flags['dry-run']);

  console.log(`migrating ${buildRoot}`);
  console.log(`  workflows file: ${workflowsPath}`);
  if (dryRun) console.log('  (dry run — nothing will be written)');

  const store = await openWorkflowStore(workflowsPath);
  const report = await runMigrate({ catalogueRoot: buildRoot, store, dryRun });

  console.log('');
  console.log(`scanned:  ${report.scanned}`);
  console.log(`migrated: ${report.migrated}`);
  console.log(`skipped:  ${report.skipped}  (already in workflow store)`);
  console.log('by register:');
  for (const [register, counts] of Object.entries(report.byRegister)) {
    console.log(
      `  ${register.padEnd(15)}  scanned=${counts.scanned}  migrated=${counts.migrated}  skipped=${counts.skipped}`
    );
  }
  if (report.conflicts.length > 0) {
    console.log('');
    console.log(`⚠  ${report.conflicts.length} handle conflict${report.conflicts.length === 1 ? '' : 's'} — multiple source files share the same handle:`);
    for (const c of report.conflicts) {
      console.log(`     ${c.handle}`);
      console.log(`       kept:    ${c.winnerSourcePath}`);
      console.log(`       dropped: ${c.loserSourcePath}`);
    }
    console.log('');
    console.log('     Resolve by renaming the conflicting files (e.g. give them distinct number prefixes) then re-run migrate.');
  }
  console.log(`(${(report.durationMs / 1000).toFixed(2)}s)`);

  // Surface a gitignore hint if the project's .gitignore is missing the
  // `.nuos-catalogue/` entry. Silent if .gitignore is absent or correct.
  // (We do this after the success block so the report is the first thing
  // the operator reads; the note follows.)
  if (!dryRun) {
    const note = gitignoreCatalogueNote(buildRoot);
    if (note) {
      console.log('');
      console.log(note);
    }
  }
}

async function cmdRegisterDispatch(
  command: string,
  positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  const register = commandToRegister(command);
  if (!register) {
    console.error(`unknown register command: ${command}`);
    process.exit(2);
  }

  const action = positional[0];

  // WU 136 — `wu start` / `wu end` / `wu current` are file-only commands
  // (manage the active-WU marker for the PreToolUse hook). They do NOT
  // need the workflow store, so handle them BEFORE the store is opened —
  // this also keeps them fast and avoids requiring a fully-migrated
  // catalogue to declare an active WU.
  if (command === 'wu' && (action === 'start' || action === 'end' || action === 'current')) {
    const { cmdWuStart, cmdWuEnd, cmdWuCurrent } = await import('./commands/wu-active.js');
    let result;
    if (action === 'start') {
      result = cmdWuStart(positional[1], { cwd: process.cwd() });
    } else if (action === 'end') {
      result = cmdWuEnd({ cwd: process.cwd() });
    } else {
      result = cmdWuCurrent({ cwd: process.cwd() });
    }
    console.log(result.output);
    process.exit(result.exitCode);
    return;
  }

  const buildRoot = resolveBuildRoot(flags['build-root']);
  const workflowsPath = resolveWorkflowsPath(buildRoot, flags['workflows']);
  const store = await openWorkflowStore(workflowsPath);
  const asJson = Boolean(flags['json']);

  switch (action) {
    case 'list':
    case undefined: {
      const status = flags['status'] ? String(flags['status']) : undefined;
      const limit = flags['limit'] ? Number(flags['limit']) : undefined;
      const result = listRegister(store, register, { asJson, status, limit });
      console.log(result.output);
      process.exit(result.exitCode);
      break;
    }
    case 'show': {
      const handle = positional[1];
      if (!handle) {
        console.error(`Usage: nuos-catalogue ${command} show <handle> [--json]`);
        process.exit(2);
      }
      const result = showRecord(store, register, handle, { asJson });
      console.log(result.output);
      process.exit(result.exitCode);
      break;
    }
    case 'advance': {
      if (command !== 'wu') {
        console.error(`'advance' is a wu subcommand only`);
        process.exit(2);
      }
      const { createBuildCatalogueRuntime } = await import('./runtime/runtime.js');
      const { cmdWuAdvance } = await import('./commands/write.js');
      const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });
      const result = await cmdWuAdvance(store, runtime, {
        handle: positional[1],
        to: flags['to'] ? String(flags['to']) : undefined,
        reason: flags['reason'] ? String(flags['reason']) : undefined,
      });
      console.log(result.output);
      process.exit(result.exitCode);
      break;
    }
    case 'tick': {
      if (command !== 'wu') {
        console.error(`'tick' is a wu subcommand only`);
        process.exit(2);
      }
      const { createBuildCatalogueRuntime } = await import('./runtime/runtime.js');
      const { cmdWuTick } = await import('./commands/write.js');
      const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });
      const result = await cmdWuTick(store, runtime, {
        handle: positional[1],
        index: flags['index'] !== undefined ? Number(flags['index']) : undefined,
        evidence: flags['evidence'] ? String(flags['evidence']) : undefined,
      });
      console.log(result.output);
      process.exit(result.exitCode);
      break;
    }
    case 'supersede': {
      if (command !== 'decision') {
        console.error(`'supersede' is a decision subcommand only`);
        process.exit(2);
      }
      const { createBuildCatalogueRuntime } = await import('./runtime/runtime.js');
      const { cmdDecisionSupersede } = await import('./commands/write.js');
      const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });
      const result = await cmdDecisionSupersede(store, runtime, {
        target: positional[1],
        by: flags['by'] ? String(flags['by']) : undefined,
        reason: flags['reason'] ? String(flags['reason']) : undefined,
      });
      console.log(result.output);
      process.exit(result.exitCode);
      break;
    }
    case 'resolve': {
      if (command !== 'question') {
        console.error(`'resolve' is a question subcommand only`);
        process.exit(2);
      }
      const { createBuildCatalogueRuntime } = await import('./runtime/runtime.js');
      const { cmdQuestionResolve } = await import('./commands/write.js');
      const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });
      const result = await cmdQuestionResolve(store, runtime, {
        qHandle: positional[1],
        by: flags['by'] ? String(flags['by']) : undefined,
        reason: flags['reason'] ? String(flags['reason']) : undefined,
      });
      console.log(result.output);
      process.exit(result.exitCode);
      break;
    }
    case 'create': {
      const { createBuildCatalogueRuntime } = await import('./runtime/runtime.js');
      const {
        cmdWuCreate,
        cmdDecisionCreate,
        cmdQuestionCreate,
        cmdPersonaCreate,
      } = await import('./commands/create.js');
      const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });
      const prompt = openPrompt();
      try {
        let result;
        switch (command) {
          case 'wu':
            result = await cmdWuCreate(store, runtime, prompt);
            break;
          case 'decision':
            result = await cmdDecisionCreate(store, runtime, prompt);
            break;
          case 'question':
            result = await cmdQuestionCreate(store, runtime, prompt);
            break;
          case 'persona':
            result = await cmdPersonaCreate(store, runtime, prompt);
            break;
          default:
            console.error(`'create' is not a subcommand of ${command}`);
            process.exit(2);
        }
        console.log(result.output);
        process.exit(result.exitCode);
      } finally {
        prompt.close();
      }
      break;
    }
    default:
      console.error(`unknown ${command} action: ${action}`);
      process.exit(2);
  }
}

async function cmdRegenerate(flags: Record<string, string | boolean>): Promise<void> {
  const buildRoot = resolveBuildRoot(flags['build-root']);
  const workflowsPath = resolveWorkflowsPath(buildRoot, flags['workflows']);
  const write = Boolean(flags['write']);
  const showDiffs = Boolean(flags['diff']);
  const registerFilter = flags['register'] ? (String(flags['register']) as Register) : undefined;

  const store = await openWorkflowStore(workflowsPath);
  if (store.list().length === 0) {
    console.log('workflow store is empty — run `nuos-catalogue migrate` first');
    process.exit(2);
  }

  console.log(`regenerate-check ${buildRoot}`);
  console.log(`  workflows file: ${workflowsPath}`);
  if (write) console.log('  --write mode: source files will be overwritten with stored canonical form');
  if (registerFilter) console.log(`  register filter: ${registerFilter}`);

  const report = await runRegenerate({ catalogueRoot: buildRoot, store, registerFilter, write });

  console.log('');
  console.log(`scanned:    ${report.total}`);
  console.log(`identical:  ${report.identical}`);
  console.log(`differs:    ${report.differs}`);
  console.log(`missing:    ${report.missing}`);
  console.log(`unreadable: ${report.unreadable}`);
  console.log('by register:');
  for (const [register, counts] of Object.entries(report.byRegister)) {
    if (counts.total === 0) continue;
    console.log(
      `  ${register.padEnd(15)}  total=${counts.total}  identical=${counts.identical}  differs=${counts.differs}  missing=${counts.missing}`
    );
  }

  if (report.drifted.length > 0) {
    console.log('');
    console.log(`⚠  ${report.drifted.length} drifted record${report.drifted.length === 1 ? '' : 's'}:`);
    for (const d of report.drifted) {
      if (d.kind === 'differs') {
        const tag = write ? '[overwritten]' : '[differs]';
        console.log(
          `  ${tag.padEnd(14)} ${d.handle.padEnd(10)} ${d.sourcePath}  (+${d.linesAdded}/-${d.linesRemoved} lines, ${d.byteDelta} bytes)`
        );
      } else if (d.kind === 'missing-source') {
        console.log(`  [missing]      ${d.handle.padEnd(10)} ${d.sourcePath}`);
      } else if (d.kind === 'unreadable-source') {
        console.log(`  [unreadable]   ${d.handle.padEnd(10)} ${d.sourcePath}  (${d.errorMessage})`);
      }
    }
    if (showDiffs && !write) {
      console.log('');
      console.log('(use --write to overwrite source files with the stored canonical form; --diff is line-count only in Mode 1)');
    }
  }

  console.log(`(${(report.durationMs / 1000).toFixed(2)}s)`);
  process.exit(report.differs > 0 || report.missing > 0 ? 1 : 0);
}

async function cmdSummary(flags: Record<string, string | boolean>): Promise<void> {
  const buildRoot = resolveBuildRoot(flags['build-root']);
  const workflowsPath = resolveWorkflowsPath(buildRoot, flags['workflows']);
  const store = await openWorkflowStore(workflowsPath);
  const { byRegister, total } = listAcrossRegisters(store);
  if (Boolean(flags['json'])) {
    console.log(JSON.stringify({ total, byRegister }, null, 2));
    return;
  }
  console.log(`workflow store: ${workflowsPath}`);
  console.log(`total records:  ${total}`);
  console.log('by register:');
  for (const [register, count] of Object.entries(byRegister)) {
    console.log(`  ${register.padEnd(15)}  ${count}`);
  }
}

function cmdHelp(): void {
  console.log(`nuos-catalogue — NuOS build-catalogue tooling (WU 110, WU 111)

Usage:
  nuos-catalogue init     [--name=X --tagline="Y" --role=consumer --interactive] [--no-llm]
                          (bootstrap docs/build/, methodfile.json, .claude/commands/<protocols>, CLAUDE.md, .gitignore overrides; then probe Ollama and pull qwen3-embedding:0.6b for semantic search. --no-llm skips the LLM step. Refuses if docs/build/ already exists)
  nuos-catalogue setup-llm
                          (run the LLM-setup phase outside 'init': detect Ollama, offer to install where reliable, pull qwen3-embedding:0.6b with a progress bar. Idempotent — safe to re-run)
  nuos-catalogue install-protocols
                          (refresh .claude/commands/<protocols> from this CLI's bundled canonical bodies)
  nuos-catalogue install-hooks
                          (WU 136 — install the Claude PreToolUse hook that gates sibling-repo writes on a declared active WU; idempotent)

  nuos-catalogue index    [--force] [--dry-run] [--catalogue=<dir>]
  nuos-catalogue search   "<query>" [--kind=<file_kind>] [--status=<s>] [--limit=N] [--json]
  nuos-catalogue migrate    [--build-root=<dir>] [--workflows=<file>] [--dry-run]
  nuos-catalogue regenerate [--register=<r>] [--diff] [--write] [--build-root=<dir>] [--workflows=<file>]

  nuos-catalogue summary  [--json]
  nuos-catalogue wu        list      [--status=<s>] [--limit=N] [--json]
  nuos-catalogue wu        show      <handle> [--json]
  nuos-catalogue wu        create    (interactive — multi-step prompts)
  nuos-catalogue wu        advance   <handle> --to=<status> [--reason="..."]
  nuos-catalogue wu        tick      <handle> --index=N --evidence="..."
                          (--index is 1-based: --index=1 ticks the first AC)
  nuos-catalogue wu        start     <handle>
                          (WU 136 — declare this WU as the active one for sibling-repo writes; required by the install-hooks gate)
  nuos-catalogue wu        end
                          (clear the active-WU marker)
  nuos-catalogue wu        current
                          (print the active WU handle, or "(none)")
  nuos-catalogue decision  list      [--status=<s>] [--limit=N] [--json]
  nuos-catalogue decision  show      <handle> [--json]
  nuos-catalogue decision  create    (interactive)
  nuos-catalogue decision  supersede <target> --by=<superseding> [--reason="..."]
  nuos-catalogue question  list      [--status=<s>] [--limit=N] [--json]
  nuos-catalogue question  show      <handle> [--json]
  nuos-catalogue question  create    (interactive)
  nuos-catalogue question  resolve   <q-handle> --by=<d-handle> [--reason="..."]
  nuos-catalogue persona   list      [--limit=N] [--json]
  nuos-catalogue persona   show      <handle> [--json]
  nuos-catalogue persona   create    (interactive — seven dimensions + acid-test per D046)

  nuos-catalogue plan      status    show planning progress across the 5-phase arc

  nuos-catalogue mode                    print the current operator mode
  nuos-catalogue mode <name>             set operator mode: coaching | standard | developer

  nuos-catalogue swarm     status    [--limit=N]  list recent /build-wu runs
  nuos-catalogue swarm     cost      aggregate cost across swarm runs

  nuos-catalogue memory    store     --value="..." [--wu=wu-007] [--agent=architect] [--key="label"]
  nuos-catalogue memory    search    --query="..." [--limit=N]   [--wu=wu-007]       [--agent=architect]

  nuos-catalogue help

Handles accepted: canonical (wu-111, D046, Q009, P001) or friendly
(WU 111, 111, D45, Q9). Unambiguous integers ("111" under "wu show")
are normalised to the canonical form.

Default locations: when --build-root / --workflows / --catalogue are
omitted and the matching env vars are unset, the CLI walks up from the
current working directory looking for a docs/build/ directory (the
same way git finds its repo root). Invoke from anywhere inside the
project. The workflow store lives at <project-root>/.nuos-catalogue/.

Environment:
  NUOS_CATALOGUE_BUILD_ROOT   override for --build-root (the catalogue's docs/build/ dir)
  NUOS_CATALOGUE_WORKFLOWS    override for --workflows (the JSON workflow store path)
  NUOS_CATALOGUE_ROOT         override for --catalogue (semantic-search index source)
  NUOS_CATALOGUE_INDEX_DIR    override for parent dir of index.nv + workflows.json
  NUOS_CATALOGUE_EMBEDDER     vertex | openai | stub  (default: vertex)
  GOOGLE_CLOUD_PROJECT        required for vertex
  GOOGLE_CLOUD_LOCATION       optional (default: us-central1)
  OPENAI_API_KEY              required for openai
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case 'index':
      await cmdIndex(args.flags);
      break;
    case 'search':
      await cmdSearch(args.positional, args.flags);
      break;
    case 'init': {
      const prompt = openPrompt();
      try {
        const result = await cmdInit(prompt, {
          cwd: process.cwd(),
          name: args.flags['name'] ? String(args.flags['name']) : undefined,
          tagline: args.flags['tagline'] ? String(args.flags['tagline']) : undefined,
          domain: args.flags['domain'] ? String(args.flags['domain']) : undefined,
          role: args.flags['role'] ? String(args.flags['role']) : undefined,
          interactive: Boolean(args.flags['interactive']),
          noLlm: Boolean(args.flags['no-llm']),
        });
        if (result.output) console.log(result.output);
        process.exit(result.exitCode);
      } finally {
        prompt.close();
      }
      break;
    }
    case 'setup-llm': {
      // WU 135 — standalone re-entry into the LLM-setup phase. Useful
      // when `init` was run with --no-llm, when an install failed, or
      // when the user switched machines and needs to pull the model
      // freshly. Same orchestrator that `init` calls internally.
      const { runLlmSetup } = await import('./setup/run-llm-setup.js');
      const { ensureIndexBuilt } = await import('./setup/auto-index.js');
      const result = await runLlmSetup({ nonInteractive: false });
      // After the LLM stack is ready, auto-build the search index when
      // it isn't already present. Same helper init and install-protocols
      // use — keeps the three commands aligned on "after this finishes
      // the project is search-ready".
      if (
        result.kind === 'already_ready' ||
        result.kind === 'pulled_only' ||
        result.kind === 'installed_and_pulled'
      ) {
        await ensureIndexBuilt({});
      }
      // Most failure paths emit guidance in-band; we exit non-zero only
      // when a pull actually failed (so CI scripting can branch on it).
      const exitCode = result.kind === 'pull_failed' || result.kind === 'install_failed' ? 1 : 0;
      process.exit(exitCode);
      break;
    }
    case 'install-protocols': {
      const prompt = openPrompt();
      try {
        const result = await cmdInstallProtocols(prompt, { cwd: process.cwd() });
        if (result.output) console.log(result.output);
        process.exit(result.exitCode);
      } finally {
        prompt.close();
      }
      break;
    }
    case 'install-hooks': {
      // WU 136 — install the Claude PreToolUse hook that gates
      // sibling-repo writes on a declared active WU.
      const { cmdInstallClaudeHooks } = await import('./commands/install-claude-hooks.js');
      const result = cmdInstallClaudeHooks({ cwd: process.cwd() });
      if (result.output) console.log(result.output);
      process.exit(result.exitCode);
      break;
    }
    case 'migrate':
      await cmdMigrate(args.flags);
      break;
    case 'regenerate':
      await cmdRegenerate(args.flags);
      break;
    case 'summary':
      await cmdSummary(args.flags);
      break;
    case 'wu':
    case 'decision':
    case 'question':
    case 'persona':
      await cmdRegisterDispatch(args.command, args.positional, args.flags);
      break;
    case 'plan': {
      const sub = args.positional[0];
      if (sub === 'status') {
        const { cmdPlanStatus } = await import('./commands/plan.js');
        const code = await cmdPlanStatus({ cwd: process.cwd() });
        if (code !== 0) process.exit(code);
        break;
      }
      console.error(`unknown plan subcommand: ${sub ?? '(none)'}`);
      console.error('available: plan status');
      process.exit(1);
    }
    case 'mode': {
      const { cmdMode } = await import('./commands/mode.js');
      const code = await cmdMode({ cwd: process.cwd(), mode: args.positional[0] });
      if (code !== 0) process.exit(code);
      break;
    }
    case 'swarm': {
      const sub = args.positional[0];
      const { cmdSwarmStatus, cmdSwarmCost } = await import('./commands/swarm.js');
      if (sub === 'status') {
        const limit = args.flags['limit'] ? Number(args.flags['limit']) : undefined;
        const code = await cmdSwarmStatus({ cwd: process.cwd(), limit });
        if (code !== 0) process.exit(code);
        break;
      }
      if (sub === 'cost') {
        const code = await cmdSwarmCost({ cwd: process.cwd() });
        if (code !== 0) process.exit(code);
        break;
      }
      console.error(`unknown swarm subcommand: ${sub ?? '(none)'}`);
      console.error('available: swarm status [--limit=N], swarm cost');
      process.exit(1);
    }
    case 'memory': {
      const sub = args.positional[0];
      const { cmdMemoryStore, cmdMemorySearch } = await import('./commands/memory.js');
      if (sub === 'store') {
        const value = args.flags['value'] ? String(args.flags['value']) : '';
        const wu = args.flags['wu'] ? String(args.flags['wu']) : undefined;
        const agent = args.flags['agent'] ? String(args.flags['agent']) : undefined;
        const key = args.flags['key'] ? String(args.flags['key']) : undefined;
        const code = await cmdMemoryStore({ value, wu, agent, key, cwd: process.cwd() });
        if (code !== 0) process.exit(code);
        break;
      }
      if (sub === 'search') {
        const query = args.flags['query'] ? String(args.flags['query']) : '';
        const limit = args.flags['limit'] ? Number(args.flags['limit']) : undefined;
        const wu = args.flags['wu'] ? String(args.flags['wu']) : undefined;
        const agent = args.flags['agent'] ? String(args.flags['agent']) : undefined;
        const code = await cmdMemorySearch({ query, limit, wu, agent, cwd: process.cwd() });
        if (code !== 0) process.exit(code);
        break;
      }
      console.error(`unknown memory subcommand: ${sub ?? '(none)'}`);
      console.error('available: memory store --value="..." [--wu=...] [--agent=...] [--key=...]');
      console.error('           memory search --query="..." [--limit=N] [--wu=...] [--agent=...]');
      process.exit(1);
    }
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      cmdHelp();
      break;
    default:
      console.error(`unknown command: ${args.command}`);
      cmdHelp();
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
