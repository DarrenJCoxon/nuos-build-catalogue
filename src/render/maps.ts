/**
 * Render the `maps/` register as a single companion HTML page.
 *
 * Each map file (`01-the-horizon.md`, `02-phases.md`, `03-near-term.md`, etc.)
 * is parsed by its `## Section` structure and rendered as a card with the
 * section contents underneath. Multiple maps become a vertical timeline so the
 * operator sees them in their intended order (numeric prefix).
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { parseSections, isPlaceholder } from './parser.js';
import {
  pageWrapper,
  card,
  emptyState,
  escapeHtml,
  renderProse,
} from './html.js';

export interface MapsRenderResult {
  written: boolean;
  outPath: string;
  mapCount: number;
}

const TEMPLATE_PATTERN = /-template\.md$/i;

export async function renderMaps(opts: {
  buildRoot: string;
  projectName: string;
  generatedAt: string;
}): Promise<MapsRenderResult> {
  const dir = path.join(opts.buildRoot, 'maps');
  const outPath = path.join(dir, '_view.html');

  if (!existsSync(dir)) {
    return { written: false, outPath, mapCount: 0 };
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const maps: { file: string; title: string; sections: Map<string, string> }[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (entry.name === '_index.md' || TEMPLATE_PATTERN.test(entry.name)) continue;
    const md = await readFile(path.join(dir, entry.name), 'utf8');
    if (isPlaceholder(md)) continue;
    const titleMatch = md.match(/^#\s+(.+)$/m);
    maps.push({
      file: entry.name,
      title: titleMatch ? titleMatch[1].trim() : entry.name,
      sections: parseSections(md),
    });
  }
  maps.sort((a, b) => a.file.localeCompare(b.file));

  const body = maps.length === 0
    ? card('No maps filed yet', emptyState('Phases A and D of planning produce this content.'))
    : `<div class="timeline">${maps.map(renderMapCard).join('')}</div>`;

  const html = pageWrapper({
    title: 'Maps & journey',
    projectName: opts.projectName,
    generatedAt: opts.generatedAt,
    sourceNote: '<code>docs/build/maps/</code>',
    body,
  });

  await mkdir(dir, { recursive: true });
  await writeFile(outPath, html, 'utf8');
  return { written: true, outPath, mapCount: maps.length };
}

function renderMapCard(m: { title: string; sections: Map<string, string> }): string {
  const sectionBlocks: string[] = [];
  for (const [heading, body] of m.sections) {
    if (heading === '' || heading.toLowerCase() === 'how this map changes') continue;
    const rendered = body.trim() ? renderProse(body) : '';
    if (!rendered) continue;
    sectionBlocks.push(`<h4>${escapeHtml(heading)}</h4>${rendered}`);
  }
  return `<section class="card">
    <h3>${escapeHtml(m.title)}</h3>
    <div class="card__body">${sectionBlocks.join('')}</div>
  </section>`;
}
