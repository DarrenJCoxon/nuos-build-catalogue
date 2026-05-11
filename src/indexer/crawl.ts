/**
 * Crawler — walks the catalogue's `docs/` tree picking up indexable .md files.
 *
 * Default behaviour (0.14.2+): recursive crawl of EVERYTHING under
 * `docs/`, including top-level loose markdown files and every subdirectory.
 * The earlier hardcoded allowlist of four subdirs (`build/`, `contracts/`,
 * `philosophy/`, `guides/`) silently excluded strategic content that lives
 * elsewhere — top-level docs like `THE-NUOS-BUILD-METHOD.md`,
 * `MVP-NEXT-STEPS.md`, `PHASE-4-SIGNOFF.md`, and subdirs like
 * `architecture/`, `integration/`, `investor/`, `wireframes/`. Those are
 * load-bearing strategic context and need to be searchable.
 *
 * Skipped:
 *   - `_index.md` (derived; adds noise to ranking)
 *   - `*-template.md` (templates, not real content)
 *   - `done/`, `archive/`, `superseded/` subdirs (opt-in via includeArchived)
 *   - `node_modules/`, `.git/`, `.nuos-catalogue/`
 *   - non-`.md` files (binaries, .excalidraw, etc.)
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

const SKIPPED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.nuos-catalogue',
  '.opencode',
  '.claude',
  '.agents',
]);
const ARCHIVED_DIR_NAMES = new Set(['done', 'archive', 'superseded']);
const INDEX_FILENAMES = new Set(['_index.md']);

function isTemplateName(name: string): boolean {
  // Catches `001-template-simple.md`, `module-template.md`, `_template.md`,
  // `99-template-power-user-operational-plan.md`, etc.
  return /template\.md$/.test(name) || name === '_template.md';
}

export async function crawl(options: CrawlOptions): Promise<CrawledFile[]> {
  const out: CrawledFile[] = [];
  await walkDir(options.catalogueRoot, options, out);
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
    if (isTemplateName(entry.name)) continue;

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
