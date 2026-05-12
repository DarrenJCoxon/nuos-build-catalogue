/**
 * `nuos-catalogue memory store` — embed a finding and persist it to NuVector.
 * `nuos-catalogue memory search` — retrieve relevant past findings by query.
 *
 * Cross-agent memory: every agent in a swarm can write findings here and
 * any future agent (in this run or a later one) can retrieve them by
 * semantic query. Uses the same NuVector store as the catalogue index,
 * distinguished by kind: 'agent_memory'.
 *
 * CLI:
 *   memory store  --value="..."  [--wu=wu-007] [--agent=architect] [--key="label"]
 *   memory search --query="..."  [--limit=N]   [--wu=wu-007]       [--agent=architect]
 */

import { randomUUID } from 'node:crypto';
import { resolveBuildRoot, resolveIndexPath } from '../path-resolution.js';

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
  index?: string | boolean;
}

export interface MemorySearchOptions {
  query: string;
  limit?: number;
  wu?: string;
  agent?: string;
  cwd?: string;
  buildRoot?: string | boolean;
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

export async function cmdMemoryStore(opts: MemoryStoreOptions): Promise<number> {
  const { value, wu, agent, key } = opts;

  if (!value || value.trim().length === 0) {
    console.error('memory store: --value is required and must be non-empty');
    return 1;
  }

  const { selectEmbedderFromEnv } = await import('../embedder/select.js');
  const { openStore, TENANT } = await import('../store/open.js');

  const buildRoot = resolveBuildRoot(opts.buildRoot, { cwd: opts.cwd ?? process.cwd() });
  const indexPath = resolveIndexPath(buildRoot, opts.index);

  const embedder = await selectEmbedderFromEnv();
  const store = await openStore({ storagePath: indexPath, dimensions: embedder.dimensions });

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
  const indexPath = resolveIndexPath(buildRoot, opts.index);

  const embedder = await selectEmbedderFromEnv();
  const store = await openStore({ storagePath: indexPath, dimensions: embedder.dimensions });

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
