/**
 * Drift detection: walk the workflow store, compare each record's
 * stored `rawMarkdown` to its source file, report differences.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import type { Register } from '../migrate/types.js';
import type { WorkflowStore } from '../migrate/store.js';
import type { DriftEntry, DriftReport, RegenerateConfig } from './types.js';
import { countLineDiff } from './diff.js';

export interface CheckRegenerateConfig extends RegenerateConfig {
  catalogueRoot: string;
  store: WorkflowStore;
}

const ZERO_PER_REGISTER = (): DriftReport['byRegister'][Register] => ({
  total: 0,
  identical: 0,
  differs: 0,
  missing: 0,
  unreadable: 0,
});

export async function runRegenerate(config: CheckRegenerateConfig): Promise<DriftReport> {
  const startedAt = Date.now();
  const records = config.store.list();
  const filtered = config.registerFilter
    ? records.filter((r) => r.register === config.registerFilter)
    : records;

  const byRegister: DriftReport['byRegister'] = {
    work_unit: ZERO_PER_REGISTER(),
    decision: ZERO_PER_REGISTER(),
    open_question: ZERO_PER_REGISTER(),
    persona: ZERO_PER_REGISTER(),
  };

  let identical = 0;
  let differs = 0;
  let missing = 0;
  let unreadable = 0;
  const drifted: DriftEntry[] = [];

  for (const record of filtered) {
    const sourceAbsolute = path.join(config.catalogueRoot, record.sourcePath);
    byRegister[record.register].total += 1;

    if (!existsSync(sourceAbsolute)) {
      missing += 1;
      byRegister[record.register].missing += 1;
      drifted.push({
        handle: record.handle,
        register: record.register,
        sourcePath: record.sourcePath,
        kind: 'missing-source',
        errorMessage: `source file does not exist at ${sourceAbsolute}`,
      });
      continue;
    }

    let onDisk: string;
    try {
      onDisk = await readFile(sourceAbsolute, 'utf8');
    } catch (err) {
      unreadable += 1;
      byRegister[record.register].unreadable += 1;
      drifted.push({
        handle: record.handle,
        register: record.register,
        sourcePath: record.sourcePath,
        kind: 'unreadable-source',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (onDisk === record.rawMarkdown) {
      identical += 1;
      byRegister[record.register].identical += 1;
      continue;
    }

    if (config.write) {
      // Mode 2 cutover — overwrite the source with the stored canonical
      // form. Recorded as drift but resolved-by-write.
      await writeFile(sourceAbsolute, record.rawMarkdown, 'utf8');
    }

    const counts = countLineDiff(record.rawMarkdown, onDisk);
    differs += 1;
    byRegister[record.register].differs += 1;
    drifted.push({
      handle: record.handle,
      register: record.register,
      sourcePath: record.sourcePath,
      kind: 'differs',
      byteDelta: Math.abs(onDisk.length - record.rawMarkdown.length),
      linesAdded: counts.added,
      linesRemoved: counts.removed,
    });
  }

  return {
    total: filtered.length,
    identical,
    differs,
    missing,
    unreadable,
    byRegister,
    drifted,
    durationMs: Date.now() - startedAt,
  };
}
