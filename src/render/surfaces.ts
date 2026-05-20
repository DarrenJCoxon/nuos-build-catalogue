/**
 * Render the `ui-ux/` register as a single companion HTML page.
 *
 * Output structure:
 *   1. Sitemap — every surface listed (linked to its card lower down), grouped
 *      where possible by the persona handle it serves.
 *   2. Surface cards — one per surface markdown file, showing type, persona, the
 *      "What they see" prose, primary actions, contracts touched, design-system
 *      pieces used.
 *
 * The intent is the human-reviewable artefact the markdown can't be:
 * a non-developer scanning the whole UI surface set in one scroll.
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  parseSections,
  firstParagraph,
  isPlaceholder,
} from './parser.js';
import {
  pageWrapper,
  card,
  grid,
  emptyState,
  escapeHtml,
  renderProse,
  renderInlineMarkdown,
} from './html.js';

const SKIP_FILES = new Set(['_index.md', 'surface-template.md']);

interface ParsedSurface {
  file: string;
  slug: string;
  title: string;
  type: string | null;
  status: string | null;
  personaRefs: string[];
  sections: Map<string, string>;
}

export interface SurfaceRenderResult {
  written: boolean;
  outPath: string;
  surfaceCount: number;
}

export async function renderSurfaces(opts: {
  buildRoot: string;
  projectName: string;
  generatedAt: string;
}): Promise<SurfaceRenderResult> {
  const dir = path.join(opts.buildRoot, 'ui-ux');
  const outPath = path.join(dir, '_view.html');

  if (!existsSync(dir)) {
    return { written: false, outPath, surfaceCount: 0 };
  }

  const surfaces = await loadSurfaces(dir);

  const body = renderBody(surfaces);
  const html = pageWrapper({
    title: 'Surfaces & sitemap',
    projectName: opts.projectName,
    generatedAt: opts.generatedAt,
    sourceNote: '<code>docs/build/ui-ux/</code>',
    body,
  });

  await mkdir(dir, { recursive: true });
  await writeFile(outPath, html, 'utf8');
  return { written: true, outPath, surfaceCount: surfaces.length };
}

async function loadSurfaces(dir: string): Promise<ParsedSurface[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const surfaces: ParsedSurface[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (SKIP_FILES.has(entry.name)) continue;
    const filePath = path.join(dir, entry.name);
    const md = await readFile(filePath, 'utf8');
    if (isPlaceholder(md)) continue;
    surfaces.push(parseSurface(entry.name, md));
  }
  surfaces.sort((a, b) => a.title.localeCompare(b.title));
  return surfaces;
}

function parseSurface(file: string, md: string): ParsedSurface {
  const sections = parseSections(md);
  const preamble = sections.get('') ?? '';
  const titleMatch = md.match(/^#\s+(.+)$/m);
  return {
    file,
    slug: file.replace(/\.md$/, ''),
    title: titleMatch ? titleMatch[1].trim() : file,
    type: extractMetadata(preamble, 'Type'),
    status: extractMetadata(preamble, 'Status'),
    personaRefs: extractPersonaRefs(sections.get('Who uses this surface') ?? ''),
    sections,
  };
}

function extractMetadata(preamble: string, key: string): string | null {
  const re = new RegExp(`\\*\\*${key}:\\*\\*\\s*(.+)`, 'i');
  const m = preamble.match(re);
  return m ? m[1].trim() : null;
}

function extractPersonaRefs(body: string): string[] {
  const out: string[] = [];
  const re = /P\d{3}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.push(m[0]);
  return Array.from(new Set(out));
}

function renderBody(surfaces: ParsedSurface[]): string {
  if (surfaces.length === 0) {
    return card(
      'No surfaces filed yet',
      emptyState(
        'Phase C of planning produces this content. Once surfaces are filed in docs/build/ui-ux/, this view will render them.',
      ),
    );
  }
  return [renderSitemap(surfaces), ...surfaces.map(renderSurfaceCard)].join('\n');
}

function renderSitemap(surfaces: ParsedSurface[]): string {
  const groups = new Map<string, ParsedSurface[]>();
  for (const s of surfaces) {
    const key = s.personaRefs.length > 0 ? s.personaRefs.join(', ') : '(no persona linked)';
    const bucket = groups.get(key) ?? [];
    bucket.push(s);
    groups.set(key, bucket);
  }

  const sections = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([persona, group]) => {
      const items = group
        .map((s) => {
          const typeTag = s.type ? ` <span class="tag">${escapeHtml(s.type)}</span>` : '';
          return `<li><a href="#${escapeHtml(s.slug)}">${escapeHtml(s.title)}</a>${typeTag}</li>`;
        })
        .join('');
      return `<h4>${escapeHtml(persona)}</h4><ul class="sitemap-list">${items}</ul>`;
    })
    .join('');

  return card('Sitemap', sections);
}

function renderSurfaceCard(s: ParsedSurface): string {
  const tags: string[] = [];
  if (s.type) tags.push(`<span class="tag">${escapeHtml(s.type)}</span>`);
  if (s.status) tags.push(`<span class="tag tag--status">${escapeHtml(s.status)}</span>`);
  for (const ref of s.personaRefs) tags.push(`<span class="tag">${escapeHtml(ref)}</span>`);

  const headerTags = tags.length > 0 ? `<div class="card__tags">${tags.join(' ')}</div>` : '';

  const sectionBlocks: string[] = [headerTags];
  for (const [heading, body] of s.sections) {
    if (heading === '' || heading.toLowerCase() === 'notes') continue;
    if (heading === 'Open questions about this surface' && !body.trim()) continue;
    const rendered = body.trim() ? renderProse(body) : '';
    if (!rendered) continue;
    sectionBlocks.push(`<h4>${escapeHtml(heading)}</h4>${rendered}`);
  }

  // Best-effort wireframe: render the first paragraph of "What they see" as a
  // hint label inside a skeletal frame. Not a real wireframe — a signal that
  // this is a surface and roughly what it contains.
  const seen = s.sections.get('What they see') ?? '';
  const hint = firstParagraph(seen);
  const wireframe = hint
    ? `<div class="wireframe"><div class="wireframe__label">${renderInlineMarkdown(hint).slice(0, 240)}</div></div>`
    : '';

  return `<section id="${escapeHtml(s.slug)}" class="card">
    <h3>${escapeHtml(s.title)}</h3>
    ${wireframe}
    <div class="card__body">${sectionBlocks.join('')}</div>
  </section>`;
}
