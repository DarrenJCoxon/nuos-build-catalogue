/**
 * Phase I — markdown regeneration + drift report (WU 111).
 *
 * **Mode 1 (today):** markdown is canonical; this module is a
 * verification gate. For each record in the workflow store, compare
 * the stored `rawMarkdown` to the file at `record.sourcePath`. Any
 * difference is reported as drift.
 *
 * **Mode 2 (post-WU-113):** workflow state is canonical; this module
 * regenerates markdown from rich field-level data (which we don't have
 * yet — Phase G stopped at count parity, not field-level fidelity).
 * Mode 2 is out of scope until WU 113.
 */

import type { Register } from '../migrate/types.js';

export type DriftKind =
  | 'identical' // file == record.rawMarkdown
  | 'differs' // contents differ
  | 'missing-source' // record exists but the source file is gone
  | 'unreadable-source'; // file present but couldn't be read

export interface DriftEntry {
  handle: string;
  register: Register;
  sourcePath: string;
  kind: DriftKind;
  /** Set when kind === 'differs'. Number of bytes the two contents differ by (rough magnitude). */
  byteDelta?: number;
  /** Set when kind === 'differs'. Lines added vs the stored record. */
  linesAdded?: number;
  /** Set when kind === 'differs'. Lines removed vs the stored record. */
  linesRemoved?: number;
  /** Set when kind === 'missing-source' or 'unreadable-source'. */
  errorMessage?: string;
}

export interface DriftReport {
  total: number;
  identical: number;
  differs: number;
  missing: number;
  unreadable: number;
  byRegister: Record<Register, { total: number; identical: number; differs: number; missing: number; unreadable: number }>;
  /** Only the non-identical entries; the identical ones are summarised by counts. */
  drifted: DriftEntry[];
  durationMs: number;
}

export interface RegenerateConfig {
  /** Filter to a single register; default scans all four. */
  registerFilter?: Register;
  /** When true, overwrite source files with stored `rawMarkdown` (Mode 2 cutover). Off by default. */
  write?: boolean;
}
