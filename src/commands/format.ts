/**
 * Shared formatters for the read-side CLI commands.
 *
 * Two output modes per list/show pair: human-readable (default) for
 * terminal use; JSON (`--json`) for piping into other tools. Tabular
 * output uses a minimal per-line width-aware formatter to keep the
 * dep graph small (no `cli-table3` etc.).
 */

import type { MigratedRecord, Register } from '../migrate/types.js';

const STATUS_FALLBACK = '—';

export interface ListFilter {
  status?: string;
  limit?: number;
}

export function filterRecords(
  records: readonly MigratedRecord[],
  register: Register,
  filter: ListFilter
): MigratedRecord[] {
  let result = records.filter((r) => r.register === register);
  if (filter.status) {
    const needle = filter.status.toLowerCase();
    result = result.filter((r) => (r.status ?? '').toLowerCase().includes(needle));
  }
  result = sortByHandle(result);
  if (filter.limit && filter.limit > 0) {
    result = result.slice(0, filter.limit);
  }
  return result;
}

export function sortByHandle(records: readonly MigratedRecord[]): MigratedRecord[] {
  return [...records].sort((a, b) => {
    if (a.number !== b.number) return a.number - b.number;
    return a.handle.localeCompare(b.handle);
  });
}

export function formatListHuman(records: readonly MigratedRecord[]): string {
  if (records.length === 0) return '(no records match)';
  const widths = computeWidths(records);
  const lines: string[] = [];
  for (const r of records) {
    const handle = r.handle.padEnd(widths.handle);
    const status = (r.status ?? STATUS_FALLBACK).padEnd(widths.status);
    lines.push(`  ${handle}  ${status}  ${r.title}`);
  }
  lines.push('');
  lines.push(`  (${records.length} record${records.length === 1 ? '' : 's'})`);
  return lines.join('\n');
}

export function formatListJson(records: readonly MigratedRecord[]): string {
  return JSON.stringify(
    records.map((r) => ({
      handle: r.handle,
      number: r.number,
      register: r.register,
      title: r.title,
      status: r.status,
      slug: r.slug,
      sourcePath: r.sourcePath,
    })),
    null,
    2
  );
}

export function formatShowHuman(record: MigratedRecord): string {
  return [
    `# ${record.handle} — ${record.title}`,
    '',
    `register:        ${record.register}`,
    `number:          ${record.number}`,
    `status:          ${record.status ?? STATUS_FALLBACK}`,
    `slug:            ${record.slug}`,
    `source path:     ${record.sourcePath}`,
    `file modified:   ${record.fileModifiedAt}`,
    `migrated at:     ${record.migratedAt} (from ${record.migratedFrom})`,
    '',
    `--- markdown body (${record.rawMarkdown.length} chars) ---`,
    truncateBody(record.rawMarkdown, 2000),
  ].join('\n');
}

export function formatShowJson(record: MigratedRecord): string {
  return JSON.stringify(record, null, 2);
}

function computeWidths(records: readonly MigratedRecord[]): { handle: number; status: number } {
  let handle = 0;
  let status = 0;
  for (const r of records) {
    if (r.handle.length > handle) handle = r.handle.length;
    const s = (r.status ?? STATUS_FALLBACK).length;
    if (s > status) status = s;
  }
  return { handle, status };
}

function truncateBody(body: string, max: number): string {
  if (body.length <= max) return body;
  return body.slice(0, max) + `\n…[truncated; use --json for full body]`;
}
