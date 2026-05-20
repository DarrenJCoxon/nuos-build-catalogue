/**
 * Render the `design-system/` register as an interactive companion gallery.
 *
 * What gets rendered:
 *   - Colour tokens — as visual swatches with the hex value beside the name.
 *   - Type scale — each step rendered at its declared px size with its line-height
 *     and weight applied so the operator sees the real shape, not a description.
 *   - Spacing scale — rendered as horizontal bars at the actual pixel widths.
 *   - Radius & elevation — small boxes showing the corner radius applied.
 *   - Motion — table only (no animation; would push complexity past MVP scope).
 *   - Components + patterns — name list with first-paragraph summary.
 *   - Voice + accessibility — first-paragraph summary blocks.
 *
 * Token files use GFM tables with a `Token` column and a value column. The parser
 * looks for either a `Hex` / `Value` / `Size` / `Used for` column shape and falls
 * back to "list the table verbatim" when the shape isn't recognised.
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  parseSections,
  parseTable,
  firstParagraph,
  isPlaceholder,
  extractHexColours,
  type ParsedTable,
} from './parser.js';
import {
  pageWrapper,
  card,
  emptyState,
  escapeHtml,
  renderInlineMarkdown,
  renderProse,
} from './html.js';

export interface DesignSystemRenderResult {
  written: boolean;
  outPath: string;
}

export async function renderDesignSystem(opts: {
  buildRoot: string;
  projectName: string;
  generatedAt: string;
}): Promise<DesignSystemRenderResult> {
  const dir = path.join(opts.buildRoot, 'design-system');
  const outPath = path.join(dir, '_view.html');

  if (!existsSync(dir)) {
    return { written: false, outPath };
  }

  const blocks: string[] = [];
  blocks.push(await renderTokenFile(dir, 'tokens-colour.md', renderColourTokens));
  blocks.push(await renderTokenFile(dir, 'tokens-typography.md', renderTypeTokens));
  blocks.push(await renderTokenFile(dir, 'tokens-spacing.md', renderSpacingTokens));
  blocks.push(await renderTokenFile(dir, 'tokens-radius-elevation.md', renderRadiusTokens));
  blocks.push(await renderTokenFile(dir, 'tokens-motion.md', renderMotionTokens));
  blocks.push(await renderListing(path.join(dir, 'components'), 'Components'));
  blocks.push(await renderListing(path.join(dir, 'patterns'), 'Patterns'));
  blocks.push(await renderPlainFile(dir, 'voice.md', 'Voice'));
  blocks.push(await renderPlainFile(dir, 'accessibility.md', 'Accessibility'));

  const body = blocks.filter(Boolean).join('\n');
  const html = pageWrapper({
    title: 'Design system',
    projectName: opts.projectName,
    generatedAt: opts.generatedAt,
    sourceNote: '<code>docs/build/design-system/</code>',
    body: body || card('Design system not yet populated', emptyState('Phase C of planning populates this register.')),
  });

  await mkdir(dir, { recursive: true });
  await writeFile(outPath, html, 'utf8');
  return { written: true, outPath };
}

// ---------------------------------------------------------------------------
// Individual token renderers
// ---------------------------------------------------------------------------

type TokenRenderer = (sections: Map<string, string>, fullMd: string) => string;

async function renderTokenFile(
  dir: string,
  filename: string,
  renderer: TokenRenderer,
): Promise<string> {
  const filePath = path.join(dir, filename);
  if (!existsSync(filePath)) return '';
  const md = await readFile(filePath, 'utf8');
  if (isPlaceholder(md)) {
    return card(prettyTitle(filename), emptyState(`Not yet filled in (${filename}).`), { tone: 'muted' });
  }
  const sections = parseSections(md);
  return renderer(sections, md);
}

function renderColourTokens(sections: Map<string, string>, md: string): string {
  const swatchBlocks: string[] = [];
  for (const [heading, body] of sections) {
    if (heading === '') continue;
    const table = parseTable(body);
    if (!table) continue;
    const tokenColumn = findColumn(table, ['Token', 'Name']);
    const hexColumn = findColumn(table, ['Hex', 'Value']);
    const useColumn = findColumn(table, ['Used for', 'Role', 'Description']);
    if (tokenColumn === -1) continue;

    const swatches = table.rows
      .map((row) => {
        const token = stripInline(row[tokenColumn] ?? '');
        const value = stripInline(row[hexColumn === -1 ? 1 : hexColumn] ?? '');
        const purpose = useColumn === -1 ? '' : row[useColumn] ?? '';
        const hexes = extractHexColours(value);
        const hex = hexes[0];
        if (!hex) return '';
        return `<div class="swatch">
          <div class="swatch__chip" style="background:${escapeHtml(hex)}"></div>
          <div class="swatch__meta">
            <code>${escapeHtml(token)}</code>
            <small>${escapeHtml(hex)}${purpose ? ` · ${escapeHtml(stripInline(purpose))}` : ''}</small>
          </div>
        </div>`;
      })
      .filter(Boolean)
      .join('');
    if (swatches) {
      swatchBlocks.push(`<h4>${escapeHtml(heading)}</h4>${swatches}`);
    }
  }
  if (swatchBlocks.length === 0) {
    return card('Colour tokens', renderProse(md));
  }
  return card('Colour tokens', swatchBlocks.join(''));
}

function renderTypeTokens(sections: Map<string, string>, md: string): string {
  const blocks: string[] = [];
  for (const [heading, body] of sections) {
    if (heading === '') continue;
    const table = parseTable(body);
    if (!table) continue;
    const tokenCol = findColumn(table, ['Token', 'Name']);
    const sizeCol = findColumn(table, ['Size']);
    const lineCol = findColumn(table, ['Line height']);
    const weightCol = findColumn(table, ['Weight']);
    const useCol = findColumn(table, ['Used for']);

    if (tokenCol === -1) continue;

    if (sizeCol !== -1) {
      const samples = table.rows
        .map((row) => {
          const token = stripInline(row[tokenCol] ?? '');
          const size = stripInline(row[sizeCol] ?? '');
          const line = lineCol === -1 ? '' : stripInline(row[lineCol] ?? '');
          const weight = weightCol === -1 ? '' : stripInline(row[weightCol] ?? '');
          const use = useCol === -1 ? '' : stripInline(row[useCol] ?? '');
          const cssSize = parsePxOrRem(size) ?? '16px';
          const cssLine = parseUnitless(line) ?? '1.4';
          const cssWeight = parseWeight(weight) ?? '400';
          return `<div class="type-row">
            <span class="type-sample" style="font-size:${cssSize};line-height:${cssLine};font-weight:${cssWeight}">The quick brown fox</span>
            <small><code>${escapeHtml(token)}</code> · ${escapeHtml([size, weight, use].filter(Boolean).join(' · '))}</small>
          </div>`;
        })
        .join('');
      blocks.push(`<h4>${escapeHtml(heading)}</h4>${samples}`);
    } else {
      blocks.push(`<h4>${escapeHtml(heading)}</h4>${renderTableAsTokens(table)}`);
    }
  }
  if (blocks.length === 0) return card('Typography', renderProse(md));
  return card('Typography', blocks.join(''));
}

function renderSpacingTokens(sections: Map<string, string>, md: string): string {
  const blocks: string[] = [];
  for (const [heading, body] of sections) {
    if (heading === '') continue;
    const table = parseTable(body);
    if (!table) continue;
    const tokenCol = findColumn(table, ['Token', 'Name', 'Step']);
    const valCol = findColumn(table, ['Value', 'Size', 'px']);
    if (tokenCol === -1 || valCol === -1) {
      blocks.push(`<h4>${escapeHtml(heading)}</h4>${renderTableAsTokens(table)}`);
      continue;
    }
    const bars = table.rows
      .map((row) => {
        const token = stripInline(row[tokenCol] ?? '');
        const value = stripInline(row[valCol] ?? '');
        const px = parsePx(value);
        if (!px) return '';
        return `<div class="spacing-row">
          <small><code>${escapeHtml(token)}</code> · ${escapeHtml(value)}</small>
          <div class="spacing-bar" style="width:${px}px;max-width:100%"></div>
        </div>`;
      })
      .filter(Boolean)
      .join('');
    blocks.push(`<h4>${escapeHtml(heading)}</h4>${bars || renderTableAsTokens(table)}`);
  }
  if (blocks.length === 0) return card('Spacing', renderProse(md));
  return card('Spacing', blocks.join(''));
}

function renderRadiusTokens(sections: Map<string, string>, md: string): string {
  const blocks: string[] = [];
  for (const [heading, body] of sections) {
    if (heading === '') continue;
    const table = parseTable(body);
    if (!table) continue;
    const tokenCol = findColumn(table, ['Token', 'Name']);
    const valCol = findColumn(table, ['Value', 'Radius', 'Size']);
    if (tokenCol === -1 || valCol === -1) {
      blocks.push(`<h4>${escapeHtml(heading)}</h4>${renderTableAsTokens(table)}`);
      continue;
    }
    const examples = table.rows
      .map((row) => {
        const token = stripInline(row[tokenCol] ?? '');
        const value = stripInline(row[valCol] ?? '');
        const px = parsePx(value);
        return `<div class="radius-row">
          <div class="radius-chip" style="border-radius:${px ?? 0}px"></div>
          <small><code>${escapeHtml(token)}</code> · ${escapeHtml(value)}</small>
        </div>`;
      })
      .join('');
    blocks.push(`<h4>${escapeHtml(heading)}</h4>${examples}`);
  }
  if (blocks.length === 0) return card('Radius & elevation', renderProse(md));
  return card('Radius & elevation', blocks.join(''));
}

function renderMotionTokens(sections: Map<string, string>, md: string): string {
  const blocks: string[] = [];
  for (const [heading, body] of sections) {
    if (heading === '') continue;
    const table = parseTable(body);
    if (table) blocks.push(`<h4>${escapeHtml(heading)}</h4>${renderTableAsTokens(table)}`);
  }
  if (blocks.length === 0) return card('Motion', renderProse(md));
  return card('Motion', blocks.join(''));
}

// ---------------------------------------------------------------------------
// Components / patterns listing
// ---------------------------------------------------------------------------

async function renderListing(dir: string, title: string): Promise<string> {
  if (!existsSync(dir)) return '';
  const entries = await readdir(dir, { withFileTypes: true });
  const items: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (entry.name === '_index.md' || entry.name === '_template.md') continue;
    const md = await readFile(path.join(dir, entry.name), 'utf8');
    if (isPlaceholder(md)) continue;
    const titleMatch = md.match(/^#\s+(.+)$/m);
    const name = titleMatch ? titleMatch[1].trim() : entry.name;
    const summary = firstParagraph(md);
    items.push(
      `<div class="listing-item">
        <strong>${escapeHtml(name)}</strong>
        ${summary ? `<p>${renderInlineMarkdown(summary)}</p>` : ''}
        <small><code>${escapeHtml(entry.name)}</code></small>
      </div>`,
    );
  }
  if (items.length === 0) return card(title, emptyState('None filed yet.'), { tone: 'muted' });
  return card(title, items.join(''));
}

async function renderPlainFile(dir: string, filename: string, title: string): Promise<string> {
  const filePath = path.join(dir, filename);
  if (!existsSync(filePath)) return '';
  const md = await readFile(filePath, 'utf8');
  if (isPlaceholder(md)) {
    return card(title, emptyState(`Not yet filled in (${filename}).`), { tone: 'muted' });
  }
  const summary = firstParagraph(md);
  return card(title, summary ? `<p>${renderInlineMarkdown(summary)}</p>` : renderProse(md));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function prettyTitle(filename: string): string {
  return filename
    .replace(/\.md$/, '')
    .replace(/^tokens-/, '')
    .replace(/-/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

function findColumn(table: ParsedTable, candidates: string[]): number {
  const lower = table.headers.map((h) => h.toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function stripInline(s: string): string {
  return s.replace(/^`(.+)`$/, '$1').replace(/\\\|/g, '|').trim();
}

function renderTableAsTokens(table: ParsedTable): string {
  const head = table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const rows = table.rows
    .map((row) => row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join(''))
    .map((r) => `<tr>${r}</tr>`)
    .join('');
  return `<table class="tokens-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function parsePxOrRem(s: string): string | null {
  const m = s.match(/(\d+(?:\.\d+)?)(px|rem|em)/);
  return m ? `${m[1]}${m[2]}` : null;
}
function parsePx(s: string): number | null {
  const m = s.match(/(\d+(?:\.\d+)?)\s*px/i);
  return m ? Number(m[1]) : null;
}
function parseUnitless(s: string): string | null {
  const m = s.match(/^(\d+(?:\.\d+)?)$/);
  return m ? m[1] : null;
}
function parseWeight(s: string): string | null {
  const m = s.match(/\b(100|200|300|400|500|600|700|800|900)\b/);
  return m ? m[1] : null;
}
