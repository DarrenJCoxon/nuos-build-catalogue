/**
 * JSON-backed workflow record store.
 *
 * Phase G uses a flat JSON file at `.nuos-catalogue/workflows.json` for
 * the migrated workflow records. Simple, inspectable, and sets up
 * Phase I cleanly (markdown regeneration reads from the same file).
 *
 * NuVector cutover is a deliberate follow-up. The store interface is
 * intentionally narrow (read by handle, write, list) so a NuVector
 * adapter can be substituted later without changing call sites.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import type { MigratedRecord } from './types.js';

interface WorkflowsFile {
  schemaVersion: 1;
  records: Record<string, MigratedRecord>;
}

export interface WorkflowStore {
  has(handle: string): boolean;
  get(handle: string): MigratedRecord | null;
  put(record: MigratedRecord): void;
  list(): MigratedRecord[];
  flush(): Promise<void>;
}

export async function openWorkflowStore(filePath: string): Promise<WorkflowStore> {
  const data = await load(filePath);

  return {
    has(handle: string): boolean {
      return Object.prototype.hasOwnProperty.call(data.records, handle);
    },
    get(handle: string): MigratedRecord | null {
      return data.records[handle] ?? null;
    },
    put(record: MigratedRecord): void {
      data.records[record.handle] = record;
    },
    list(): MigratedRecord[] {
      return Object.values(data.records);
    },
    async flush(): Promise<void> {
      await persist(filePath, data);
    },
  };
}

async function load(filePath: string): Promise<WorkflowsFile> {
  if (!existsSync(filePath)) {
    return { schemaVersion: 1, records: {} };
  }
  const raw = await readFile(filePath, 'utf8');
  if (raw.trim().length === 0) {
    return { schemaVersion: 1, records: {} };
  }
  const parsed = JSON.parse(raw);
  if (parsed.schemaVersion !== 1 || typeof parsed.records !== 'object') {
    throw new Error(
      `openWorkflowStore: ${filePath} has unrecognised shape (expected { schemaVersion: 1, records: {} })`
    );
  }
  return parsed as WorkflowsFile;
}

async function persist(filePath: string, data: WorkflowsFile): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
