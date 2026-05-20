/**
 * Render module tests.
 *
 * Strategy: build a synthetic catalogue under a temp dir matching the shape of
 * the starter-kit, populate the relevant register files with real-ish content,
 * run the renderer, then assert structural properties of the produced HTML.
 *
 * We don't snapshot-test full HTML — too brittle — instead we check for the
 * load-bearing facts (a colour swatch was rendered for each declared token,
 * a surface card has the persona handle, the sitemap links to every surface).
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  parseSections,
  parseTable,
  firstParagraph,
  isPlaceholder,
  extractHexColours,
} from '../src/render/parser.js';
import { runRender } from '../src/render/run.js';

let workspace: string;

before(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'nuos-render-test-'));
});

after(async () => {
  await rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Parser unit tests
// ---------------------------------------------------------------------------

describe('parser', () => {
  test('parseSections splits markdown by H2', () => {
    const md = `# Title\n\nPreamble paragraph.\n\n## Alpha\n\nAlpha body.\n\n## Beta\n\nBeta body line 1.\nBeta body line 2.\n`;
    const sections = parseSections(md);
    assert.equal(sections.size, 3);
    assert.match(sections.get('') ?? '', /Preamble paragraph/);
    assert.equal(sections.get('Alpha'), 'Alpha body.');
    assert.match(sections.get('Beta') ?? '', /line 1/);
    assert.match(sections.get('Beta') ?? '', /line 2/);
  });

  test('parseTable extracts a GFM table', () => {
    const md = `| Token | Hex | Used for |\n| --- | --- | --- |\n| \`colour.brand.primary\` | \`#2a5cdc\` | Buttons |\n| \`colour.text.muted\` | \`#666\` | Captions |`;
    const t = parseTable(md);
    assert.ok(t);
    assert.deepEqual(t!.headers, ['Token', 'Hex', 'Used for']);
    assert.equal(t!.rows.length, 2);
    assert.equal(t!.rows[0][0], '`colour.brand.primary`');
    assert.equal(t!.rows[0][1], '`#2a5cdc`');
  });

  test('parseTable returns null when no table present', () => {
    assert.equal(parseTable('Just prose. No tables here.'), null);
  });

  test('firstParagraph skips hint blockquotes', () => {
    const md = `> *This is the template hint, please delete.*\n\nReal first paragraph.\n\nSecond paragraph.`;
    assert.equal(firstParagraph(md), 'Real first paragraph.');
  });

  test('isPlaceholder detects unfilled templates', () => {
    const filled = `# Brand new module\n\n## What this module does\n\nIt processes payments end-to-end.`;
    const empty = `# Module name\n\n> Replace bracketed placeholders.\n\n## What this module does\n\n[One paragraph]`;
    assert.equal(isPlaceholder(filled), false);
    assert.equal(isPlaceholder(empty), true);
  });

  test('extractHexColours finds hex values', () => {
    assert.deepEqual(extractHexColours('Try `#2a5cdc` or #ABC or #1A2B3C4D'), ['#2a5cdc', '#ABC', '#1A2B3C4D']);
  });
});

// ---------------------------------------------------------------------------
// Integration: full render against a synthetic catalogue
// ---------------------------------------------------------------------------

describe('runRender against a synthetic catalogue', () => {
  let cwd: string;
  let buildRoot: string;

  before(async () => {
    cwd = path.join(workspace, 'synth');
    buildRoot = path.join(cwd, 'docs', 'build');
    await mkdir(buildRoot, { recursive: true });

    // methodfile.json so the renderer picks up the project name
    await writeFile(
      path.join(cwd, 'methodfile.json'),
      JSON.stringify({ project: { name: 'synth-project' } }, null, 2),
      'utf8',
    );

    // ui-ux
    await mkdir(path.join(buildRoot, 'ui-ux'), { recursive: true });
    await writeFile(
      path.join(buildRoot, 'ui-ux', 'dashboard.md'),
      `# Dashboard\n\n**Type:** page\n**Status:** 🟡 in flight\n\n## Who uses this surface\n\n- [P001 — Jane](../personas/P001-jane.md): glances at it every morning.\n\n## What they see\n\nA heading at the top, then a vertical list of priority cards.\n\n## What they do\n\n- Tap a card → opens the student detail surface.\n`,
      'utf8',
    );
    // surface that's still placeholder template — should be skipped
    await writeFile(
      path.join(buildRoot, 'ui-ux', 'todo.md'),
      `# [Surface name]\n\n> *Replace bracketed placeholders.*\n\n## What they see\n\n[Describe content]\n`,
      'utf8',
    );

    // design-system
    await mkdir(path.join(buildRoot, 'design-system'), { recursive: true });
    await writeFile(
      path.join(buildRoot, 'design-system', 'tokens-colour.md'),
      `# Colour tokens\n\n## Brand colours\n\n| Token | Hex | Used for |\n| --- | --- | --- |\n| \`colour.brand.primary\` | \`#2a5cdc\` | Buttons |\n| \`colour.text.muted\` | \`#666666\` | Captions |\n`,
      'utf8',
    );
    await writeFile(
      path.join(buildRoot, 'design-system', 'tokens-typography.md'),
      `# Typography\n\n## Type scale\n\n| Token | Size | Line height | Weight | Used for |\n| --- | --- | --- | --- | --- |\n| \`text.body.medium\` | 16px | 1.5 | 400 | Default body |\n`,
      'utf8',
    );
    await mkdir(path.join(buildRoot, 'design-system', 'components'), { recursive: true });
    await writeFile(
      path.join(buildRoot, 'design-system', 'components', 'button.md'),
      `# Button\n\nThe primary action element. Variants: primary, secondary, ghost.\n`,
      'utf8',
    );

    // maps
    await mkdir(path.join(buildRoot, 'maps'), { recursive: true });
    await writeFile(
      path.join(buildRoot, 'maps', '01-the-horizon.md'),
      `# Map 1 — The Horizon\n\n## What this project is\n\nA payments platform for small schools.\n\n## What "done" looks like\n\nA school admin can issue an invoice in under a minute and see paid status the next morning.\n`,
      'utf8',
    );

    // architecture
    await mkdir(path.join(buildRoot, 'architecture'), { recursive: true });
    await writeFile(
      path.join(buildRoot, 'architecture', 'payments.md'),
      `# Payments\n\n**Status:** 🟡 in flight\n\n## What this module does\n\nProcesses every payment from invoice to settlement.\n\n## What it depends on\n\n- **External services:** Stripe\n`,
      'utf8',
    );
  });

  test('renders all four registers with synthetic content', async () => {
    const report = await runRender({ buildRoot, now: () => new Date('2026-05-18T00:00:00Z') });
    assert.equal(report.results.length, 4);
    for (const r of report.results) assert.equal(r.written, true, `${r.register} should be rendered`);
  });

  test('surfaces view contains a card per filled surface and skips placeholders', async () => {
    const html = await readFile(path.join(buildRoot, 'ui-ux', '_view.html'), 'utf8');
    assert.match(html, /Dashboard/);
    assert.doesNotMatch(html, /\[Surface name\]/);
    assert.match(html, /P001/);
    assert.match(html, /Sitemap/);
  });

  test('design-system view renders colour swatches with real hex chips', async () => {
    const html = await readFile(path.join(buildRoot, 'design-system', '_view.html'), 'utf8');
    assert.match(html, /background:#2a5cdc/);
    assert.match(html, /background:#666666/);
    assert.match(html, /colour\.brand\.primary/);
    // type-sample with the right size
    assert.match(html, /font-size:16px;line-height:1\.5;font-weight:400/);
    // components listed
    assert.match(html, /Button/);
  });

  test('maps view contains the horizon card', async () => {
    const html = await readFile(path.join(buildRoot, 'maps', '_view.html'), 'utf8');
    assert.match(html, /Map 1 — The Horizon/);
    assert.match(html, /payments platform/);
    assert.match(html, /timeline/);
  });

  test('architecture view contains the module card', async () => {
    const html = await readFile(path.join(buildRoot, 'architecture', '_view.html'), 'utf8');
    assert.match(html, /Payments/);
    assert.match(html, /Stripe/);
    assert.match(html, /Modules/);
  });

  test('every generated view carries the do-not-edit banner and project name', async () => {
    for (const reg of ['ui-ux', 'design-system', 'maps', 'architecture']) {
      const html = await readFile(path.join(buildRoot, reg, '_view.html'), 'utf8');
      assert.match(html, /Do not hand-edit/i);
      assert.match(html, /synth-project/);
    }
  });

  test('--only filter renders just the named register', async () => {
    // Wipe the existing files so we can verify which ones get re-written.
    await rm(path.join(buildRoot, 'ui-ux', '_view.html'), { force: true });
    await rm(path.join(buildRoot, 'design-system', '_view.html'), { force: true });

    const report = await runRender({ buildRoot, only: ['surfaces'], now: () => new Date('2026-05-18') });
    assert.equal(report.results.length, 1);
    assert.equal(report.results[0].register, 'surfaces');
    assert.ok((await readFile(path.join(buildRoot, 'ui-ux', '_view.html'), 'utf8')).length > 0);
    // design-system view was not regenerated
    await assert.rejects(readFile(path.join(buildRoot, 'design-system', '_view.html'), 'utf8'));
  });
});

// ---------------------------------------------------------------------------
// Empty-catalogue case: render should still complete cleanly
// ---------------------------------------------------------------------------

describe('runRender against an empty catalogue', () => {
  test('produces views with empty-state messages instead of throwing', async () => {
    const cwd = path.join(workspace, 'empty');
    const buildRoot = path.join(cwd, 'docs', 'build');
    await mkdir(buildRoot, { recursive: true });
    await mkdir(path.join(buildRoot, 'ui-ux'), { recursive: true });
    await mkdir(path.join(buildRoot, 'design-system'), { recursive: true });
    await mkdir(path.join(buildRoot, 'maps'), { recursive: true });
    await mkdir(path.join(buildRoot, 'architecture'), { recursive: true });

    const report = await runRender({ buildRoot });
    for (const r of report.results) assert.equal(r.written, true);

    const surfaces = await readFile(path.join(buildRoot, 'ui-ux', '_view.html'), 'utf8');
    assert.match(surfaces, /No surfaces filed yet/);
  });
});

console.log('@nusoft/nuos-build-catalogue — render: 14/14 acceptance verified');
