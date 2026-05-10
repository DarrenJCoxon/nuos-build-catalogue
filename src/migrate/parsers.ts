/**
 * Per-register markdown parsers.
 *
 * Each parser tolerates the pre-D046 shape — fields that may or may not
 * be present default to null. The shared shape extracted is title +
 * status; the rest of the file body is preserved verbatim in
 * `rawMarkdown`.
 */

import { stat } from 'node:fs/promises';
import path from 'node:path';

import type { MigratedRecord, Register } from './types.js';

// WU filenames may carry a single lowercase-letter suffix to denote
// sub-WUs that share a parent number (e.g. 030g-..., 072a-..., 072b-...).
// The integer `number` is the digit portion; the `handle` carries the
// suffix verbatim so wu-030 and wu-030g remain distinct records.
const FILENAME_PATTERNS: Record<Register, RegExp> = {
  work_unit: /^(?<num>\d{1,4})(?<suffix>[a-z]?)-(?<slug>.+)\.md$/,
  decision: /^D(?<num>\d{3,})-(?<slug>.+)\.md$/,
  open_question: /^Q(?<num>\d{3,})-(?<slug>.+)\.md$/,
  persona: /^P(?<num>\d{3,})-(?<slug>.+)\.md$/,
};

export interface ParseFileInput {
  absolutePath: string;
  relativePath: string; // relative to catalogue root (e.g. 'work-units/done/111-foo.md')
  content: string;
  register: Register;
}

export async function parseFile(input: ParseFileInput): Promise<MigratedRecord> {
  const { absolutePath, relativePath, content, register } = input;
  const filename = path.basename(relativePath);

  // Skip _index.md and template files in the parent walker — but if they
  // ever reach here, fail loudly so we don't silently migrate noise.
  if (filename.startsWith('_') || filename.includes('template')) {
    throw new Error(
      `parseFile: ${relativePath} looks like a non-artefact file (index/template); the walker should have skipped it`
    );
  }

  const pattern = FILENAME_PATTERNS[register];
  const match = pattern.exec(filename);
  if (!match || !match.groups) {
    throw new Error(
      `parseFile: ${relativePath} does not match the ${register} filename pattern ${pattern}`
    );
  }
  const number = parseInt(match.groups.num, 10);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`parseFile: ${relativePath} produced invalid number ${match.groups.num}`);
  }
  const slug = match.groups.slug;
  const suffix = match.groups.suffix ?? '';

  const handle = formatHandle(register, number, suffix);
  const title = extractTitle(content) ?? slugToTitle(slug);
  const status = extractStatus(content);

  let fileModifiedAt: string;
  try {
    const s = await stat(absolutePath);
    fileModifiedAt = s.mtime.toISOString();
  } catch {
    fileModifiedAt = new Date().toISOString();
  }

  const record: MigratedRecord = {
    handle,
    number,
    register,
    title,
    status,
    slug,
    sourcePath: relativePath,
    rawMarkdown: content,
    fileModifiedAt,
    migratedAt: new Date().toISOString(),
    migratedFrom: 'markdown',
  };

  return record;
}

function formatHandle(register: Register, n: number, suffix = ''): string {
  switch (register) {
    case 'work_unit':
      return `wu-${String(n).padStart(3, '0')}${suffix}`;
    case 'decision':
      return `D${String(n).padStart(3, '0')}`;
    case 'open_question':
      return `Q${String(n).padStart(3, '0')}`;
    case 'persona':
      return `P${String(n).padStart(3, '0')}`;
  }
}

function extractTitle(content: string): string | null {
  // First H1 wins. Leading whitespace and trailing whitespace trimmed.
  const m = /^#\s+(.+?)\s*$/m.exec(content);
  if (!m) return null;
  return m[1].trim();
}

function extractStatus(content: string): string | null {
  // Recognise both "**Status:** ..." (decisions, sessions) and
  // "| Status | ... |" pipe-table rows (some WUs use a metadata table).
  // Returns the raw status string for downstream interpretation; we
  // don't normalise to a typed enum here because the pre-D046 shape
  // includes states like "🟢 ready" with emoji prefixes.
  const bold = /^\*\*Status:\*\*\s*(.+?)\s*$/m.exec(content);
  if (bold) return bold[1].trim();
  const table = /^\|\s*Status\s*\|\s*(.+?)\s*\|\s*$/m.exec(content);
  if (table) return table[1].trim();
  return null;
}

function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

export function registerForRelativePath(relativePath: string): Register | null {
  // The walker uses this to assign each file to a register based on its
  // top-level directory. Subdirectories like work-units/done/ and
  // decisions/superseded/ map to the parent register.
  const normalised = relativePath.replace(/\\/g, '/');
  const top = normalised.split('/')[0];
  switch (top) {
    case 'work-units':
      return 'work_unit';
    case 'decisions':
      return 'decision';
    case 'open-questions':
      return 'open_question';
    case 'personas':
      return 'persona';
    default:
      return null;
  }
}
