/**
 * Render the `architecture/` register as a module gallery with cross-links.
 *
 * Each module becomes a card showing its responsibility (one paragraph), the
 * personas/modules it depends on, and the contracts it owns. The cards link
 * to each other where dependencies are named, so the operator can navigate the
 * module graph visually instead of by grep.
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

const SKIP_FILES = new Set(['_index.md', 'module-template.md']);

interface ParsedModule {
  file: string;
  slug: string;
  title: string;
  sections: Map<string, string>;
}

export interface ArchitectureRenderResult {
  written: boolean;
  outPath: string;
  moduleCount: number;
}

export async function renderArchitecture(opts: {
  buildRoot: string;
  projectName: string;
  generatedAt: string;
}): Promise<ArchitectureRenderResult> {
  const dir = path.join(opts.buildRoot, 'architecture');
  const outPath = path.join(dir, '_view.html');

  if (!existsSync(dir)) {
    return { written: false, outPath, moduleCount: 0 };
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const modules: ParsedModule[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (SKIP_FILES.has(entry.name)) continue;
    const md = await readFile(path.join(dir, entry.name), 'utf8');
    if (isPlaceholder(md)) continue;
    const titleMatch = md.match(/^#\s+(.+)$/m);
    modules.push({
      file: entry.name,
      slug: entry.name.replace(/\.md$/, ''),
      title: titleMatch ? titleMatch[1].trim() : entry.name,
      sections: parseSections(md),
    });
  }
  modules.sort((a, b) => a.title.localeCompare(b.title));

  const body = modules.length === 0
    ? card('No modules filed yet', emptyState('Phase B of planning produces this content.'))
    : [renderModuleIndex(modules), ...modules.map(renderModuleCard)].join('');

  const html = pageWrapper({
    title: 'Architecture',
    projectName: opts.projectName,
    generatedAt: opts.generatedAt,
    sourceNote: '<code>docs/build/architecture/</code>',
    body,
  });

  await mkdir(dir, { recursive: true });
  await writeFile(outPath, html, 'utf8');
  return { written: true, outPath, moduleCount: modules.length };
}

function renderModuleIndex(modules: ParsedModule[]): string {
  const items = modules
    .map((m) => `<li><a href="#${escapeHtml(m.slug)}">${escapeHtml(m.title)}</a></li>`)
    .join('');
  return card('Modules', `<ul class="sitemap-list">${items}</ul>`);
}

function renderModuleCard(m: ParsedModule): string {
  const sectionBlocks: string[] = [];
  for (const [heading, body] of m.sections) {
    if (heading === '' || heading.toLowerCase() === 'notes') continue;
    const rendered = body.trim() ? renderProse(body) : '';
    if (!rendered) continue;
    sectionBlocks.push(`<h4>${escapeHtml(heading)}</h4>${rendered}`);
  }
  return `<section id="${escapeHtml(m.slug)}" class="card">
    <h3>${escapeHtml(m.title)}</h3>
    <div class="card__body">${sectionBlocks.join('')}</div>
  </section>`;
}
