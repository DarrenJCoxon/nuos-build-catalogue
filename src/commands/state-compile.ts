/**
 * `nuos-catalogue state compile` — STATE.md hybrid-document recompile (WU 113b / D132).
 *
 * STATE.md is the **handoff snapshot** — the pickup point read at the start of every
 * session, kept to one screen on purpose. It is NOT a project dashboard: decisions,
 * risks, open questions, and health counts are NOT mirrored here. Those live in their
 * registers (the canonical, always-current lists) and `nuos-catalogue doctor`.
 * Duplicating them into STATE.md is the exact drift the catalogue exists to prevent:
 * STATE.md is the handoff contract, not the executive summary.
 *
 * This command reads canonical state from the **live markdown registers** (not the
 * workflow store, which is stale under Mode 1) and splices the generated sections into
 * the sentinel-delimited regions of STATE.md, leaving all authored prose
 * (Planning progress, Resume) byte-for-byte identical.
 *
 * **Source-of-truth for each generated region (D129 / Mode 1):**
 *   - `where`     (Active work unit): `.nuos-catalogue/active-wu` marker file (WU 136
 *                 pointer) + title/status resolved from `work-units/_index.md`.
 *   - `blockers`  (Blockers): 🔴 rows in `work-units/_index.md` (blocked WUs) +
 *                 open questions whose "Blocks" column is non-empty
 *                 (`open-questions/_index.md` active section).
 *
 * The **Resume** block is authored prose, not a generated region — no register can
 * derive "where the last session stopped and the next concrete action." end-of-session
 * overwrites it by hand each session; this command never touches it.
 *
 * The workflow store (`workflows.json`) is accepted as a parameter for API
 * compatibility (the CLI always opens it), but is NOT consulted — it is frozen at
 * migration time and would produce stale counts.
 *
 * **No LLM in this path.** The adapter builds an `LLMCompilationOutput` directly from
 * disk state. `renderArticleMarkdown` is called per section, then
 * `spliceGeneratedRegions` writes only inside the sentinel pairs.
 *
 * **First-cutover boundary.** If a sentinel region is absent from the target STATE.md,
 * this command reports the missing regions clearly and exits non-zero without guessing
 * where to insert them. New catalogues ship the sentinels pre-inserted in the starter
 * kit, so this path only matters for older STATE.md files mid-migration.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LLMCompilationOutput, SentinelConfig } from '@nusoft/nuwiki';
import {
  renderArticleMarkdown,
  spliceGeneratedRegions,
  checkArticleDrift,
} from '@nusoft/nuwiki';
import type { WorkflowStore } from '../migrate/store.js';
import { resolveIndexDir } from '../path-resolution.js';

// ---------------------------------------------------------------------------
// Sentinel configuration — the marker scheme for STATE.md generated regions.
// HTML-comment markers, compatible with STATE.md's existing nuos:sentinel scheme.
// The `{{key}}` placeholder is replaced by the region key; `{{marker}}` is
// replaced by the expanded marker.
// ---------------------------------------------------------------------------

export const STATE_SENTINEL_CONFIG: SentinelConfig = {
  markerPattern: 'nuos:generated:{{key}}',
  openTemplate: '<!-- {{marker}}:start -->',
  closeTemplate: '<!-- {{marker}}:end -->',
};

// ---------------------------------------------------------------------------
// Region keys — one per generated section. STATE.md is the handoff contract,
// so only the two regions a picking-up agent needs are generated:
//   - where:    the active-WU pointer
//   - blockers: what stands between the active WU and its next step
// Everything else (decisions, risks, health, "what shipped") lives in the
// registers and `doctor`, not here.
// ---------------------------------------------------------------------------

export const STATE_REGION_KEYS = {
  WHERE: 'where',
  BLOCKERS: 'blockers',
} as const;

export type StateRegionKey = (typeof STATE_REGION_KEYS)[keyof typeof STATE_REGION_KEYS];

// ---------------------------------------------------------------------------
// STATE source adapter — reads canonical state and produces LLMCompilationOutput
// with no LLM call.
// ---------------------------------------------------------------------------

export interface StateSourceAdapterInput {
  store: WorkflowStore;
  buildRoot: string;
  now?: string;
}

export interface StateCompiledOutput {
  /** The structured body — one section per generated region. */
  compilationOutput: LLMCompilationOutput;
  /** The generated region contents keyed by region key (ready for splice). */
  regions: Record<StateRegionKey, string>;
}

/**
 * Reads canonical state from the live markdown registers and the active-WU
 * marker file, and produces the generated content for the two STATE.md regions.
 *
 * No LLM call is made. The adapter derives all content deterministically.
 * The workflow store parameter is accepted for API compatibility but is not
 * consulted — see module-level comment for the source-of-truth map.
 */
export async function buildStateCompilationOutput(
  input: StateSourceAdapterInput
): Promise<StateCompiledOutput> {
  const { buildRoot } = input;
  const now = input.now ?? new Date().toISOString();
  const today = now.slice(0, 10);

  // 1. Active WU — from the .nuos-catalogue/active-wu marker file (WU 136).
  //    Title + status resolved from work-units/_index.md (live source).
  const activeWu = await readActiveWuFromMarker(buildRoot);

  // 2. Blockers — 🔴 rows in work-units/_index.md (blocked WUs) + open questions
  //    whose "Blocks" column is non-empty (a question that blocks nothing is
  //    reference material, not a handoff blocker — it stays in its register).
  const blockedWorkflows = await readBlockedWorkflowsFromIndex(buildRoot);
  const blockingQuestions = await readBlockingQuestions(buildRoot);

  // 3. Build each section's text content.
  const whereText = renderWhereSection(activeWu, today);
  const blockersText = renderBlockersSection(blockedWorkflows, blockingQuestions);

  // 4. Assemble LLMCompilationOutput (one section per region, positionally ordered)
  const sections = [
    { key: STATE_REGION_KEYS.WHERE,    heading: 'Active work unit', text: whereText,    citationIds: [], position: 1 },
    { key: STATE_REGION_KEYS.BLOCKERS, heading: 'Blockers',         text: blockersText, citationIds: [], position: 2 },
  ];

  const compilationOutput: LLMCompilationOutput = {
    summary: `STATE.md handoff snapshot compiled ${today} from live markdown registers. Active: ${activeWu?.handle ?? 'none'}.`,
    sections,
    citations: [],
    outboundLinks: [],
  };

  // 5. Render each section to markdown (the splice expects the body text, no heading)
  const regions = {} as Record<StateRegionKey, string>;
  for (const section of sections) {
    const md = renderArticleMarkdown(compilationOutput, { sections: [section.key] });
    // renderArticleMarkdown produces "## Heading\n\ntext\n" — we keep the full
    // rendering including the heading so the sentinel region is self-contained.
    regions[section.key as StateRegionKey] = md;
  }

  return { compilationOutput, regions };
}

// ---------------------------------------------------------------------------
// `state compile` command entry point
// ---------------------------------------------------------------------------

export interface StateCompileResult {
  output: string;
  exitCode: number;
  updatedRegions?: string[];
  unchangedRegions?: string[];
}

export async function cmdStateCompile(
  store: WorkflowStore,
  args: {
    buildRoot: string;
    stateMdPath?: string;
    dryRun?: boolean;
    now?: string;
  }
): Promise<StateCompileResult> {
  const stateMdPath = args.stateMdPath ?? path.join(args.buildRoot, 'STATE.md');

  // Read the current on-disk STATE.md — this is the edit base for authored prose.
  let existingFile: string;
  try {
    existingFile = await readFile(stateMdPath, 'utf8');
  } catch (err) {
    return {
      output: `state compile: cannot read STATE.md at ${stateMdPath}\n  ${err instanceof Error ? err.message : String(err)}`,
      exitCode: 1,
    };
  }

  // Build the compiled output from canonical state.
  let compiled: StateCompiledOutput;
  try {
    compiled = await buildStateCompilationOutput({
      store,
      buildRoot: args.buildRoot,
      now: args.now,
    });
  } catch (err) {
    return {
      output: `state compile: adapter error — ${err instanceof Error ? err.message : String(err)}`,
      exitCode: 1,
    };
  }

  // First-cutover guard: check that every region's sentinel pair is present.
  // If any are missing, report them clearly and exit without modifying anything.
  const missingRegions: string[] = [];
  for (const key of Object.keys(compiled.regions)) {
    const open = STATE_SENTINEL_CONFIG.openTemplate.replace(
      '{{marker}}',
      STATE_SENTINEL_CONFIG.markerPattern.replace('{{key}}', key)
    );
    if (!existingFile.includes(open)) {
      missingRegions.push(key);
    }
  }

  if (missingRegions.length > 0) {
    const lines: string[] = [
      'state compile: the following sentinel regions are absent from STATE.md:',
      '',
    ];
    for (const key of missingRegions) {
      const marker = STATE_SENTINEL_CONFIG.markerPattern.replace('{{key}}', key);
      lines.push(`  missing: <!-- ${marker}:start --> / <!-- ${marker}:end -->`);
    }
    lines.push('');
    lines.push('New catalogues ship these sentinels pre-inserted. If you are migrating an');
    lines.push('older STATE.md, the sentinel pairs must be inserted manually before');
    lines.push('`state compile` can manage those regions.');
    lines.push('');
    lines.push('For each missing region, add a sentinel pair at the appropriate location:');
    lines.push('  <!-- nuos:generated:<key>:start -->');
    lines.push('  (generated content will appear here)');
    lines.push('  <!-- nuos:generated:<key>:end -->');
    return {
      output: lines.join('\n'),
      exitCode: 1,
    };
  }

  // Splice the generated regions into the existing file.
  let spliceResult: { merged: string; updatedRegions: string[]; unchangedRegions: string[] };
  try {
    spliceResult = spliceGeneratedRegions({
      existingFile,
      regions: compiled.regions,
      sentinelConfig: STATE_SENTINEL_CONFIG,
    });
  } catch (err) {
    return {
      output: `state compile: splice error — ${err instanceof Error ? err.message : String(err)}`,
      exitCode: 1,
    };
  }

  if (args.dryRun) {
    const lines: string[] = [
      '',
      '── state compile (dry run) ──────────────────────────────────────────',
      `  target: ${stateMdPath}`,
      `  updated regions: ${spliceResult.updatedRegions.length > 0 ? spliceResult.updatedRegions.join(', ') : '(none — already current)'}`,
      `  unchanged regions: ${spliceResult.unchangedRegions.join(', ')}`,
      '  (dry run — STATE.md was not written)',
      '─────────────────────────────────────────────────────────────────────',
      '',
    ];
    return {
      output: lines.join('\n'),
      exitCode: 0,
      updatedRegions: spliceResult.updatedRegions,
      unchangedRegions: spliceResult.unchangedRegions,
    };
  }

  // Write the spliced content back to disk.
  try {
    await writeFile(stateMdPath, spliceResult.merged, 'utf8');
  } catch (err) {
    return {
      output: `state compile: cannot write STATE.md at ${stateMdPath}\n  ${err instanceof Error ? err.message : String(err)}`,
      exitCode: 1,
    };
  }

  const lines: string[] = [
    '',
    '── state compile ────────────────────────────────────────────────────',
    `  target: ${stateMdPath}`,
    `  updated regions: ${spliceResult.updatedRegions.length > 0 ? spliceResult.updatedRegions.join(', ') : '(none — already current)'}`,
    `  unchanged regions: ${spliceResult.unchangedRegions.join(', ')}`,
    '─────────────────────────────────────────────────────────────────────',
    '',
  ];

  return {
    output: lines.join('\n'),
    exitCode: 0,
    updatedRegions: spliceResult.updatedRegions,
    unchangedRegions: spliceResult.unchangedRegions,
  };
}

/**
 * Expose `checkArticleDrift` with STATE.md's sentinel config pre-applied.
 * Used by the pre-commit hook (Stage B) and tests.
 */
export function checkStateMdDrift(
  fileContent: string,
  expectedRegions: Record<string, string>
): ReturnType<typeof checkArticleDrift> {
  return checkArticleDrift({
    file: fileContent,
    sentinelConfig: STATE_SENTINEL_CONFIG,
    expectedRegions,
  });
}

// ---------------------------------------------------------------------------
// `state drift-check` command entry point (Stage B)
// ---------------------------------------------------------------------------

export interface StateDriftCheckResult {
  output: string;
  exitCode: number;
  /** 'clean' | 'drifted' | 'skipped' — used by tests */
  verdict: 'clean' | 'drifted' | 'skipped';
  driftedRegions?: string[];
}

/**
 * Check whether the generated regions of STATE.md match what the canonical
 * state currently produces. Designed to be called by the pre-commit hook.
 *
 * Exit-code contract (fail-open):
 *   - exit 0  when generated regions are clean
 *   - exit 0  when STATE.md has no sentinel regions yet (pre-cutover)
 *   - exit 0  when the check cannot run (STATE.md unreadable, store missing)
 *   - exit 1  ONLY on confirmed generated-region drift
 */
export async function cmdStateDriftCheck(
  store: WorkflowStore,
  args: {
    buildRoot: string;
    stateMdPath?: string;
    now?: string;
  }
): Promise<StateDriftCheckResult> {
  const stateMdPath = args.stateMdPath ?? path.join(args.buildRoot, 'STATE.md');

  // Read the current on-disk STATE.md — if unreadable, fail open.
  let existingFile: string;
  try {
    existingFile = await readFile(stateMdPath, 'utf8');
  } catch {
    return {
      output: `state drift-check: STATE.md unreadable at ${stateMdPath} — skipping (fail open)`,
      exitCode: 0,
      verdict: 'skipped',
    };
  }

  // Pre-cutover guard: if none of the sentinel open-markers are present,
  // the file has no sentinel regions yet — skip gracefully (fail open).
  const hasAnySentinel = Object.values(STATE_REGION_KEYS).some((key) => {
    const open = STATE_SENTINEL_CONFIG.openTemplate.replace(
      '{{marker}}',
      STATE_SENTINEL_CONFIG.markerPattern.replace('{{key}}', key)
    );
    return existingFile.includes(open);
  });

  if (!hasAnySentinel) {
    return {
      output: 'state drift-check: no sentinel regions found in STATE.md — skipping (pre-cutover)',
      exitCode: 0,
      verdict: 'skipped',
    };
  }

  // Build expected regions from canonical state.
  let compiled: StateCompiledOutput;
  try {
    compiled = await buildStateCompilationOutput({
      store,
      buildRoot: args.buildRoot,
      now: args.now,
    });
  } catch {
    return {
      output: `state drift-check: adapter error — skipping (fail open)`,
      exitCode: 0,
      verdict: 'skipped',
    };
  }

  // Run the drift check.
  let driftReport: ReturnType<typeof checkArticleDrift>;
  try {
    driftReport = checkStateMdDrift(existingFile, compiled.regions);
  } catch {
    return {
      output: `state drift-check: drift-check error — skipping (fail open)`,
      exitCode: 0,
      verdict: 'skipped',
    };
  }

  if (driftReport.clean) {
    return {
      output: 'state drift-check: generated regions are current — clean',
      exitCode: 0,
      verdict: 'clean',
    };
  }

  // Confirmed generated-region drift — exit non-zero.
  const driftedRegions = driftReport.regions
    .filter((r) => r.status !== 'clean')
    .map((r) => r.key);

  const lines: string[] = [
    '✖ state drift-check: generated regions in STATE.md have drifted from canonical state.',
    '',
    `  Drifted region(s): ${driftedRegions.join(', ')}`,
    '',
    '  These regions are compiled deterministically from the active-WU marker and',
    '  register indexes. Hand-editing them will be overwritten on next recompile.',
    '',
    '  To fix: recompile the generated regions and re-stage STATE.md:',
    '    nuos-catalogue state compile',
    '    git add docs/build/STATE.md',
    '',
    '  Then re-commit.',
  ];

  return {
    output: lines.join('\n'),
    exitCode: 1,
    verdict: 'drifted',
    driftedRegions,
  };
}

// ---------------------------------------------------------------------------
// Section renderers — deterministic, no LLM
// ---------------------------------------------------------------------------

interface ActiveWuInfo {
  handle: string;
  title: string;
  status: string | null;
  slug: string;
}

/**
 * Read the active WU from the `.nuos-catalogue/active-wu` marker file (WU 136).
 * The handle stored there (e.g. `wu-113b`) is used to locate the matching row
 * in `work-units/_index.md` to resolve the title and status.
 *
 * Degrades gracefully when:
 *   - the marker file is absent or empty  → returns null (no active WU declared)
 *   - the index row is not found          → returns the handle with unknown title/status
 *   - the index file is unreadable        → returns the handle with unknown title/status
 */
async function readActiveWuFromMarker(buildRoot: string): Promise<ActiveWuInfo | null> {
  const catalogueDir = resolveIndexDir(buildRoot);
  const markerPath = path.join(catalogueDir, 'active-wu');

  let handle: string;
  try {
    const raw = await readFile(markerPath, 'utf8');
    handle = raw.trim();
  } catch {
    return null; // marker absent — no active WU declared
  }

  if (!handle) return null;

  // The handle is e.g. "wu-113b". Strip the "wu-" prefix to get the ID as it
  // appears in the _index.md ID column (e.g. "113b").
  const idInIndex = handle.replace(/^wu-/i, '');
  const slug = idInIndex;

  const indexContent = await readIndexFile(path.join(buildRoot, 'work-units', '_index.md'));
  if (!indexContent) {
    return { handle, title: '(title unknown — index unreadable)', status: 'in_progress', slug };
  }

  // Parse the matching row. Row shape: `| 113b | [Title](file.md) | 🟡 in_progress — ... | ... |`
  for (const line of indexContent.split('\n')) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim());
    // cells[1] = ID cell, cells[2] = title cell, cells[3] = status cell
    if (cells.length < 4) continue;
    const idCell = cells[1];
    if (idCell !== idInIndex) continue;

    const titleCell = cells[2] ?? '';
    // Strip markdown link syntax if present: [Title](file.md) → Title
    const titleMatch = titleCell.match(/^\[([^\]]+)\]/) ?? titleCell.match(/^(.+)$/);
    const title = titleMatch ? titleMatch[1].trim() : titleCell.trim();

    const statusCell = cells[3] ?? '';
    // Extract the status keyword (first word after the emoji, up to ' — ' or end)
    const statusMatch = statusCell.match(/(?:🟡|🔴|🟢|🔵|🟣|✅|⚫)\s+(\S+)/);
    const status = statusMatch ? statusMatch[1] : statusCell.split('—')[0].trim() || 'in_progress';

    return { handle, title, status, slug };
  }

  // Handle declared but no matching row found in index
  return { handle, title: '(title not found in work-units/_index.md)', status: 'in_progress', slug };
}

interface BlockedWorkflow {
  handle: string;
  title: string;
}

/**
 * Read blocked WUs from 🔴 rows in `work-units/_index.md`.
 * The workflow store is stale and must not be consulted for this.
 */
async function readBlockedWorkflowsFromIndex(buildRoot: string): Promise<BlockedWorkflow[]> {
  const indexContent = await readIndexFile(path.join(buildRoot, 'work-units', '_index.md'));
  if (!indexContent) return [];

  const blocked: BlockedWorkflow[] = [];
  for (const line of indexContent.split('\n')) {
    if (!/^\s*\|/.test(line)) continue;
    if (!line.includes('🔴')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 3) continue;

    const idCell = cells[1];
    if (!idCell || /^[-\s]*$/.test(idCell) || idCell === 'ID') continue;

    const titleCell = cells[2] ?? '';
    const titleMatch = titleCell.match(/^\[([^\]]+)\]/) ?? titleCell.match(/^(.+)$/);
    const title = titleMatch ? titleMatch[1].trim() : titleCell.trim();

    const handle = `wu-${idCell}`;
    blocked.push({ handle, title });
  }
  return blocked;
}

interface UnresolvedQuestion {
  id: string;
  title: string;
  blocks: string;
}

async function readUnresolvedQuestions(buildRoot: string): Promise<UnresolvedQuestion[]> {
  const indexContent = await readIndexFile(path.join(buildRoot, 'open-questions', '_index.md'));
  if (!indexContent) return [];
  return parseQuestionsIndex(indexContent);
}

/**
 * The subset of unresolved questions that actually block work — i.e. whose
 * "Blocks" column names something. A question that blocks nothing is reference
 * material and stays in `open-questions/_index.md`; it is not a handoff blocker.
 */
async function readBlockingQuestions(buildRoot: string): Promise<UnresolvedQuestion[]> {
  const all = await readUnresolvedQuestions(buildRoot);
  return all.filter((q) => {
    const b = (q.blocks ?? '').trim();
    return b.length > 0 && b !== '—' && b !== '-' && b.toLowerCase() !== 'none';
  });
}

// ---------------------------------------------------------------------------
// Text renderers for each region
// ---------------------------------------------------------------------------

/**
 * The `where` region — the active-WU pointer. Detail (acceptance criteria,
 * notes) lives in the WU file; this is just the name + status so the picking-up
 * agent knows what is open.
 */
function renderWhereSection(activeWu: ActiveWuInfo | null, today: string): string {
  if (!activeWu) {
    return [
      'No active WU declared.',
      '',
      'Set one with `nuos-catalogue wu start <handle>`, then recompile with',
      '`nuos-catalogue state compile`.',
      '',
      `_Last compiled: ${today}._`,
    ].join('\n');
  }

  return [
    `**Active WU: ${activeWu.handle}** — ${activeWu.title}`,
    `Status: \`${activeWu.status ?? 'in_progress'}\` · Last compiled: ${today}`,
  ].join('\n');
}

/**
 * The `blockers` region — everything standing between the active WU and its next
 * step: blocked WUs (🔴) and open questions that name something they block. If
 * neither exists, the next action is unblocked.
 */
function renderBlockersSection(
  blocked: BlockedWorkflow[],
  blockingQuestions: UnresolvedQuestion[]
): string {
  if (blocked.length === 0 && blockingQuestions.length === 0) {
    return 'None. The active work unit is unblocked.';
  }

  const lines: string[] = [];
  for (const b of blocked) {
    lines.push(`- 🔴 **${b.handle}** — ${b.title}`);
  }
  for (const q of blockingQuestions.slice(0, 10)) {
    lines.push(`- **${q.id}** — ${q.title} (blocks: ${q.blocks})`);
  }
  if (blockingQuestions.length > 10) {
    lines.push(`- *(${blockingQuestions.length - 10} more — see open-questions/_index.md)*`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Index file parsers
// ---------------------------------------------------------------------------

async function readIndexFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Parse the open-questions _index.md active table.
 * Row shape: `| [Q003](file.md) | Title | Blocks | Raised |`
 * or: `| Q003 | Title | Blocks | Raised |`
 *
 * Scoped to the active-questions section only — the split on `## Resolved
 * questions` keeps resolved questions out of the generated region.
 */
function parseQuestionsIndex(content: string): UnresolvedQuestion[] {
  const questions: UnresolvedQuestion[] = [];

  // Find the "Active questions" section — stop at "Resolved questions"
  const activeSection = content.split(/^## Resolved questions/im)[0];
  const lines = activeSection.split('\n');

  for (const line of lines) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4) continue;

    const idCell = cells[1];
    if (!idCell || !/^Q\d+/i.test(idCell.replace(/^\[/, ''))) continue;

    const idMatch = idCell.match(/\[?(Q\d+)\]?/i);
    if (!idMatch) continue;
    const id = idMatch[1];

    const title = cells[2] ?? '';
    if (!title || title === 'Title' || title === '---') continue;

    const blocks = cells[3] ?? '';
    if (blocks === 'Blocks' || blocks === '---') continue;

    questions.push({ id, title, blocks });
  }

  return questions;
}
