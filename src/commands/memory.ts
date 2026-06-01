/**
 * `nuos-catalogue memory store` — embed a finding and persist it to NuVector.
 * `nuos-catalogue memory search` — retrieve relevant past findings by query.
 *
 * Cross-agent memory: every agent in a swarm can write findings here and
 * any future agent (in this run or a later one) can retrieve them by
 * semantic query. Uses its own NuVector store file (`memory.nv`), separate
 * from the doc-search index (`index.nv`), so that the ~40s background
 * reindex never locks out memory writes. See D131.
 *
 * CLI:
 *   memory store  --value="..."  [--wu=wu-007] [--agent=architect] [--key="label"]
 *   memory search --query="..."  [--limit=N]   [--wu=wu-007]       [--agent=architect]
 */

import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolveBuildRoot, resolveIndexPath, resolveMemoryPath } from '../path-resolution.js';
// resolveIndexPath is used only as the migration *source* (legacy index.nv),
// not as the live memory path (which is resolved via resolveMemoryPath).

// NuVector's MemoryRecordKind union doesn't include a swarm-specific kind yet.
// 'workflow_provenance' is the closest semantic match — agent memories are
// provenance of the swarm workflow. NuFlow isn't wired (harness.runtime.nuflow
// is null) so there's no collision today; records are further distinguished by
// the presence of an `agent_role` metadata field (absent on NuFlow provenance).
const MEMORY_KIND = 'workflow_provenance' as const;

export interface MemoryStoreOptions {
  value: string;
  wu?: string;
  agent?: string;
  key?: string;
  cwd?: string;
  buildRoot?: string | boolean;
  /** Override for the memory store path (defaults to `<index-dir>/memory.nv`). */
  memory?: string | boolean;
  /** @deprecated Kept for callers that pass `index` — resolved as `memory` for memory commands. */
  index?: string | boolean;
}

export interface MemorySearchOptions {
  query: string;
  limit?: number;
  wu?: string;
  agent?: string;
  cwd?: string;
  buildRoot?: string | boolean;
  /** Override for the memory store path (defaults to `<index-dir>/memory.nv`). */
  memory?: string | boolean;
  /** @deprecated Kept for callers that pass `index` — resolved as `memory` for memory commands. */
  index?: string | boolean;
}

export interface MemoryHit {
  id: string;
  score: number;
  text: string;
  agentRole: string;
  workUnit: string;
  key: string;
  timestamp: string;
}

/**
 * One-time idempotent migration: copy existing agent-memory records
 * (kind `workflow_provenance` with an `agent_role` metadata field) from
 * the legacy `index.nv` into the new `memory.nv`. Triggered lazily the
 * first time a memory command opens the store (i.e. when `memory.nv` does
 * not yet exist). Once `memory.nv` exists this function is a no-op.
 *
 * Decision on delete-vs-leave: we leave migrated records in `index.nv`.
 * They are dead weight there — `memory search` reads only `memory.nv`,
 * and the doc reindex upserts only doc-kind records — so leaving them
 * causes no observable problem. Deletion via the store's `DeletionQuery`
 * API would need the id list; the extra complexity buys nothing for a
 * handful of records.
 *
 * Embeddings are copied verbatim via `fetch(ids)` — no re-embedding.
 * If `index.nv` does not exist yet (fresh project), migration is skipped.
 *
 * Atomicity: uses a sentinel file (`memory.nv.migrating`) written before the
 * migration opens `memory.nv` and deleted after a successful close. If the
 * process dies mid-migration, the next run sees both files and retries.
 *
 * INVARIANT — never `unlinkSync(memoryPath)` then `openStore(memoryPath)` in
 * the same process. NuVector's NAPI in-process inode registry tracks handles
 * by inode; a same-process unlink+reopen materialises the store in-memory only
 * (the file never appears on disk), silently losing all data on process exit.
 * The only permitted `unlinkSync(memoryPath)` is the corrupt-open-failure guard
 * at the bottom, which always re-throws immediately — the store is never
 * reopened in the same process after that unlink.
 *
 * In the interrupted-migration path (memory.nv + sentinel both present) we
 * therefore open the existing partial `memory.nv` directly. `upsertBatch` is
 * idempotent by id, so re-writing the same records into a partial store just
 * completes it, with no phantom-materialisation risk.
 */
async function migrateMemoryRecordsIfNeeded(
  indexPath: string,
  memoryPath: string,
  dimensions: number,
): Promise<void> {
  const sentinelPath = `${memoryPath}.migrating`;

  // Complete gate: memory.nv exists with no sentinel → done (either a clean
  // migration or a store created by a normal memory write). Early return.
  if (existsSync(memoryPath) && !existsSync(sentinelPath)) return;

  // Fresh project: no legacy index to migrate from. Clear any stray sentinel
  // (shouldn't exist, but be tidy) and return; the caller's openStore will
  // create memory.nv fresh on its own write.
  if (!existsSync(indexPath)) {
    if (existsSync(sentinelPath)) {
      try { unlinkSync(sentinelPath); } catch { /* ignore — best-effort */ }
    }
    return;
  }

  const { openStore, TENANT } = await import('../store/open.js');

  // Write the sentinel before opening memory.nv. If the process dies after
  // this point, the next run sees both files (or just the sentinel) and
  // falls through to the (re)migration path below.
  try { writeFileSync(sentinelPath, ''); } catch { /* non-fatal; best-effort */ }

  try {
    // Read from index.nv. Hold the store open for both retrieveContext and
    // fetch — a single open avoids a close→reopen timing window.
    const srcStore = await openStore({ storagePath: indexPath, dimensions });
    let fullRecords: import('@nusoft/nuvector').MemoryRecord[];
    try {
      const zeroEmbedding = new Float32Array(dimensions);
      const result = await srcStore.retrieveContext({
        embedding: zeroEmbedding,
        tenant: TENANT,
        topK: 10_000,
        filters: { kind: MEMORY_KIND },
        scoreThreshold: 0,
      });
      const items = (result?.items ?? []) as Array<{ ref: string }>;

      // Filter to agent-memory records (presence of `agent_role` metadata).
      const agentMemoryRefs = items
        .filter((item) => {
          const meta = (item as { metadata?: Record<string, unknown> }).metadata;
          return meta !== undefined && 'agent_role' in meta;
        })
        .map((item) => item.ref);

      fullRecords = agentMemoryRefs.length > 0
        ? await srcStore.fetch(agentMemoryRefs)
        : [];
    } finally {
      await srcStore.close();
    }

    // Open memory.nv — create fresh (first run) or open the existing partial
    // file (interrupted run). Do NOT unlink first: same-process unlink+reopen
    // triggers the NAPI phantom-materialisation bug (see invariant above).
    // upsertBatch is idempotent by id, so replaying into a partial store is safe.
    let dstStore;
    try {
      dstStore = await openStore({ storagePath: memoryPath, dimensions });
    } catch (openErr) {
      // openStore itself threw — the partial file is genuinely corrupt.
      // Unlink it so a future process gets a clean create, leave the sentinel
      // so that future run still enters the (re)migration path, then rethrow.
      // NEVER reopen memoryPath in this process after this unlink.
      if (existsSync(memoryPath)) {
        try { unlinkSync(memoryPath); } catch { /* ignore */ }
      }
      throw openErr;
    }

    try {
      if (fullRecords.length > 0) {
        await dstStore.upsertBatch(fullRecords);
      }
      // If there are no agent-memory records, the store is opened-and-closed
      // empty. That materialises memory.nv on disk so existsSync is true and
      // the gate is stable — memory search never falls through to re-read
      // index.nv on subsequent calls.
    } finally {
      await dstStore.close();
    }

    // Migration complete. Remove sentinel so the gate sees memory.nv alone.
    try { unlinkSync(sentinelPath); } catch { /* ignore — best-effort */ }
  } catch (err) {
    // Any failure other than the corrupt-open case above (e.g. F2 lock on
    // index.nv): clean up the sentinel so the next call retries from scratch.
    // Do NOT unlink memoryPath here — if it was opened successfully before the
    // failure, it's a valid partial store that the next run can complete via
    // upsertBatch. Unlinking it would trigger the phantom-materialisation bug
    // on re-entry in the same process.
    try { unlinkSync(sentinelPath); } catch { /* ignore */ }
    throw err;
  }
}

export async function cmdMemoryStore(opts: MemoryStoreOptions): Promise<number> {
  const { value, wu, agent, key } = opts;

  if (!value || value.trim().length === 0) {
    console.error('memory store: --value is required and must be non-empty');
    return 1;
  }

  const { selectEmbedderFromEnv } = await import('../embedder/select.js');
  const { openStore, TENANT } = await import('../store/open.js');

  const buildRoot = resolveBuildRoot(opts.buildRoot, { cwd: opts.cwd ?? process.cwd() });
  // Resolve the memory-specific path (memory.nv), falling back to the
  // legacy `index` flag for callers that pass it, then the default.
  const memoryFlag = opts.memory ?? opts.index;
  const memoryPath = resolveMemoryPath(buildRoot, memoryFlag);
  const indexPath = resolveIndexPath(buildRoot, undefined);

  const embedder = await selectEmbedderFromEnv();

  // Lazy one-time migration: move existing agent-memory records from
  // index.nv into memory.nv on the first memory command run.
  await migrateMemoryRecordsIfNeeded(indexPath, memoryPath, embedder.dimensions);

  const store = await openStore({ storagePath: memoryPath, dimensions: embedder.dimensions });

  const [embedding] = await embedder.embed([value]);

  await store.upsert({
    id: randomUUID(),
    kind: MEMORY_KIND,
    embedding,
    text: value,
    tenant: TENANT,
    metadata: {
      agent_role: agent ?? '',
      work_unit: wu ?? '',
      key: key ?? '',
      timestamp: new Date().toISOString(),
    },
  });

  const label = key ? ` [${key}]` : '';
  const context = [agent, wu].filter(Boolean).join(' / ');
  console.log(`memory stored${label}${context ? ` (${context})` : ''}`);
  return 0;
}

export async function cmdMemorySearch(opts: MemorySearchOptions): Promise<number> {
  const { query, limit = 5, wu, agent } = opts;

  if (!query || query.trim().length === 0) {
    console.error('memory search: --query is required and must be non-empty');
    return 1;
  }

  const { selectEmbedderFromEnv } = await import('../embedder/select.js');
  const { openStore, TENANT } = await import('../store/open.js');

  const buildRoot = resolveBuildRoot(opts.buildRoot, { cwd: opts.cwd ?? process.cwd() });
  // Resolve the memory-specific path (memory.nv), falling back to the
  // legacy `index` flag for callers that pass it, then the default.
  const memoryFlag = opts.memory ?? opts.index;
  const memoryPath = resolveMemoryPath(buildRoot, memoryFlag);
  const indexPath = resolveIndexPath(buildRoot, undefined);

  const embedder = await selectEmbedderFromEnv();

  // Lazy one-time migration: move existing agent-memory records from
  // index.nv into memory.nv on the first memory command run.
  await migrateMemoryRecordsIfNeeded(indexPath, memoryPath, embedder.dimensions);

  const store = await openStore({ storagePath: memoryPath, dimensions: embedder.dimensions });

  const [queryEmbedding] = await embedder.embed([query]);

  const result = await store.retrieveContext({
    embedding: queryEmbedding,
    tenant: TENANT,
    topK: Math.max(limit * 4, 20),
    filters: { kind: MEMORY_KIND },
  });

  const raw = (result?.items ?? []) as Array<{
    ref?: string;
    score?: number;
    text?: string;
    metadata?: Record<string, unknown>;
  }>;

  let hits: MemoryHit[] = raw
    .filter((r) => typeof r.score === 'number' && r.score > 0.3)
    .map((r) => ({
      id: r.ref ?? '',
      score: r.score ?? 0,
      text: r.text ?? '',
      agentRole: String(r.metadata?.agent_role ?? ''),
      workUnit: String(r.metadata?.work_unit ?? ''),
      key: String(r.metadata?.key ?? ''),
      timestamp: String(r.metadata?.timestamp ?? ''),
    }));

  // Post-filter by wu / agent when requested
  if (wu) {
    hits = hits.filter((h) => h.workUnit === wu || h.workUnit === normaliseWu(wu));
  }
  if (agent) {
    hits = hits.filter((h) => h.agentRole === agent);
  }

  hits = hits.slice(0, limit);

  if (hits.length === 0) {
    console.log(`no memories found (query: "${query}")`);
    return 0;
  }

  console.log(`${hits.length} memor${hits.length === 1 ? 'y' : 'ies'} found (query: "${query}")\n`);
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const score = h.score.toFixed(2);
    const ctx = [h.workUnit, h.agentRole].filter(Boolean).join(' | ');
    const date = h.timestamp ? h.timestamp.slice(0, 10) : '';
    const header = [ctx, date].filter(Boolean).join(' | ');
    const keyLabel = h.key ? ` [${h.key}]` : '';
    console.log(`[${i + 1}] (score: ${score})${keyLabel}${header ? ` — ${header}` : ''}`);
    console.log(`    ${h.text.replace(/\n/g, '\n    ')}`);
    if (i < hits.length - 1) console.log('');
  }

  return 0;
}

function normaliseWu(handle: string): string {
  const m = handle.match(/(\d+)/);
  if (!m) return handle;
  return `wu-${m[1].padStart(3, '0')}`;
}
