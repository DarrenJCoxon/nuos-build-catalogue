/**
 * HTML primitives shared across the per-register renderers.
 *
 * Design notes:
 *   - Pure static HTML. No JS, no framework, no external CSS or fonts.
 *   - One self-contained file per register so the operator can open it directly
 *     in a browser or share it without a build step.
 *   - Inline styles in a single `<style>` block; CSS variables for the few values
 *     the renderers care about (token swatches, type previews) so they can be
 *     overridden per-block without restating the rule set.
 *   - The visual language is deliberately neutral — cards, restrained spacing,
 *     system fonts. Consumer projects with strong design opinions can post-process
 *     or skip companion rendering; the default isn't trying to be a brand.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convert a single line of markdown to inline HTML — `code`, **bold**, *italic*,
 * and [text](url) links. Block-level constructs (headings, lists, tables) are not
 * processed; callers parse those structurally and use this helper on the cells.
 */
export function renderInlineMarkdown(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, text, href) => `<a href="${escapeHtml(href)}">${text}</a>`,
  );
  return out;
}

/**
 * Render a multi-line markdown block as paragraphs. Lists become `<ul>`/`<ol>`.
 * Sub-headings (### / ####) become `<h4>`. Tables are skipped — the renderer should
 * have parsed those structurally before getting here.
 */
export function renderProse(md: string): string {
  const lines = md.split('\n');
  const blocks: string[] = [];
  let para: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;
  let inTable = false;

  const flushPara = () => {
    if (para.length === 0) return;
    blocks.push(`<p>${renderInlineMarkdown(para.join(' '))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it) => `<li>${renderInlineMarkdown(it)}</li>`).join('');
    blocks.push(`<${list.kind}>${items}</${list.kind}>`);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();

    // Skip GFM tables — those are parsed structurally.
    if (line.includes('|') && lines.indexOf(raw) + 1 < lines.length) {
      const next = lines[lines.indexOf(raw) + 1]?.trim() ?? '';
      if (/^\|?\s*:?-+:?(\s*\|\s*:?-+:?)+\s*\|?\s*$/.test(next)) inTable = true;
    }
    if (inTable) {
      if (!line.includes('|')) inTable = false;
      else continue;
    }
    if (inTable) continue;

    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    if (line.startsWith('> *') && line.endsWith('*')) continue; // hint blockquote
    if (line.startsWith('#### ')) {
      flushPara();
      flushList();
      blocks.push(`<h5>${renderInlineMarkdown(line.slice(5))}</h5>`);
      continue;
    }
    if (line.startsWith('### ')) {
      flushPara();
      flushList();
      blocks.push(`<h4>${renderInlineMarkdown(line.slice(4))}</h4>`);
      continue;
    }
    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      flushPara();
      if (list?.kind !== 'ul') {
        flushList();
        list = { kind: 'ul', items: [] };
      }
      list.items.push(ulMatch[1]);
      continue;
    }
    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      flushPara();
      if (list?.kind !== 'ol') {
        flushList();
        list = { kind: 'ol', items: [] };
      }
      list.items.push(olMatch[1]);
      continue;
    }
    if (line.startsWith('>')) continue; // generic blockquotes are usually template hints
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks.join('\n');
}

export function card(title: string, body: string, opts: { tone?: 'default' | 'muted' } = {}): string {
  const cls = opts.tone === 'muted' ? 'card card--muted' : 'card';
  return `<section class="${cls}"><h3>${escapeHtml(title)}</h3><div class="card__body">${body}</div></section>`;
}

export function grid(items: string[], opts: { columns?: 'auto' | 'wide' } = {}): string {
  const cls = opts.columns === 'wide' ? 'grid grid--wide' : 'grid';
  return `<div class="${cls}">${items.join('')}</div>`;
}

export function emptyState(message: string): string {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

/**
 * Wrap rendered fragments into a self-contained HTML document.
 *
 * The doc carries an explicit "generated, do not edit" banner so the operator
 * doesn't try to hand-edit the file — the source of truth is the markdown.
 */
export function pageWrapper(opts: {
  title: string;
  projectName: string;
  generatedAt: string;
  sourceNote: string;
  body: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(opts.title)} — ${escapeHtml(opts.projectName)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
<header class="page-header">
  <div class="page-header__title">
    <small>${escapeHtml(opts.projectName)} catalogue companion</small>
    <h1>${escapeHtml(opts.title)}</h1>
  </div>
  <div class="page-header__meta">
    <p>Generated ${escapeHtml(opts.generatedAt)} from ${opts.sourceNote}. Do not hand-edit — the markdown is the source of truth.</p>
  </div>
</header>
<main>
${opts.body}
</main>
<footer class="page-footer">
  <p>Regenerate with <code>npx @nusoft/nuos-build-catalogue render</code>.</p>
</footer>
</body>
</html>
`;
}

const BASE_CSS = `
:root {
  --bg: #fafaf9;
  --surface: #ffffff;
  --surface-muted: #f4f4f3;
  --border: #e5e5e2;
  --text: #1a1a1a;
  --text-muted: #666;
  --accent: #2a5cdc;
  --shadow: 0 1px 2px rgba(0,0,0,0.04), 0 1px 6px rgba(0,0,0,0.03);
  --radius: 8px;
  --gap: 16px;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
.page-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: end;
  gap: var(--gap);
  padding: 32px max(24px, 4vw) 24px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.page-header__title small { color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; font-size: 12px; }
.page-header__title h1 { margin: 4px 0 0; font-size: 28px; font-weight: 600; }
.page-header__meta { color: var(--text-muted); font-size: 13px; max-width: 50ch; }
.page-header__meta p { margin: 0; }
main { padding: 32px max(24px, 4vw); display: flex; flex-direction: column; gap: 28px; }
.page-footer { padding: 24px max(24px, 4vw); color: var(--text-muted); font-size: 12px; border-top: 1px solid var(--border); }
h2 { margin: 8px 0 4px; font-size: 18px; font-weight: 600; }
h2 small { color: var(--text-muted); font-weight: 400; font-size: 13px; margin-left: 8px; }
h3 { margin: 0 0 8px; font-size: 16px; font-weight: 600; }
h4 { margin: 16px 0 4px; font-size: 14px; font-weight: 600; }
h5 { margin: 12px 0 4px; font-size: 13px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
p { margin: 0 0 8px; }
p:last-child { margin-bottom: 0; }
ul, ol { margin: 0 0 8px; padding-left: 22px; }
li { margin-bottom: 4px; }
code { background: var(--surface-muted); padding: 1px 6px; border-radius: 4px; font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 0.92em; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; box-shadow: var(--shadow); }
.card--muted { background: var(--surface-muted); box-shadow: none; }
.card__body { color: var(--text); font-size: 14px; line-height: 1.55; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--gap); }
.grid--wide { grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); }
.empty { color: var(--text-muted); font-style: italic; font-size: 14px; padding: 12px 0; }
.swatch { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; }
.swatch__chip { width: 36px; height: 36px; border-radius: 6px; border: 1px solid var(--border); flex-shrink: 0; }
.swatch__meta { display: flex; flex-direction: column; min-width: 0; }
.swatch__meta code { background: transparent; padding: 0; font-size: 13px; }
.swatch__meta small { color: var(--text-muted); font-size: 12px; }
.tokens-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.tokens-table th { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); font-weight: 600; color: var(--text-muted); }
.tokens-table td { padding: 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
.type-sample { display: block; margin: 4px 0 12px; line-height: 1.2; }
.spacing-bar { height: 14px; background: var(--accent); border-radius: 3px; }
.tag { display: inline-block; padding: 2px 8px; border-radius: 999px; background: var(--surface-muted); font-size: 11px; color: var(--text-muted); margin-right: 4px; }
.tag--status { background: #e5f0ff; color: #0b3da1; }
.timeline { display: flex; flex-direction: column; gap: 12px; position: relative; padding-left: 24px; border-left: 2px solid var(--border); }
.timeline .card { position: relative; }
.timeline .card::before { content: ""; position: absolute; width: 10px; height: 10px; background: var(--accent); border-radius: 50%; left: -29px; top: 22px; }
.sitemap-list { columns: 2 320px; column-gap: 24px; padding-left: 18px; }
.sitemap-list li { break-inside: avoid; margin-bottom: 4px; }
.card__tags { display: flex; flex-wrap: wrap; gap: 6px; margin: -4px 0 12px; }
.wireframe { border: 1.5px dashed var(--border); border-radius: 6px; padding: 18px 16px; margin: 4px 0 12px; background: linear-gradient(135deg, var(--surface-muted) 25%, transparent 25%, transparent 50%, var(--surface-muted) 50%, var(--surface-muted) 75%, transparent 75%); background-size: 14px 14px; color: var(--text-muted); font-size: 13px; font-style: italic; }
.wireframe__label { background: var(--surface); padding: 6px 10px; border-radius: 4px; display: inline-block; }
.listing-item { padding: 10px 0; border-bottom: 1px solid var(--border); }
.listing-item:last-child { border-bottom: none; }
.listing-item p { margin: 4px 0; }
.listing-item small { color: var(--text-muted); }
.type-row { margin-bottom: 12px; }
.type-row small { color: var(--text-muted); font-size: 12px; }
.spacing-row { margin-bottom: 10px; display: flex; flex-direction: column; gap: 4px; }
.spacing-row small { color: var(--text-muted); font-size: 12px; }
.radius-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.radius-chip { width: 48px; height: 32px; background: var(--accent); flex-shrink: 0; }
.radius-row small { color: var(--text-muted); font-size: 12px; }
@media (max-width: 720px) {
  .page-header { flex-direction: column; align-items: flex-start; }
  .sitemap-list { columns: 1; }
}
`;
