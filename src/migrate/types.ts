/**
 * Minimal shapes the migrate runner produces. Phase G ships count-parity
 * across the four registers (work_unit, decision, open_question,
 * persona); rich field-level fidelity is deferred to the post-cutover
 * authoring path (workflows write the new shape directly).
 *
 * The migration is a back-fill: the live catalogue's pre-D046 WUs and
 * decisions don't have the new fields in their markdown, so the parser
 * preserves the title, handle, number, status, slug, source path, raw
 * markdown, and file mtime. Future authoring-via-workflow operations
 * fill in the richer shape organically.
 */

export type Register = 'work_unit' | 'decision' | 'open_question' | 'persona';

export interface MigratedRecord {
  /** wu-NNN | D### | Q### | P### */
  handle: string;
  /** Numeric portion of the handle (e.g. 111 from wu-111). */
  number: number;
  /** Which register this record belongs to. */
  register: Register;
  /** First H1 heading from the file, or filename-derived fallback. */
  title: string;
  /** Status string parsed from the file, or null if not surfaced. */
  status: string | null;
  /** Filename slug (the kebab-cased portion after the number prefix). */
  slug: string;
  /** Path relative to the catalogue root (e.g. work-units/done/111-...). */
  sourcePath: string;
  /** Full markdown body, preserved for future re-parsing. */
  rawMarkdown: string;
  /** ISO timestamp — file mtime; preserves "original timestamp" per spec. */
  fileModifiedAt: string;
  /** ISO timestamp — when this record was migrated. */
  migratedAt: string;
  /** Always 'markdown' for Phase G; future phases may add other origins. */
  migratedFrom: 'markdown';
}

export interface MigrationReport {
  scanned: number;
  migrated: number;
  skipped: number;
  byRegister: Record<Register, { scanned: number; migrated: number; skipped: number }>;
  durationMs: number;
}
