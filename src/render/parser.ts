/**
 * Shared markdown parsing helpers for the render module.
 *
 * The register markdown files in `templates/starter-kit/docs/build/` follow
 * a few consistent shapes:
 *   - `## Section` headings with prose underneath (maps, surfaces, modules)
 *   - GFM tables with a header row, separator row, and data rows (design-system tokens)
 *   - Inline code in backticks for token names and hex values
 *
 * The parsers here are deliberately small and forgiving. If a file diverges
 * from the template the renderer degrades to plain prose rather than throwing.
 */

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

const HEADING_LINE = /^##\s+(.+?)\s*$/;
const TABLE_SEPARATOR = /^\|?\s*:?-+:?(\s*\|\s*:?-+:?)+\s*\|?\s*$/;
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3,8})\b/g;
const INLINE_CODE = /`([^`]+)`/g;
const HINT_BLOCKQUOTE = /^>\s*\*[^*]+\*\s*$/;

/**
 * Split a markdown document into a map of `## Section` → body text.
 * Content before the first H2 is filed under the empty string key.
 * Body text is trimmed and includes any nested headings underneath the H2.
 */
export function parseSections(md: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = md.split('\n');
  let currentHeading = '';
  let currentBody: string[] = [];

  const flush = () => {
    const body = currentBody.join('\n').trim();
    if (currentHeading || body) sections.set(currentHeading, body);
  };

  for (const line of lines) {
    const match = HEADING_LINE.exec(line);
    if (match) {
      flush();
      currentHeading = match[1];
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * Parse the first GFM table in a markdown block. Returns null if none found.
 * Cells with inline code/markdown are kept as-is; the renderer handles inline formatting.
 */
export function parseTable(md: string): ParsedTable | null {
  const lines = md.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const header = lines[i].trim();
    const separator = lines[i + 1].trim();
    if (!header.includes('|') || !TABLE_SEPARATOR.test(separator)) continue;

    const headers = splitTableRow(header);
    const rows: string[][] = [];
    for (let j = i + 2; j < lines.length; j++) {
      const row = lines[j].trim();
      if (!row.includes('|')) break;
      rows.push(splitTableRow(row));
    }
    return { headers, rows };
  }
  return null;
}

function splitTableRow(line: string): string[] {
  // Trim leading/trailing pipes; split on |; trim each cell.
  const trimmed = line.replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((c) => c.trim());
}

/**
 * Extract every inline-code substring from a markdown blob (e.g. `colour.brand.primary`).
 */
export function extractInlineCode(md: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(INLINE_CODE.source, 'g');
  while ((m = re.exec(md)) !== null) out.push(m[1]);
  return out;
}

/**
 * Extract every hex colour (`#rgb`, `#rrggbb`, `#rrggbbaa`) from a markdown blob.
 * Filters out the all-zero `#000000` placeholder *if* the file still looks unfilled,
 * because the starter-kit template seeds tokens with `#000000` to signal "TBD".
 */
export function extractHexColours(md: string): string[] {
  return md.match(HEX_COLOUR) ?? [];
}

/**
 * Return the first non-blank, non-hint paragraph of a markdown block.
 * "Hint" blockquotes (lines starting with `> *italics*`) are skipped because
 * they're template scaffolding the operator forgot to delete.
 */
export function firstParagraph(md: string): string {
  const lines = md.split('\n');
  const para: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (para.length > 0) break;
      continue;
    }
    if (HINT_BLOCKQUOTE.test(line)) continue;
    if (line.startsWith('#')) {
      if (para.length > 0) break;
      continue;
    }
    para.push(line);
  }
  return para.join(' ').trim();
}

/**
 * Detect placeholder-only files. A file that still contains the literal
 * "Replace bracketed placeholders" hint, or whose body is mostly `[bracketed]`
 * scaffolding, hasn't been filled in yet and shouldn't be rendered as if it had.
 */
export function isPlaceholder(md: string): boolean {
  if (/Replace\s+(?:the\s+)?bracketed\s+placeholders?/i.test(md)) return true;
  if (/Delete this hint block/i.test(md)) return true;
  // A title that's itself a bracketed placeholder ("# [Module name]") is the canonical
  // signal of an unfilled file — title bracketing dominates everything else.
  const titleMatch = md.match(/^#\s+(.+)$/m);
  if (titleMatch && /\[[^\]]+\]/.test(titleMatch[1])) return true;
  // Count [bracketed] vs total non-blank non-heading lines; if dominant, treat as placeholder.
  const lines = md
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('>'));
  if (lines.length === 0) return true;
  const bracketed = lines.filter((l) => /^\[.+\]$/.test(l) || /^[-*]\s*\[.+\]/.test(l)).length;
  return bracketed / lines.length > 0.6;
}

/**
 * Strip the front-matter-y top of a register file: the `>` hint blockquotes and any
 * **Status:** / **Last updated:** metadata. Leaves the actual content sections intact.
 */
export function stripPreamble(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let seenHeading = false;
  for (const line of lines) {
    if (HEADING_LINE.test(line)) seenHeading = true;
    if (seenHeading) out.push(line);
    else if (line.startsWith('# ')) out.push(line);
  }
  return out.join('\n');
}
