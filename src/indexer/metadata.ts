/**
 * Per-file metadata extraction.
 *
 * Returns a structured FileMeta record from the file path and content.
 * Per-kind resolvers handle the variation between work-units, decisions,
 * sessions, etc.
 *
 * Cross-references parse markdown links of the form `(D040)`, `(WU 110)`,
 * `(Q015)`, `[D040](D040-...)`, etc. — so a future query like "what
 * references D040" can be answered by metadata filter alone.
 */

import { stat } from 'node:fs/promises';

export type FileKind =
  | 'work_unit'
  | 'decision'
  | 'session'
  | 'open_question'
  | 'risk'
  | 'contract'
  | 'philosophy'
  | 'guide'
  | 'map'
  | 'state'
  | 'build_order'
  | 'reference'
  | 'readme'
  | 'unknown';

export interface FileMeta {
  path: string;
  kind: FileKind;
  idInKind: string | null; // e.g. "WU 110", "D040", "Q015"
  status: string | null;
  date: string | null;
  crossRefs: string[]; // canonical e.g. "D040", "WU 110", "Q015"
}

export async function extractMetadata(
  absolutePath: string,
  relativePath: string,
  content: string,
): Promise<FileMeta> {
  const kind = classifyKind(relativePath);
  const idInKind = extractIdInKind(kind, relativePath, content);
  const status = extractStatus(content);
  const date = await extractDate(absolutePath, content);
  const crossRefs = extractCrossRefs(content);

  return {
    path: relativePath,
    kind,
    idInKind,
    status,
    date,
    crossRefs,
  };
}

function classifyKind(relPath: string): FileKind {
  const p = relPath.replace(/\\/g, '/');
  if (p === 'build/STATE.md') return 'state';
  if (p === 'build/BUILD-ORDER.md') return 'build_order';
  if (p === 'build/README.md') return 'readme';
  if (p === 'build/reference-index.md') return 'reference';

  if (p.startsWith('build/work-units/')) return 'work_unit';
  if (p.startsWith('build/decisions/')) return 'decision';
  if (p.startsWith('build/sessions/')) return 'session';
  if (p.startsWith('build/open-questions/')) return 'open_question';
  if (p.startsWith('build/risks/')) return 'risk';
  if (p.startsWith('build/maps/')) return 'map';
  if (p.startsWith('contracts/')) return 'contract';
  if (p.startsWith('philosophy/')) return 'philosophy';
  if (p.startsWith('guides/')) return 'guide';
  return 'unknown';
}

function extractIdInKind(
  kind: FileKind,
  relPath: string,
  content: string,
): string | null {
  const file = relPath.split('/').pop() ?? '';

  if (kind === 'work_unit') {
    const m = /^(\d{3})/.exec(file);
    return m ? `WU ${m[1]}` : null;
  }
  if (kind === 'decision') {
    const m = /^(D\d+)/.exec(file);
    return m ? m[1] : null;
  }
  if (kind === 'open_question') {
    const m = /^(Q\d+)/.exec(file);
    return m ? m[1] : null;
  }
  if (kind === 'risk') {
    const m = /^(R\d+)/.exec(file);
    return m ? m[1] : null;
  }
  if (kind === 'session') {
    // Session files are dated; pull the leading H1 if present
    const h = /^#\s+(.+?)\s*$/m.exec(content);
    return h ? h[1] : file.replace(/\.md$/, '');
  }
  return null;
}

function extractStatus(content: string): string | null {
  const m = /^\*\*Status:\*\*\s*(.+?)\s*$/m.exec(content);
  if (m) return m[1].replace(/\s+/g, ' ').trim();
  return null;
}

async function extractDate(absolutePath: string, content: string): Promise<string | null> {
  // Look for "**Date:** 2026-05-08" or "Date: ..." in frontmatter style
  const m =
    /^\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/m.exec(content) ||
    /^Date:\s*(\d{4}-\d{2}-\d{2})/m.exec(content);
  if (m) return m[1];
  try {
    const s = await stat(absolutePath);
    return s.mtime.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

const REF_PATTERNS: Array<{ regex: RegExp; canonical: (m: RegExpExecArray) => string }> = [
  { regex: /\bD\d{3}\b/gu, canonical: (m) => m[0] },
  { regex: /\bQ\d{3}\b/gu, canonical: (m) => m[0] },
  { regex: /\bR\d{3}\b/gu, canonical: (m) => m[0] },
  { regex: /\bWU\s*0?\d{2,3}[a-z]?\b/giu, canonical: (m) => normaliseWu(m[0]) },
];

function normaliseWu(raw: string): string {
  const m = /WU\s*0?(\d{2,3})([a-z]?)/i.exec(raw);
  if (!m) return raw.toUpperCase();
  const num = m[1].padStart(3, '0');
  const tail = m[2] ? m[2].toLowerCase() : '';
  return `WU ${num}${tail}`;
}

function extractCrossRefs(content: string): string[] {
  const found = new Set<string>();
  for (const { regex, canonical } of REF_PATTERNS) {
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      found.add(canonical(m));
    }
  }
  return [...found].sort();
}
