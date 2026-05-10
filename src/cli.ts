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

import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

// Dynamic imports below — index / search / write commands / create commands
// load NuVector or NuFlow transitively. Loading them at module-parse time
// would crash on platforms where the NuVector native binary isn't resolved
// (e.g. fresh npx installs before @nusoft/nuvector ships its platform-specific
// binaries as optionalDependencies). Lazy-load so the lightweight commands
// (init, migrate, etc.) work universally; the heavyweight commands degrade
// gracefully when their deps are missing.

const __filename = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = path.resolve(path.dirname(__filename), '..');

// Defaults resolve in this order: env var > flag-supplied > package-relative
// fallback. The package-relative fallback only makes sense when running
// against the nuos catalogue as a sibling (the original WU 110 use case);
// for any other consumer (Sensight, NuTutor, etc.) the env vars or the
// per-command flags are the right path. CLAUDE.md guidance for adopters:
// set NUOS_CATALOGUE_BUILD_ROOT and NUOS_CATALOGUE_WORKFLOWS in your
// shell profile.
const DEFAULT_CATALOGUE_ROOT =
  process.env.NUOS_CATALOGUE_ROOT ?? path.resolve(PACKAGE_ROOT, '../nuos/docs');
const DEFAULT_BUILD_ROOT =
  process.env.NUOS_CATALOGUE_BUILD_ROOT ?? path.resolve(PACKAGE_ROOT, '../nuos/docs/build');
const DEFAULT_INDEX_DIR =
  process.env.NUOS_CATALOGUE_INDEX_DIR ?? path.resolve(PACKAGE_ROOT, '.nuos-catalogue');
const DEFAULT_INDEX_PATH = path.join(DEFAULT_INDEX_DIR, 'index.nv');
const DEFAULT_HASH_PATH = path.join(DEFAULT_INDEX_DIR, 'hashes.json');
const DEFAULT_WORKFLOWS_PATH =
  process.env.NUOS_CATALOGUE_WORKFLOWS ?? path.join(DEFAULT_INDEX_DIR, 'workflows.json');

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
  const catalogueRoot = String(flags['catalogue'] ?? DEFAULT_CATALOGUE_ROOT);
  const indexPath = String(flags['index'] ?? DEFAULT_INDEX_PATH);
  const hashPath = String(flags['hash-file'] ?? DEFAULT_HASH_PATH);

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

  const indexPath = String(flags['index'] ?? DEFAULT_INDEX_PATH);
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
  const buildRoot = String(flags['build-root'] ?? DEFAULT_BUILD_ROOT);
  const workflowsPath = String(flags['workflows'] ?? DEFAULT_WORKFLOWS_PATH);
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
  const workflowsPath = String(flags['workflows'] ?? DEFAULT_WORKFLOWS_PATH);
  const buildRoot = String(flags['build-root'] ?? DEFAULT_BUILD_ROOT);
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
  const buildRoot = String(flags['build-root'] ?? DEFAULT_BUILD_ROOT);
  const workflowsPath = String(flags['workflows'] ?? DEFAULT_WORKFLOWS_PATH);
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
  const workflowsPath = String(flags['workflows'] ?? DEFAULT_WORKFLOWS_PATH);
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
  nuos-catalogue init     [--name=X --tagline="Y" --domain=Z --role=consumer --yes]
                          (interactive bootstrap of docs/build/, methodfile.json, .claude/commands/<protocols>, CLAUDE.md, .gitignore overrides; refuses if docs/build/ already exists)
  nuos-catalogue install-protocols
                          (refresh .claude/commands/<protocols> from this CLI's bundled canonical bodies)

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

  nuos-catalogue help

Handles accepted: canonical (wu-111, D046, Q009, P001) or friendly
(WU 111, 111, D45, Q9). Unambiguous integers ("111" under "wu show")
are normalised to the canonical form.

Environment:
  NUOS_CATALOGUE_BUILD_ROOT   default for --build-root (the catalogue's docs/build/ dir)
  NUOS_CATALOGUE_WORKFLOWS    default for --workflows (the JSON workflow store path)
  NUOS_CATALOGUE_ROOT         default for --catalogue (semantic-search index source)
  NUOS_CATALOGUE_INDEX_DIR    default parent dir for index.nv + workflows.json
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
          nonInteractive: Boolean(args.flags['yes']),
        });
        if (result.output) console.log(result.output);
        process.exit(result.exitCode);
      } finally {
        prompt.close();
      }
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
