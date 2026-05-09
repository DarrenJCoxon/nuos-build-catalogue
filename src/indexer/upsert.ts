/**
 * Index orchestrator — crawl + chunk + extract metadata + embed + upsert.
 *
 * Hash-based incremental: a separate `.nuos-catalogue/hashes.json` tracks
 * the last-indexed content hash per file. Unchanged files are skipped.
 * Deleted files are removed from the index.
 */

import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

import type { NuVector } from '@nusoft/nuvector';
import type { Embedder } from '../embedder/types.js';
import { crawl, type CrawledFile } from './crawl.js';
import { chunkMarkdown, type Chunk } from './chunk.js';
import { extractMetadata, type FileMeta } from './metadata.js';
import { TENANT } from '../store/open.js';

export interface IndexConfig {
  catalogueRoot: string; // absolute path to docs/
  hashFilePath: string; // absolute path to hashes.json
  store: NuVector;
  embedder: Embedder;
  force?: boolean;
  dryRun?: boolean;
}

export interface IndexReport {
  indexed: number;
  updated: number;
  deleted: number;
  unchanged: number;
  chunks: number;
  durationMs: number;
}

interface HashTable {
  // file relative path → { sha, chunkIds[] }
  [relPath: string]: { sha: string; chunkIds: string[] };
}

export async function runIndex(config: IndexConfig): Promise<IndexReport> {
  const startedAt = Date.now();
  const files = await crawl({ catalogueRoot: config.catalogueRoot });

  const previous = await loadHashes(config.hashFilePath);
  const next: HashTable = {};

  let indexed = 0;
  let updated = 0;
  let unchanged = 0;
  let totalChunks = 0;

  type ChunkUpsert = {
    chunkId: string;
    text: string;
    embedding: Float32Array;
    fileMeta: FileMeta;
    headings: string[];
    startLine: number;
    endLine: number;
  };

  // Collect chunks for files that need (re)indexing
  const pending: Array<{ file: CrawledFile; chunks: Chunk[]; meta: FileMeta; sha: string }> = [];

  for (const file of files) {
    const content = await readFile(file.absolutePath, 'utf8');
    const sha = sha256(content);
    const prev = previous[file.relativePath];

    if (!config.force && prev && prev.sha === sha) {
      unchanged += 1;
      next[file.relativePath] = prev;
      continue;
    }

    const meta = await extractMetadata(file.absolutePath, file.relativePath, content);
    const chunks = chunkMarkdown(file.relativePath, content);

    pending.push({ file, chunks, meta, sha });
    totalChunks += chunks.length;
    if (prev) updated += 1;
    else indexed += 1;
  }

  // Embed and upsert pending chunks in batches
  if (pending.length > 0 && !config.dryRun) {
    const allUpserts: ChunkUpsert[] = [];
    for (const item of pending) {
      const texts = item.chunks.map((c) => c.text);
      const embeddings = await config.embedder.embed(texts);
      item.chunks.forEach((c, i) => {
        allUpserts.push({
          chunkId: c.id,
          text: c.text,
          embedding: embeddings[i],
          fileMeta: item.meta,
          headings: c.headings,
          startLine: c.startLine,
          endLine: c.endLine,
        });
      });

      // Remove any old chunk ids that are no longer present
      const oldIds = new Set(previous[item.file.relativePath]?.chunkIds ?? []);
      const currentIds = new Set(item.chunks.map((c) => c.id));
      for (const stale of oldIds) {
        if (!currentIds.has(stale)) {
          await safeDelete(config.store, stale);
        }
      }

      next[item.file.relativePath] = {
        sha: item.sha,
        chunkIds: item.chunks.map((c) => c.id),
      };
    }

    for (const u of allUpserts) {
      // Indexed as document_chunk because that's what these are: chunks
      // of standalone markdown documents, not NuWiki articles with
      // section/citation/graph structure. Search uses retrieveContext()
      // (not searchKnowledge, which is the NuWiki four-layer entry point).
      await config.store.upsert({
        id: u.chunkId,
        kind: 'document_chunk',
        embedding: u.embedding,
        text: u.text,
        tenant: TENANT,
        metadata: {
          path: u.fileMeta.path,
          file_kind: u.fileMeta.kind,
          id_in_kind: u.fileMeta.idInKind ?? '',
          status: u.fileMeta.status ?? '',
          date: u.fileMeta.date ?? '',
          headings: u.headings.join(' / '),
          start_line: u.startLine,
          end_line: u.endLine,
          cross_refs: u.fileMeta.crossRefs.join(','),
        },
      });
    }
  }

  // Detect and remove files that vanished
  let deleted = 0;
  for (const oldRelPath of Object.keys(previous)) {
    if (!files.some((f) => f.relativePath === oldRelPath)) {
      deleted += 1;
      if (!config.dryRun) {
        for (const id of previous[oldRelPath].chunkIds) {
          await safeDelete(config.store, id);
        }
      }
    }
  }

  if (!config.dryRun) {
    await saveHashes(config.hashFilePath, next);
  }

  return {
    indexed,
    updated,
    deleted,
    unchanged,
    chunks: totalChunks,
    durationMs: Date.now() - startedAt,
  };
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function loadHashes(filePath: string): Promise<HashTable> {
  if (!existsSync(filePath)) return {};
  try {
    const buf = await readFile(filePath, 'utf8');
    return JSON.parse(buf) as HashTable;
  } catch {
    return {};
  }
}

async function saveHashes(filePath: string, table: HashTable): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(table, null, 2) + '\n', 'utf8');
}

async function safeDelete(store: NuVector, id: string): Promise<void> {
  try {
    await (store as unknown as { delete: (q: unknown) => Promise<unknown> }).delete({
      ids: [id],
      tenant: TENANT,
    });
  } catch {
    // NuVector v0.1.0 delete API shape may vary; failure here is non-fatal
  }
}
