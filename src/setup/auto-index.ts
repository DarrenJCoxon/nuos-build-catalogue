/**
 * Shared helper that runs the first search index build automatically
 * from `init`, `install-protocols`, and `setup-llm`.
 *
 * Gated on the LLM stack being ready (Ollama + the configured embedding
 * model). If the LLM isn't ready, this helper returns a `skipped_llm`
 * result with a hint string the caller prints. The hint references
 * `setup-llm` so the user has a clear path forward.
 *
 * Indexing on a fresh project takes ~30s — small enough that auto-
 * running on first install is friendlier than asking. Subsequent calls
 * are incremental via the per-file SHA hashes, so re-running on an
 * existing index is cheap.
 *
 * @module setup/auto-index
 */

import { existsSync } from 'node:fs';

import {
  resolveBuildRoot,
  resolveCatalogueRoot,
  resolveHashPath,
  resolveIndexPath,
} from '../path-resolution.js';
import { DEFAULT_OLLAMA_HOST, detectModelPresent, detectOllamaApi } from './ollama-detect.js';
import { DEFAULT_EMBEDDING_MODEL } from './run-llm-setup.js';

/** Outcome of an auto-index attempt. */
export type AutoIndexResult =
  /**
   * The indexer ran. `indexed` includes both freshly-embedded files and
   * re-embedded changed ones. `unchanged` is non-zero on subsequent
   * runs — those files were SHA-matched and skipped without embedding.
   */
  | { kind: 'ran'; indexPath: string; indexed: number; unchanged: number; chunks: number; durationMs: number }
  | { kind: 'skipped_llm_not_ready'; reason: string; hint: string }
  | { kind: 'skipped_no_catalogue' }
  | { kind: 'failed'; error: string };

export interface AutoIndexOptions {
  /** Project root for path resolution. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Output sink — defaults to process.stderr. */
  out?: (text: string) => void;
  /** Force a full reindex even if the index file already exists. */
  force?: boolean;
}

/**
 * Run the indexer when conditions allow. Always runs (the indexer is
 * incremental — unchanged files are SHA-skipped without embedding work),
 * so this both *creates* the index on first call and *refreshes* it on
 * subsequent calls. Returns `skipped_llm_not_ready` with a hint when
 * the Ollama probe fails — the caller prints the hint and the user runs
 * `setup-llm` to fix things.
 *
 * Never throws on user-facing failures.
 */
export async function ensureIndexBuilt(opts: AutoIndexOptions = {}): Promise<AutoIndexResult> {
  const cwd = opts.cwd ?? process.cwd();
  const out = opts.out ?? ((text: string) => process.stderr.write(text));

  // Resolve where the index file lives without forcing the LLM stack to
  // load — path resolution is cheap and offline. When the project has
  // no `docs/build/` yet (e.g. install-protocols invoked in a non-
  // scaffolded directory), resolveBuildRoot throws — we treat that as a
  // silent no-op, since there is nothing meaningful to index.
  const ctx = { cwd, env: process.env as Record<string, string | undefined> };
  let buildRoot: string;
  let catalogueRoot: string;
  let indexPath: string;
  let hashPath: string;
  try {
    buildRoot = resolveBuildRoot(undefined, ctx);
    catalogueRoot = resolveCatalogueRoot(undefined, ctx);
    indexPath = resolveIndexPath(buildRoot, undefined, ctx);
    hashPath = resolveHashPath(buildRoot, undefined, ctx);
  } catch {
    return { kind: 'skipped_no_catalogue' };
  }

  // We do not short-circuit on `existsSync(indexPath)` — the indexer is
  // already incremental via the per-file SHA hash store, so running it
  // when the index is up-to-date is cheap (~1s on a 270-file catalogue
  // with no changes). Short-circuiting here would leave newer files
  // un-embedded until the user ran `nuos-catalogue index` manually,
  // which is exactly the discoverability gap the auto-index is meant to
  // close.

  // Probe the LLM stack — index requires Ollama + the model. If either
  // is missing, skip with a hint pointing at setup-llm.
  const apiHost = process.env.NUOS_CATALOGUE_OLLAMA_HOST ?? DEFAULT_OLLAMA_HOST;
  const modelId = process.env.NUOS_CATALOGUE_OLLAMA_MODEL ?? DEFAULT_EMBEDDING_MODEL;

  const api = await detectOllamaApi(apiHost);
  if (!api.reachable) {
    return {
      kind: 'skipped_llm_not_ready',
      reason: `Ollama is not running at ${apiHost}`,
      hint: 'Run `nuos-catalogue setup-llm` to set up local semantic search, then re-run `nuos-catalogue index`.',
    };
  }

  const model = await detectModelPresent(apiHost, modelId);
  if (!model.present) {
    return {
      kind: 'skipped_llm_not_ready',
      reason: `${modelId} is not pulled`,
      hint: 'Run `nuos-catalogue setup-llm` to pull the embedding model (~600 MB), then re-run `nuos-catalogue index`.',
    };
  }

  // LLM is ready. Run the indexer. The first run on a fresh project is
  // ~30s of starter-kit content; subsequent runs are fast — the
  // per-file SHA hashes mean unchanged files are skipped without
  // embedding.
  const isFirstRun = !existsSync(indexPath);
  if (isFirstRun) {
    out('Building search index for docs/build/ … (first run may take ~30 seconds)\n');
  } else {
    out('Refreshing search index (incremental — only changed files are re-embedded)…\n');
  }

  try {
    const { selectEmbedderFromEnv } = await import('../embedder/select.js');
    const { openStore } = await import('../store/open.js');
    const { runIndex } = await import('../indexer/upsert.js');

    const embedder = await selectEmbedderFromEnv();
    const store = await openStore({ storagePath: indexPath, dimensions: embedder.dimensions });

    try {
      const report = await runIndex({
        catalogueRoot,
        hashFilePath: hashPath,
        store,
        embedder,
        force: Boolean(opts.force),
        dryRun: false,
      });

      const changed = report.indexed + report.updated;
      const secs = (report.durationMs / 1000).toFixed(1);
      if (isFirstRun) {
        out(`✓ Indexed ${report.indexed} file(s), ${report.chunks} chunks embedded in ${secs}s\n`);
      } else if (changed === 0) {
        out(`✓ Index up-to-date (${report.unchanged} files checked, none changed) in ${secs}s\n`);
      } else {
        out(
          `✓ Re-indexed ${changed} changed file(s) (${report.unchanged} unchanged), ` +
            `${report.chunks} chunks embedded in ${secs}s\n`,
        );
      }

      return {
        kind: 'ran',
        indexPath,
        indexed: changed,
        unchanged: report.unchanged,
        chunks: report.chunks,
        durationMs: report.durationMs,
      };
    } finally {
      // Unload-after-use commitment — embedder releases the model.
      await embedder.dispose();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    out(`\n✗ Index refresh failed: ${message}\n`);
    out('Re-run `nuos-catalogue index` manually to retry.\n');
    return { kind: 'failed', error: message };
  }
}
