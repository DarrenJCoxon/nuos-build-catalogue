/**
 * `nuos-catalogue state compile` — STATE.md hybrid-document recompile (WU 113b / D132).
 *
 * Reads canonical state from disk (workflow store + register indexes) and
 * splices the generated sections into the sentinel-delimited regions of
 * STATE.md, leaving all authored prose byte-for-byte identical.
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
 *   - Generated regions: store is source of truth; disk is rendered projection.
 *   - Authored regions: disk remains the edit base (untouched by this command).
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
import type { MigratedRecord } from '../migrate/types.js';

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
 * Reads canonical state from the workflow store and the register index files
 * and produces the generated content for each STATE.md region.
 *
 * No LLM call is made. The adapter derives all content deterministically.
 */
export async function buildStateCompilationOutput(
  input: StateSourceAdapterInput
): Promise<StateCompiledOutput> {
  const { store, buildRoot } = input;
  const now = input.now ?? new Date().toISOString();
  const today = now.slice(0, 10);

  // 1. Active WU + workflow state
  const activeWu = deriveActiveWu(store);
  const blockedWorkflows = deriveBlockedWorkflows(store);

  // 2. Register indexes (parsed from disk)
  const unresolvedQuestions = await readUnresolvedQuestions(buildRoot);
  const recentDecisions = await readRecentDecisions(buildRoot);
  const activeRisks = await readActiveRisks(buildRoot);
  const healthStats = deriveHealthStats(store);

  // 3. Build each section's text content
  const metadataText = renderMetadataSection(activeWu, today, store);
  const whatIsNextText = renderWhatIsNextSection(activeWu, blockedWorkflows, store);
  const openQuestionsText = renderOpenQuestionsSection(unresolvedQuestions);
  const recentDecisionsText = renderRecentDecisionsSection(recentDecisions);
  const risksText = renderRisksSection(activeRisks);
  const healthCheckText = renderHealthCheckSection(healthStats);

  // 4. Assemble LLMCompilationOutput (one section per region, positionally ordered)
  const sections = [
    { key: STATE_REGION_KEYS.METADATA,         heading: 'Metadata',                              text: metadataText,        citationIds: [], position: 1 },
    { key: STATE_REGION_KEYS.WHAT_IS_NEXT,     heading: 'What is next',                          text: whatIsNextText,      citationIds: [], position: 2 },
    { key: STATE_REGION_KEYS.OPEN_QUESTIONS,   heading: 'Open questions blocking active work',   text: openQuestionsText,   citationIds: [], position: 3 },
    { key: STATE_REGION_KEYS.RECENT_DECISIONS, heading: 'Recent decisions',                      text: recentDecisionsText, citationIds: [], position: 4 },
    { key: STATE_REGION_KEYS.RISKS,            heading: 'Risks currently being watched',         text: risksText,           citationIds: [], position: 5 },
    { key: STATE_REGION_KEYS.HEALTH_CHECK,     heading: 'Health check',                          text: healthCheckText,     citationIds: [], position: 6 },
  ];

  const compilationOutput: LLMCompilationOutput = {
    summary: `STATE.md compiled ${today} from canonical workflow store (${store.list().length} records). Active: ${activeWu?.handle ?? 'none'}.`,
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
// Section renderers — deterministic, no LLM
// ---------------------------------------------------------------------------

interface ActiveWuInfo {
  handle: string;
  title: string;
  status: string | null;
  slug: string;
}

function deriveActiveWu(store: WorkflowStore): ActiveWuInfo | null {
  const wuRecords = store.list().filter((r) => r.register === 'work_unit');
  if (wuRecords.length === 0) return null;

  const inProgress = wuRecords.filter(
    (r) => r.status && r.status.includes('in_progress')
  );
  if (inProgress.length === 0) return null;

  const sorted = inProgress.sort((a, b) =>
    (b.fileModifiedAt ?? '').localeCompare(a.fileModifiedAt ?? '')
  );
  const r = sorted[0];
  return { handle: r.handle, title: r.title, status: r.status, slug: r.slug };
}

interface BlockedWorkflow {
  handle: string;
  title: string;
}

function deriveBlockedWorkflows(store: WorkflowStore): BlockedWorkflow[] {
  return store
    .list()
    .filter((r) => r.status && r.status.includes('blocked'))
    .map((r) => ({ handle: r.handle, title: r.title }));
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
  totalWus: number;
  inProgressWus: number;
  doneWus: number;
  blockedWus: number;
  totalDecisions: number;
  openQuestions: number;
  activeRisks: number;
}

function deriveHealthStats(store: WorkflowStore): HealthStats {
  const all = store.list();
  const wus = all.filter((r) => r.register === 'work_unit');
  const decisions = all.filter((r) => r.register === 'decision');
  const questions = all.filter((r) => r.register === 'open_question');

  return {
    totalWus: wus.length,
    inProgressWus: wus.filter((r) => r.status?.includes('in_progress')).length,
    doneWus: wus.filter((r) => r.status?.includes('done') || r.status?.includes('completed')).length,
    blockedWus: wus.filter((r) => r.status?.includes('blocked')).length,
    totalDecisions: decisions.length,
    openQuestions: questions.filter((r) => !r.status?.includes('resolved')).length,
    activeRisks: 0, // derived from risks index; kept as 0 here — risks are store-external
  };
}

// ---------------------------------------------------------------------------
// Text renderers for each section
// ---------------------------------------------------------------------------

function renderMetadataSection(
  activeWu: ActiveWuInfo | null,
  today: string,
  store: WorkflowStore
): string {
  const all = store.list();
  const wus = all.filter((r) => r.register === 'work_unit');
  const inProgressWus = wus.filter((r) => r.status?.includes('in_progress'));

  const phase = deriveCurrentPhase(store);

  const lines: string[] = [
    '| Field | Value |',
    '| --- | --- |',
    `| Last compiled | ${today} |`,
    `| Current phase | ${phase} |`,
    `| Active WU | ${activeWu ? `**${activeWu.handle}** — ${activeWu.title} (${activeWu.status ?? 'unknown'})` : 'none'} |`,
    `| WUs in progress | ${inProgressWus.length} |`,
  ];

  return lines.join('\n');
}

function deriveCurrentPhase(store: WorkflowStore): string {
  // Heuristic: if any WU in the 110–120 range is in_progress, we're in
  // Continuous Track 1. Otherwise inspect WU number ranges.
  const inProgress = store.list().filter(
    (r) => r.register === 'work_unit' && r.status?.includes('in_progress')
  );

  if (inProgress.length === 0) return 'No active phase detected';

  // Find the highest numbered in-progress WU to estimate phase.
  const numbers = inProgress.map((r) => r.number).filter((n) => n > 0);
  if (numbers.length === 0) return 'Continuous Track';
  const maxNum = Math.max(...numbers);

  if (maxNum >= 100) return 'Continuous Track 1 — NuOS leads the build';
  if (maxNum >= 80)  return 'Phase 5 — Consumer shell + productisation';
  if (maxNum >= 60)  return 'Phase 4 — Trifecta integration test';
  if (maxNum >= 40)  return 'Phase 3 — NuWiki + trifecta';
  if (maxNum >= 20)  return 'Phase 2 — NuFlow';
  return 'Phase 1 — NuVector';
}

function renderWhatIsNextSection(
  activeWu: ActiveWuInfo | null,
  blockedWorkflows: BlockedWorkflow[],
  store: WorkflowStore
): string {
  if (!activeWu) {
    const nextReady = store
      .list()
      .filter((r) => r.register === 'work_unit' && r.status?.includes('proposed'))
      .sort((a, b) => a.number - b.number)
      .slice(0, 3);

    if (nextReady.length === 0) {
      return 'No active or ready work unit found in the workflow store. Run `nuos-catalogue migrate` if the store is empty, or start a work unit with `nuos-catalogue wu start <handle>`.';
    }

    const lines = ['No WU is currently in progress. Next proposed WUs:'];
    for (const wu of nextReady) {
      lines.push(`- **${wu.handle}** — ${wu.title}`);
    }
    return lines.join('\n');
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
    '| Check | Status |',
    '| --- | --- |',
    `| Workflow store populated | ${stats.totalWus > 0 ? '✅' : '⚠ run migrate first'} |`,
    `| WUs in progress | ${stats.inProgressWus} |`,
    `| WUs completed | ${stats.doneWus} |`,
    `| Decisions recorded | ${stats.totalDecisions} |`,
    `| Open questions | ${stats.openQuestions} |`,
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
