/**
 * Migration runner.
 *
 * Walks the four register directories under the catalogue root, parses
 * each artefact file, and writes a `MigratedRecord` to the JSON-backed
 * workflow store. Idempotent: re-running on a clean catalogue produces
 * zero new records on the second pass.
 *
 * Per the WU 111 spec, this runner does NOT use the NuFlow runtime
 * lifecycle. Migration is bulk back-fill, not a series of build-
 * maintainer decisions; using the runtime would force every legacy
 * artefact through propose → confirm → approve → commit, which is
 * neither honest nor scalable.
 */

import { readdir, readFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';

import type {
  MigratedRecord,
  MigrationReport,
  HandleConflict,
  Register,
} from './types.js';
import { parseFile, registerForRelativePath } from './parsers.js';
import type { WorkflowStore } from './store.js';

export interface RunMigrateConfig {
  catalogueRoot: string; // absolute path to nuos/docs/build/
  store: WorkflowStore;
  dryRun?: boolean;
}

const REGISTER_DIRS: Register[] = ['work_unit', 'decision', 'open_question', 'persona'];

const REGISTER_TO_DIRNAME: Record<Register, string> = {
  work_unit: 'work-units',
  decision: 'decisions',
  open_question: 'open-questions',
  persona: 'personas',
};

export async function runMigrate(config: RunMigrateConfig): Promise<MigrationReport> {
  const startedAt = Date.now();

  const byRegister: MigrationReport['byRegister'] = {
    work_unit: { scanned: 0, migrated: 0, skipped: 0 },
    decision: { scanned: 0, migrated: 0, skipped: 0 },
    open_question: { scanned: 0, migrated: 0, skipped: 0 },
    persona: { scanned: 0, migrated: 0, skipped: 0 },
  };

  let scanned = 0;
  let migrated = 0;
  let skipped = 0;
  const conflicts: HandleConflict[] = [];

  for (const register of REGISTER_DIRS) {
    const dirName = REGISTER_TO_DIRNAME[register];
    const baseDir = path.join(config.catalogueRoot, dirName);
    const files = await collectArtefactFiles(baseDir, dirName);

    for (const relPath of files) {
      const inferredRegister = registerForRelativePath(relPath);
      if (inferredRegister !== register) {
        // Defensive: shouldn't happen given the walker scoping above.
        throw new Error(
          `runMigrate: register mismatch for ${relPath} (expected ${register}, got ${inferredRegister})`
        );
      }

      const absolutePath = path.join(config.catalogueRoot, relPath);
      const content = await readFile(absolutePath, 'utf8');
      const record: MigratedRecord = await parseFile({
        absolutePath,
        relativePath: relPath,
        content,
        register,
      });

      scanned += 1;
      byRegister[register].scanned += 1;

      if (config.store.has(record.handle)) {
        const existing = config.store.get(record.handle);
        if (existing && existing.sourcePath !== record.sourcePath) {
          // A different file claimed this handle. This is a real
          // catalogue-discipline issue (e.g. two WUs sharing the same
          // number prefix); surface it rather than silently dropping.
          conflicts.push({
            handle: record.handle,
            winnerSourcePath: existing.sourcePath,
            loserSourcePath: record.sourcePath,
          });
        }
        skipped += 1;
        byRegister[register].skipped += 1;
        continue;
      }

      if (!config.dryRun) {
        config.store.put(record);
      }
      migrated += 1;
      byRegister[register].migrated += 1;
    }
  }

  if (!config.dryRun) {
    await config.store.flush();
  }

  return {
    scanned,
    migrated,
    skipped,
    conflicts,
    byRegister,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * After in-memory store-puts, we still need to detect within-pass
 * conflicts. The block above handles that via `config.store.has()` +
 * `get()`; the result lands in the report's `conflicts` array.
 *
 * Collect markdown artefact files under a register directory, including
 * one level of subdirectory (e.g. work-units/done, decisions/superseded).
 * Skips index files (`_index.md`), templates (filename includes
 * 'template'), and any non-.md files.
 */
async function collectArtefactFiles(
  baseDir: string,
  registerDirName: string
): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = (await readdir(baseDir, { withFileTypes: true })) as unknown as Dirent[];
  } catch {
    // Register directory may not exist (e.g. personas/ before any
    // persona is authored). Treat as empty.
    return [];
  }

  const files: string[] = [];

  for (const entry of entries) {
    const entryName: string = entry.name;
    if (entry.isFile() && isArtefactFile(entryName)) {
      files.push(`${registerDirName}/${entryName}`);
    } else if (entry.isDirectory()) {
      // Recurse one level for done/, superseded/, etc.
      const subPath = path.join(baseDir, entryName);
      const subEntries = (await readdir(subPath, { withFileTypes: true })) as unknown as Dirent[];
      for (const sub of subEntries) {
        const subName: string = sub.name;
        if (sub.isFile() && isArtefactFile(subName)) {
          files.push(`${registerDirName}/${entryName}/${subName}`);
        }
      }
    }
  }

  return files;
}

function isArtefactFile(filename: string): boolean {
  if (!filename.endsWith('.md')) return false;
  if (filename.startsWith('_')) return false; // _index.md, _template, etc.
  if (filename.toLowerCase().includes('template')) return false;
  if (filename.toLowerCase().endsWith('-template.md')) return false;
  return true;
}
