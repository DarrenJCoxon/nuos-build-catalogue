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

import { selectEmbedderFromEnv } from './embedder/select.js';
import { openStore } from './store/open.js';
import { runIndex } from './indexer/upsert.js';
import { runSearch } from './search/query.js';
import { formatHumanReadable, formatJson } from './search/format.js';
import { runMigrate } from './migrate/run.js';
import { openWorkflowStore } from './migrate/store.js';

const __filename = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_CATALOGUE_ROOT = path.resolve(PACKAGE_ROOT, '../nuos/docs');
const DEFAULT_BUILD_ROOT = path.resolve(PACKAGE_ROOT, '../nuos/docs/build');
const DEFAULT_INDEX_DIR = path.resolve(PACKAGE_ROOT, '.nuos-catalogue');
const DEFAULT_INDEX_PATH = path.join(DEFAULT_INDEX_DIR, 'index.nv');
const DEFAULT_HASH_PATH = path.join(DEFAULT_INDEX_DIR, 'hashes.json');
const DEFAULT_WORKFLOWS_PATH = path.join(DEFAULT_INDEX_DIR, 'workflows.json');

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
  console.log(`(${(report.durationMs / 1000).toFixed(2)}s)`);
}

function cmdHelp(): void {
  console.log(`nuos-catalogue — NuOS build-catalogue tooling (WU 110, WU 111)

Usage:
  nuos-catalogue index    [--force] [--dry-run] [--catalogue=<dir>]
  nuos-catalogue search   "<query>" [--kind=<file_kind>] [--status=<s>] [--limit=N] [--json]
  nuos-catalogue migrate  [--build-root=<dir>] [--workflows=<file>] [--dry-run]
  nuos-catalogue help

Environment:
  NUOS_CATALOGUE_EMBEDDER  vertex | openai | stub  (default: vertex)
  GOOGLE_CLOUD_PROJECT     required for vertex
  GOOGLE_CLOUD_LOCATION    optional (default: us-central1)
  OPENAI_API_KEY           required for openai
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
    case 'migrate':
      await cmdMigrate(args.flags);
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
