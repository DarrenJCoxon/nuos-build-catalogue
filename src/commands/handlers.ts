/**
 * Per-register read-side handlers (list + show).
 *
 * Pure-ish: these read from a `WorkflowStore` and produce strings. The
 * CLI surface in `src/cli.ts` opens the store, calls the handler, and
 * prints the result.
 */

import type { Register, MigratedRecord } from '../migrate/types.js';
import type { WorkflowStore } from '../migrate/store.js';
import {
  filterRecords,
  formatListHuman,
  formatListJson,
  formatShowHuman,
  formatShowJson,
  type ListFilter,
} from './format.js';

export interface ListOptions extends ListFilter {
  asJson?: boolean;
}

export interface ShowOptions {
  asJson?: boolean;
}

export interface HandlerResult {
  output: string;
  exitCode: number;
}

export function listRegister(
  store: WorkflowStore,
  register: Register,
  options: ListOptions
): HandlerResult {
  const all = store.list();
  const matches = filterRecords(all, register, options);
  const output = options.asJson ? formatListJson(matches) : formatListHuman(matches);
  return { output, exitCode: 0 };
}

export function showRecord(
  store: WorkflowStore,
  register: Register,
  handle: string,
  options: ShowOptions
): HandlerResult {
  const normalised = normaliseHandle(register, handle);
  const record = store.get(normalised);
  if (!record) {
    return {
      output: `no ${register} record with handle "${normalised}" — try \`nuos-catalogue ${registerCommand(register)} list\``,
      exitCode: 1,
    };
  }
  if (record.register !== register) {
    return {
      output: `handle ${normalised} resolves to a ${record.register}, not a ${register}`,
      exitCode: 1,
    };
  }
  const output = options.asJson ? formatShowJson(record) : formatShowHuman(record);
  return { output, exitCode: 0 };
}

/**
 * Accept friendly variants like `111` (assumes work_unit), `wu-111`,
 * `WU 111`, `D45`, `Q9` — and normalise to the stored handle form.
 */
export function normaliseHandle(register: Register, raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  // If already in canonical form, accept verbatim.
  if (matchesCanonical(register, trimmed)) return trimmed;

  // Tolerate "WU 111" → "wu-111".
  const wu = /^WU\s*0?(\d{1,4})([a-z]?)$/i.exec(trimmed);
  if (wu && register === 'work_unit') {
    const num = wu[1].padStart(3, '0');
    return `wu-${num}${(wu[2] ?? '').toLowerCase()}`;
  }

  // Tolerate plain integers when the register is unambiguous.
  const intOnly = /^(\d{1,4})([a-z]?)$/i.exec(trimmed);
  if (intOnly) {
    const num = intOnly[1].padStart(3, '0');
    const suffix = (intOnly[2] ?? '').toLowerCase();
    switch (register) {
      case 'work_unit':
        return `wu-${num}${suffix}`;
      case 'decision':
        return `D${num}`;
      case 'open_question':
        return `Q${num}`;
      case 'persona':
        return `P${num}`;
    }
  }

  // Tolerate D45 / Q9 / P1 (under-padded) forms.
  const letter = /^([DQP])(\d{1,4})$/i.exec(trimmed);
  if (letter) {
    const prefix = letter[1].toUpperCase();
    const num = letter[2].padStart(3, '0');
    return `${prefix}${num}`;
  }

  // Fallback: return verbatim. The store lookup will return null and the
  // CLI surfaces a helpful error.
  return trimmed;
}

function matchesCanonical(register: Register, handle: string): boolean {
  switch (register) {
    case 'work_unit':
      return /^wu-\d{3,}[a-z]?$/.test(handle);
    case 'decision':
      return /^D\d{3,}$/.test(handle);
    case 'open_question':
      return /^Q\d{3,}$/.test(handle);
    case 'persona':
      return /^P\d{3,}$/.test(handle);
  }
}

export function registerCommand(register: Register): string {
  switch (register) {
    case 'work_unit':
      return 'wu';
    case 'decision':
      return 'decision';
    case 'open_question':
      return 'question';
    case 'persona':
      return 'persona';
  }
}

export function listAcrossRegisters(store: WorkflowStore): {
  byRegister: Record<Register, number>;
  total: number;
} {
  const byRegister: Record<Register, number> = {
    work_unit: 0,
    decision: 0,
    open_question: 0,
    persona: 0,
  };
  let total = 0;
  for (const r of store.list()) {
    byRegister[r.register] += 1;
    total += 1;
  }
  return { byRegister, total };
}

// Convenience guard for the CLI dispatcher.
export function isRegister(value: string): value is Register {
  return value === 'work_unit' || value === 'decision' || value === 'open_question' || value === 'persona';
}

export function commandToRegister(command: string): Register | null {
  switch (command) {
    case 'wu':
      return 'work_unit';
    case 'decision':
      return 'decision';
    case 'question':
      return 'open_question';
    case 'persona':
      return 'persona';
    default:
      return null;
  }
}

// Re-export MigratedRecord for tests that import via this module.
export type { MigratedRecord };
