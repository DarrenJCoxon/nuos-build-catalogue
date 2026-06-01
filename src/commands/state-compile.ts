/**
 * `nuos-catalogue state compile` — STATE.md hybrid-document recompile (WU 113b / D132).
 *
 * Reads canonical state from the **live markdown registers** (not the workflow
 * store, which is stale under Mode 1) and splices the generated sections into
 * the sentinel-delimited regions of STATE.md, leaving all authored prose
 * byte-for-byte identical.
 *
 * **Source-of-truth for each generated region (D129 / Mode 1):**
 *   - Active WU:        `.nuos-catalogue/active-wu` marker file (WU 136 pointer)
 *                       + title/status resolved from `work-units/_index.md`
 *   - WUs in progress:  🟡 row count in `work-units/_index.md`
 *   - WUs completed:    file count in `work-units/done/`
 *   - Blocked WUs:      🔴 rows in `work-units/_index.md`
 *   - Decisions:        `decisions/_index.md` active section
 *   - Open questions:   `open-questions/_index.md` active section
 *   - Risks:            `risks/_index.md` active section
 *
 * The workflow store (`workflows.json`) is accepted as a parameter for API
 * compatibility (the CLI always opens it), but is NOT consulted for any of
 * the above — it is frozen at migration time and would produce stale counts.
 *
 * **No LLM in this path.** The adapter builds an `LLMCompilationOutput`
 * directly from disk state. `renderArticleMarkdown` is called per section,
 * then `spliceGeneratedRegions` writes only inside the sentinel pairs.
 *
 * **First-cutover boundary.** If a sentinel region is absent from the target
 * STATE.md, this command reports the missing regions clearly and exits
 * non-zero without guessing where to insert them. The one-time insertion of
 * sentinels into the live file is a manual operator step (Stage B walkthrough).
 *
 * D132 / D129 boundary:
 *   - Generated regions: live markdown registers are source of truth; disk is
 *     rendered projection for these regions only.
 *   - Authored regions:  disk remains the edit base (untouched by this command).
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
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
// Region keys — one per generated section (per WU 113b section map).
// ---------------------------------------------------------------------------

export const STATE_REGION_KEYS = {
  METADATA: 'metadata',
  WHAT_IS_NEXT: 'what_is_next',
  OPEN_QUESTIONS: 'open_questions',
  RECENT_DECISIONS: 'recent_decisions',
  RISKS: 'risks',
  HEALTH_CHECK: 'health_check',
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
 * marker file, and produces the generated content for each STATE.md region.
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

  // 2. Blocked WUs — from 🔴 rows in work-units/_index.md.
  const blockedWorkflows = await readBlockedWorkflowsFromIndex(buildRoot);

  // 3. Register indexes (all parsed from live disk files).
  const unresolvedQuestions = await readUnresolvedQuestions(buildRoot);
  const recentDecisions = await readRecentDecisions(buildRoot);
  const activeRisks = await readActiveRisks(buildRoot);
  const healthStats = await readHealthStatsFromDisk(buildRoot);

  // 4. Build each section's text content.
  const metadataText = renderMetadataSection(activeWu, today, healthStats);
  const whatIsNextText = renderWhatIsNextSection(activeWu, blockedWorkflows);
  const openQuestionsText = renderOpenQuestionsSection(unresolvedQuestions);
  const recentDecisionsText = renderRecentDecisionsSection(recentDecisions);
  const risksText = renderRisksSection(activeRisks);
  const healthCheckText = renderHealthCheckSection(healthStats);

  // 5. Assemble LLMCompilationOutput (one section per region, positionally ordered)
  const sections = [
    { key: STATE_REGION_KEYS.METADATA,         heading: 'Metadata',                              text: metadataText,        citationIds: [], position: 1 },
    { key: STATE_REGION_KEYS.WHAT_IS_NEXT,     heading: 'What is next',                          text: whatIsNextText,      citationIds: [], position: 2 },
    { key: STATE_REGION_KEYS.OPEN_QUESTIONS,   heading: 'Open questions blocking active work',   text: openQuestionsText,   citationIds: [], position: 3 },
    { key: STATE_REGION_KEYS.RECENT_DECISIONS, heading: 'Recent decisions',                      text: recentDecisionsText, citationIds: [], position: 4 },
    { key: STATE_REGION_KEYS.RISKS,            heading: 'Risks currently being watched',         text: risksText,           citationIds: [], position: 5 },
    { key: STATE_REGION_KEYS.HEALTH_CHECK,     heading: 'Health check',                          text: healthCheckText,     citationIds: [], position: 6 },
  ];

  const compilationOutput: LLMCompilationOutput = {
    summary: `STATE.md compiled ${today} from live markdown registers. Active: ${activeWu?.handle ?? 'none'}.`,
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
    lines.push('This is expected on first cutover. The sentinel pairs must be inserted');
    lines.push('manually into STATE.md by the operator (Stage B walkthrough) before');
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
    '  These regions are compiled deterministically from the workflow store and',
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

interface RecentDecision {
  handle: string;
  title: string;
  status: string | null;
  fileModifiedAt: string;
}

async function readRecentDecisions(buildRoot: string): Promise<RecentDecision[]> {
  const indexContent = await readIndexFile(path.join(buildRoot, 'decisions', '_index.md'));
  if (!indexContent) return [];
  return parseDecisionsIndex(indexContent);
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

interface ActiveRisk {
  id: string;
  title: string;
  severity: string;
  likelihood: string;
  status: string;
}

async function readActiveRisks(buildRoot: string): Promise<ActiveRisk[]> {
  const indexContent = await readIndexFile(path.join(buildRoot, 'risks', '_index.md'));
  if (!indexContent) return [];
  return parseRisksIndex(indexContent);
}

interface HealthStats {
  inProgressWus: number;
  doneWus: number;
  blockedWus: number;
  totalDecisions: number;
  openQuestions: number;
  activeRisks: number;
  /** Highest in-progress WU number (for phase derivation). */
  maxInProgressWuNum: number;
}

/**
 * Derive health stats entirely from live disk sources:
 *   - in_progress / blocked counts: 🟡 / 🔴 rows in work-units/_index.md
 *   - completed count: files in work-units/done/
 *   - decisions count: active rows in decisions/_index.md
 *   - open questions: active rows in open-questions/_index.md
 *   - active risks: active rows in risks/_index.md
 *
 * The workflow store is NOT consulted (it is stale under Mode 1 — D129).
 */
async function readHealthStatsFromDisk(buildRoot: string): Promise<HealthStats> {
  const wuIndex = await readIndexFile(path.join(buildRoot, 'work-units', '_index.md'));
  let inProgressWus = 0;
  let blockedWus = 0;
  let maxInProgressWuNum = 0;

  if (wuIndex) {
    for (const line of wuIndex.split('\n')) {
      if (!/^\s*\|/.test(line)) continue;
      const cells = line.split('|').map((c) => c.trim());
      if (cells.length < 4) continue;
      const idCell = cells[1];
      if (!idCell || /^[-\s]*$/.test(idCell) || idCell === 'ID') continue;
      const statusCell = cells[3] ?? '';
      if (statusCell.includes('🟡')) {
        inProgressWus++;
        // Extract the numeric part of the ID for phase derivation
        const numMatch = idCell.match(/^(\d+)/);
        if (numMatch) {
          const n = parseInt(numMatch[1], 10);
          if (n > maxInProgressWuNum) maxInProgressWuNum = n;
        }
      }
      if (statusCell.includes('🔴')) blockedWus++;
    }
  }

  // Completed count: files in work-units/done/
  let doneWus = 0;
  try {
    const doneEntries = await readdir(path.join(buildRoot, 'work-units', 'done'));
    doneWus = doneEntries.filter((f) => f.endsWith('.md') && !f.startsWith('_')).length;
  } catch {
    // done/ may not exist yet
  }

  // Decisions: active rows in decisions/_index.md
  const decisionsIndex = await readIndexFile(path.join(buildRoot, 'decisions', '_index.md'));
  let totalDecisions = 0;
  if (decisionsIndex) {
    const activeSection = decisionsIndex.split(/^## (?:Superseded|Withdrawn) decisions/im)[0];
    for (const line of activeSection.split('\n')) {
      if (!/^\s*\|/.test(line)) continue;
      const cells = line.split('|').map((c) => c.trim());
      if (cells.length < 3) continue;
      const idCell = cells[1];
      if (!idCell || /^[-\s]*$/.test(idCell) || idCell === 'ID' || idCell === '---') continue;
      if (/^D\d+/i.test(idCell.replace(/^\[/, ''))) totalDecisions++;
    }
  }

  // Open questions: active section
  const questionsIndex = await readIndexFile(path.join(buildRoot, 'open-questions', '_index.md'));
  let openQuestions = 0;
  if (questionsIndex) {
    const activeSection = questionsIndex.split(/^## Resolved questions/im)[0];
    for (const line of activeSection.split('\n')) {
      if (!/^\s*\|/.test(line)) continue;
      const cells = line.split('|').map((c) => c.trim());
      if (cells.length < 3) continue;
      const idCell = cells[1];
      if (!idCell || /^[-\s]*$/.test(idCell) || idCell === 'ID' || idCell === '---') continue;
      if (/^Q\d+/i.test(idCell.replace(/^\[/, ''))) openQuestions++;
    }
  }

  // Active risks: active section
  const risksIndex = await readIndexFile(path.join(buildRoot, 'risks', '_index.md'));
  let activeRisks = 0;
  if (risksIndex) {
    const activeSection = risksIndex.split(/^## Resolved risks/im)[0];
    for (const line of activeSection.split('\n')) {
      if (!/^\s*\|/.test(line)) continue;
      const cells = line.split('|').map((c) => c.trim());
      if (cells.length < 3) continue;
      const idCell = cells[1];
      if (!idCell || /^[-\s]*$/.test(idCell) || idCell === 'ID' || idCell === '---') continue;
      if (/^R\d+/i.test(idCell)) activeRisks++;
    }
  }

  return { inProgressWus, doneWus, blockedWus, totalDecisions, openQuestions, activeRisks, maxInProgressWuNum };
}

// ---------------------------------------------------------------------------
// Text renderers for each section
// ---------------------------------------------------------------------------

function renderMetadataSection(
  activeWu: ActiveWuInfo | null,
  today: string,
  stats: HealthStats
): string {
  const phase = deriveCurrentPhase(stats.maxInProgressWuNum);

  const lines: string[] = [
    '| Field | Value |',
    '| --- | --- |',
    `| Last compiled | ${today} |`,
    `| Current phase | ${phase} |`,
    `| Active WU | ${activeWu ? `**${activeWu.handle}** — ${activeWu.title} (${activeWu.status ?? 'unknown'})` : '(no active WU declared — run `nuos-catalogue wu start <handle>`)'} |`,
    `| WUs in progress | ${stats.inProgressWus} |`,
  ];

  return lines.join('\n');
}

/**
 * Derive the current phase label from the highest in-progress WU number
 * (read from the live `work-units/_index.md`, not the store).
 */
function deriveCurrentPhase(maxInProgressWuNum: number): string {
  if (maxInProgressWuNum === 0) return 'No active phase detected';
  if (maxInProgressWuNum >= 100) return 'Continuous Track 1 — NuOS leads the build';
  if (maxInProgressWuNum >= 80)  return 'Phase 5 — Consumer shell + productisation';
  if (maxInProgressWuNum >= 60)  return 'Phase 4 — Trifecta integration test';
  if (maxInProgressWuNum >= 40)  return 'Phase 3 — NuWiki + trifecta';
  if (maxInProgressWuNum >= 20)  return 'Phase 2 — NuFlow';
  return 'Phase 1 — NuVector';
}

function renderWhatIsNextSection(
  activeWu: ActiveWuInfo | null,
  blockedWorkflows: BlockedWorkflow[]
): string {
  if (!activeWu) {
    return [
      'No active WU marker found. Declare the active WU with:',
      '    nuos-catalogue wu start <handle>',
      '',
      'Then recompile STATE.md with `nuos-catalogue state compile`.',
    ].join('\n');
  }

  const lines: string[] = [
    `**Active WU: ${activeWu.handle}** — ${activeWu.title}`,
    `Status: \`${activeWu.status ?? 'in_progress'}\``,
  ];

  if (blockedWorkflows.length > 0) {
    lines.push('');
    lines.push('**Blocked work units requiring attention:**');
    for (const b of blockedWorkflows) {
      lines.push(`- ${b.handle} — ${b.title}`);
    }
  }

  lines.push('');
  lines.push('Continue the active WU. Recompile STATE.md at end-of-session via `nuos-catalogue state compile`.');

  return lines.join('\n');
}

function renderOpenQuestionsSection(questions: UnresolvedQuestion[]): string {
  if (questions.length === 0) {
    return 'No unresolved open questions. See `docs/build/open-questions/_index.md` for the full register.';
  }

  const lines: string[] = [];
  for (const q of questions.slice(0, 10)) {
    const blocks = q.blocks ? ` — blocks: ${q.blocks}` : '';
    lines.push(`- **${q.id}** — ${q.title}${blocks}`);
  }
  if (questions.length > 10) {
    lines.push(`- *(${questions.length - 10} more — see open-questions/_index.md)*`);
  }

  return lines.join('\n');
}

function renderRecentDecisionsSection(decisions: RecentDecision[]): string {
  if (decisions.length === 0) {
    return 'No decisions found. See `docs/build/decisions/_index.md` for the full register.';
  }

  const recent = decisions.slice(0, 8);
  const lines: string[] = [];
  for (const d of recent) {
    lines.push(`- **${d.handle}** — ${d.title}${d.status ? ` *(${d.status})*` : ''}`);
  }
  if (decisions.length > 8) {
    lines.push(`- *(${decisions.length - 8} more — see decisions/_index.md)*`);
  }

  return lines.join('\n');
}

function renderRisksSection(risks: ActiveRisk[]): string {
  if (risks.length === 0) {
    return 'No active risks found. See `docs/build/risks/_index.md` for the full register.';
  }

  const lines: string[] = [];
  for (const r of risks.slice(0, 5)) {
    lines.push(`- **${r.id}** (${r.severity}) — ${r.title} *(${r.status})*`);
  }
  if (risks.length > 5) {
    lines.push(`- *(${risks.length - 5} more — see risks/_index.md)*`);
  }

  return lines.join('\n');
}

function renderHealthCheckSection(stats: HealthStats): string {
  const lines: string[] = [
    '| Check | Count |',
    '| --- | --- |',
    `| WUs in progress | ${stats.inProgressWus} |`,
    `| WUs completed | ${stats.doneWus} (files in work-units/done/) |`,
    `| Decisions recorded | ${stats.totalDecisions} (active section) |`,
    `| Open questions | ${stats.openQuestions} |`,
    `| Active risks | ${stats.activeRisks} |`,
  ];
  if (stats.blockedWus > 0) {
    lines.push(`| Blocked WUs | ${stats.blockedWus} — attention needed |`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Index file parsers
// ---------------------------------------------------------------------------

async function readIndexFile(filePath: string): Promise<string | null> {
  try {
    const { readFile: rf } = await import('node:fs/promises');
    return await rf(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Parse the decisions _index.md table — active decisions only.
 * Row shape: `| [D001](file.md) | Title | Date | Status |`
 * or: `| D001 | Title | Date | Status |`
 *
 * The real decisions/_index.md has three terminal sections after the active
 * table: `## Superseded decisions`, `## Withdrawn decisions`, and
 * `## How to write a decision`. We split on the first non-active section
 * (whichever of Superseded / Withdrawn appears first) so a high-numbered
 * decision that is later superseded never leaks into the generated region.
 */
function parseDecisionsIndex(content: string): RecentDecision[] {
  const decisions: RecentDecision[] = [];

  // Scope to the active-decisions section only.
  // Split on the first of the two non-active `##` headers that follow it.
  const activeSection = content.split(/^## (?:Superseded|Withdrawn) decisions/im)[0];
  const lines = activeSection.split('\n');

  for (const line of lines) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim());
    // Expect: [empty, id-cell, title, date, status, empty]
    if (cells.length < 5) continue;

    const idCell = cells[1];
    if (!idCell || !/^D\d+/i.test(idCell.replace(/^\[/, ''))) continue;

    // Extract the handle — strip link markup if present
    const handleMatch = idCell.match(/\[?(D\d+)\]?/i);
    if (!handleMatch) continue;
    const handle = handleMatch[1];

    const title = cells[2] ?? '';
    if (!title || title === 'Title' || title === '---') continue;

    const status = cells[4] ?? null;
    if (status === 'Status' || status === '---') continue;

    decisions.push({
      handle,
      title,
      status: status || null,
      fileModifiedAt: cells[3] ?? '',
    });
  }

  // Sort by handle number descending to get most recent first
  return decisions.sort((a, b) => {
    const na = parseInt(a.handle.slice(1), 10);
    const nb = parseInt(b.handle.slice(1), 10);
    return nb - na;
  });
}

/**
 * Parse the open-questions _index.md active table.
 * Row shape: `| [Q003](file.md) | Title | Blocks | Raised |`
 * or: `| Q003 | Title | Blocks | Raised |`
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

/**
 * Parse the risks _index.md active table.
 * Row shape: `| R001 | Title | Severity | Likelihood | Status |`
 */
function parseRisksIndex(content: string): ActiveRisk[] {
  const risks: ActiveRisk[] = [];

  // Find the "Active risks" section — stop at "Resolved risks"
  const activeSection = content.split(/^## Resolved risks/im)[0];
  const lines = activeSection.split('\n');

  for (const line of lines) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 6) continue;

    const idCell = cells[1];
    if (!idCell || !/^R\d+/i.test(idCell)) continue;
    if (idCell === 'ID' || idCell === '---') continue;

    const id = idCell;
    const title = cells[2] ?? '';
    if (!title || title === 'Title' || title === '---') continue;

    const severity = cells[3] ?? '';
    const likelihood = cells[4] ?? '';
    const status = cells[5] ?? '';
    if (status === 'Status' || status === '---') continue;

    risks.push({ id, title, severity, likelihood, status });
  }

  return risks;
}
