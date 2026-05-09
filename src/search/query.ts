/**
 * Search — embed the query, call NuVector.searchKnowledge, format results.
 */

import type { NuVector } from '@nusoft/nuvector';
import type { Embedder } from '../embedder/types.js';
import { TENANT } from '../store/open.js';

export interface SearchOptions {
  query: string;
  limit?: number;
  kind?: string; // FileKind name
  status?: string;
}

export interface SearchHit {
  chunkId: string;
  path: string;
  fileKind: string;
  idInKind: string;
  status: string;
  date: string;
  headings: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
}

export async function runSearch(
  store: NuVector,
  embedder: Embedder,
  options: SearchOptions,
): Promise<{ hits: SearchHit[]; embedMs: number; searchMs: number }> {
  const limit = options.limit ?? 10;

  const t1 = Date.now();
  const [queryEmbedding] = await embedder.embed([options.query]);
  const embedMs = Date.now() - t1;

  const t2 = Date.now();
  // Use retrieveContext (not searchKnowledge — that's the NuWiki four-layer
  // entry point and only returns Layer 1 article summaries). For arbitrary
  // document chunks like the catalogue indexer's, retrieveContext + kind
  // filter is the correct method.
  const result = await store.retrieveContext({
    embedding: queryEmbedding,
    tenant: TENANT,
    topK: Math.max(limit * 3, 30),
    filters: { kind: 'document_chunk' },
  });
  const searchMs = Date.now() - t2;

  const items = (result?.items ?? []) as Array<{
    ref?: string;
    score?: number;
    text?: string;
    summary?: string;
    metadata?: Record<string, unknown>;
  }>;

  let hits: SearchHit[] = items.map((it) => {
    const meta = it.metadata ?? {};
    return {
      chunkId: String(it.ref ?? ''),
      path: String(meta.path ?? ''),
      fileKind: String(meta.file_kind ?? ''),
      idInKind: String(meta.id_in_kind ?? ''),
      status: String(meta.status ?? ''),
      date: String(meta.date ?? ''),
      headings: String(meta.headings ?? ''),
      startLine: Number(meta.start_line ?? 0),
      endLine: Number(meta.end_line ?? 0),
      score: Number(it.score ?? 0),
      snippet: makeSnippet(String(it.text ?? it.summary ?? ''), options.query),
    };
  });

  if (options.kind) {
    hits = hits.filter((h) => h.fileKind === options.kind);
  }
  if (options.status) {
    hits = hits.filter((h) => h.status.toLowerCase().includes(options.status!.toLowerCase()));
  }

  return { hits: hits.slice(0, limit), embedMs, searchMs };
}

function makeSnippet(text: string, query: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= 200) return flat;

  const tokens = query
    .toLowerCase()
    .split(/\s+/u)
    .filter((t) => t.length > 2);

  let bestIdx = -1;
  for (const tok of tokens) {
    const idx = flat.toLowerCase().indexOf(tok);
    if (idx >= 0) {
      bestIdx = idx;
      break;
    }
  }
  if (bestIdx === -1) {
    return flat.slice(0, 200) + '…';
  }
  const start = Math.max(0, bestIdx - 60);
  const end = Math.min(flat.length, bestIdx + 140);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < flat.length ? '…' : '';
  return prefix + flat.slice(start, end) + suffix;
}
