/**
 * Crawler — walks the NuOS catalogue tree picking up indexable .md files.
 *
 * Per WU 110 spec:
 *   - includes: docs/build/**, docs/contracts/**, docs/philosophy/**,
 *     docs/guides/**, plus top-level docs/build/STATE.md, BUILD-ORDER.md,
 *     README.md, reference-index.md
 *   - skips: _index.md (derived; adds noise), done/, archive/, superseded/
 *     subdirs (opt-in via includeArchived)
 *   - skips: .excalidraw, binary
 */

import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export interface CrawlOptions {
  catalogueRoot: string; // absolute path to docs/
  includeArchived?: boolean;
}

export interface CrawledFile {
  absolutePath: string;
  relativePath: string; // relative to catalogueRoot
}

const TOP_LEVEL_INCLUDES = ['build', 'contracts', 'philosophy', 'guides'];

const SKIPPED_DIR_NAMES = new Set(['node_modules', '.git', '.nuos-catalogue']);
const ARCHIVED_DIR_NAMES = new Set(['done', 'archive', 'superseded']);
const INDEX_FILENAMES = new Set(['_index.md']);

export async function crawl(options: CrawlOptions): Promise<CrawledFile[]> {
  const out: CrawledFile[] = [];
  for (const top of TOP_LEVEL_INCLUDES) {
    const start = path.join(options.catalogueRoot, top);
    if (await exists(start)) {
      await walkDir(start, options, out);
    }
  }
  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function walkDir(
  dir: string,
  options: CrawlOptions,
  out: CrawledFile[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIR_NAMES.has(entry.name)) continue;
      if (!options.includeArchived && ARCHIVED_DIR_NAMES.has(entry.name)) continue;
      await walkDir(full, options, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    if (INDEX_FILENAMES.has(entry.name)) continue;

    out.push({
      absolutePath: full,
      relativePath: path.relative(options.catalogueRoot, full),
    });
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
