/**
 * `nuos-catalogue end-of-session` — runnable CLI driver for the
 * `end_of_session` verify-and-gate workflow (WU 112 / D130).
 *
 * This command:
 *   1. Gathers `EndOfSessionFacts` from disk (mtimes, file existence, index
 *      parity, TODAY's date).
 *   2. Checks for an existing `session.end:<date>` record in the store (resume
 *      support — if a prior run left the session incomplete, it continues from
 *      the persisted step-state).
 *   3. Drives the workflow lifecycle through the NuFlow runtime.
 *   4. Prints a per-check report (pass/fail per step).
 *   5. Exits non-zero if the gate blocks (any gating check failed).
 *
 * D129/D130-safe: this command writes NO catalogue prose and renders NO
 * markdown from the store. Its only persistent write is the
 * `session.end:<date>` step-state record (via the MIS adapter).
 *
 * Note: the "what this gate cannot do" boundary is printed in the report —
 * a green gate proves presence/structure only, not semantic correctness of
 * STATE.md or the truth of a session-log narrative.
 */

import { stat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { NuFlowRuntime, ActorRef, CaptureInput } from '@nusoft/nuflow';
import type {
  EndOfSessionFacts,
  EndOfSessionMetadata,
  EndOfSessionStepId,
  EndOfSessionStepState,
} from '@nusoft/nuflow-pack-nuos-build-catalogue';
import type { WorkflowStore } from '../migrate/store.js';
import { cmdStateCompile } from './state-compile.js';

const BUILD_MAINTAINER: ActorRef = {
  kind: 'staff',
  id: 'build-maintainer',
  role: 'build-maintainer',
};

export interface EndOfSessionHandlerResult {
  output: string;
  exitCode: number;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function cmdEndOfSession(
  store: WorkflowStore,
  runtime: NuFlowRuntime,
  args: {
    buildRoot: string;
    activeWuHandle?: string;
    sessionDate?: string;
    sessionStartIso?: string;
    dryRun?: boolean;
  }
): Promise<EndOfSessionHandlerResult> {
  const today = args.sessionDate ?? new Date().toISOString().slice(0, 10);
  const sessionStartIso = args.sessionStartIso ?? new Date(today + 'T00:00:00.000Z').toISOString();

  // Resolve the active WU handle — required for step 1 check.
  const activeWuHandle = args.activeWuHandle ?? resolveActiveWuHandle(store);
  if (!activeWuHandle) {
    return {
      output: [
        'end-of-session: cannot determine the active WU handle.',
        'Supply --active-wu=<handle> or run `nuos-catalogue wu start <handle>` first.',
      ].join('\n'),
      exitCode: 1,
    };
  }

  // Gather disk facts — this is the only place filesystem access happens
  // (the workflow itself is pure).
  const catalogueFacts = await gatherFacts(args.buildRoot, activeWuHandle, sessionStartIso, today, store);

  // Check for an existing (incomplete) session.end:<date> record.
  const existingHandle = `session.end:${today}`;
  const existingRecord = store.get(existingHandle);
  let resumeFromStep: EndOfSessionStepId | undefined;

  if (existingRecord) {
    try {
      const stored = JSON.parse(existingRecord.rawMarkdown) as {
        steps?: Record<string, EndOfSessionStepState>;
        completed?: boolean;
      };
      if (stored.completed) {
        return {
          output: [
            `end-of-session: session ${today} was already marked complete in a prior run.`,
            'If you need to re-verify, delete the store record and re-run.',
          ].join('\n'),
          exitCode: 0,
        };
      }
      // Find the first step that was not yet passed — resume from there.
      if (stored.steps) {
        const STEP_ORDER: EndOfSessionStepId[] = [
          'update_active_wu_notes',
          'capture_decisions',
          'capture_open_questions',
          'capture_risks',
          'update_work_units_index',
          'recompile_state_md',
          'update_state_md',
          'write_session_log',
          'confirm_no_loss',
          'report',
        ];
        for (const stepId of STEP_ORDER) {
          if (stored.steps[stepId]?.status !== 'passed') {
            resumeFromStep = stepId;
            break;
          }
        }
      }
    } catch {
      // If the existing record is malformed, start fresh.
    }
  }

  const metadata: EndOfSessionMetadata = {
    sessionDate: today,
    activeWuHandle,
    sessionStartIso,
    catalogueFacts,
    ...(resumeFromStep ? { resumeFromStep } : {}),
  };

  const capture: CaptureInput = {
    channel: 'typed_note',
    content: `end-of-session for ${today}`,
    subjects: [{ kind: 'session', id: existingHandle }],
    metadata: metadata as unknown as Record<string, unknown>,
  };

  // Drive the NuFlow lifecycle: start → confirm → commit.
  const wf = await runtime.startWorkflow('end_of_session', BUILD_MAINTAINER, capture);
  if (!wf.writeIntent) {
    return {
      output: 'end-of-session: workflow did not produce a writeIntent — unexpected runtime state.',
      exitCode: 1,
    };
  }
  const payload = wf.writeIntent.payload as {
    completed: boolean;
    failingChecks: string[];
    steps: Record<EndOfSessionStepId, EndOfSessionStepState>;
    sessionDate: string;
  };

  if (args.dryRun) {
    return {
      output: formatReport(payload, today, resumeFromStep, true),
      exitCode: payload.failingChecks.length > 0 ? 1 : 0,
    };
  }

  // Confirm and commit to persist the step-state record.
  const confirmedWf = await runtime.confirmIntent(wf.id, BUILD_MAINTAINER.id);
  await runtime.commitIntent(confirmedWf.id, BUILD_MAINTAINER.id);

  return {
    output: formatReport(payload, today, resumeFromStep, false),
    exitCode: payload.failingChecks.length > 0 ? 1 : 0,
  };
}

// ---------------------------------------------------------------------------
// Disk fact gathering — the only place fs access happens
// ---------------------------------------------------------------------------

async function gatherFacts(
  buildRoot: string,
  activeWuHandle: string,
  sessionStartIso: string,
  sessionDate: string,
  store: WorkflowStore
): Promise<EndOfSessionFacts> {
  const sessionStartMs = new Date(sessionStartIso).getTime();

  // Step 1: WU notes
  const { wuNotesTouched, wuNotesHasTodayHeading } = await checkWuNotes(
    buildRoot,
    activeWuHandle,
    sessionStartMs,
    sessionDate
  );

  // Steps 2–4: register parity
  const decisionsFileIndexParity = await checkRegisterParity(
    buildRoot,
    'decisions',
    sessionDate,
    /^D\d+.*\.md$/i
  );
  const questionsParity = await checkRegisterParity(
    buildRoot,
    'open-questions',
    sessionDate,
    /^Q\d+.*\.md$/i
  );
  const risksParity = await checkRisksParity(buildRoot);

  // Step 5: work-units index
  const doneMoveOk = await checkWorkUnitsIndex(buildRoot);

  // Step 5.5 (D132): recompile the generated regions of STATE.md.
  // This is the orchestrate-and-write step sanctioned by D132 for generated regions.
  // It must not fail the session if STATE.md has no sentinel regions yet (pre-cutover).
  const { stateMdRecompileResult, stateMdRecompileDetail } = await recompileStateMd(
    buildRoot,
    store
  );

  // Step 6: STATE.md
  const { stateMdTouched, stateMdLastUpdated, stateMdLastSessionResolves } =
    await checkStateMd(buildRoot, sessionStartMs, sessionDate);

  // Step 7: session log
  const { sessionLogExists, sessionLogIndexed } = await checkSessionLog(
    buildRoot,
    sessionDate
  );

  return {
    wuNotesTouched,
    wuNotesHasTodayHeading,
    decisionsFileIndexParity,
    questionsParity,
    risksParity,
    doneMoveOk,
    stateMdRecompileResult,
    stateMdRecompileDetail,
    stateMdTouched,
    stateMdLastUpdated,
    stateMdLastSessionResolves,
    sessionLogExists,
    sessionLogIndexed,
  };
}

// ---------------------------------------------------------------------------
// Individual fact checks
// ---------------------------------------------------------------------------

async function fileMtime(filePath: string): Promise<Date | null> {
  try {
    const s = await stat(filePath);
    return s.mtime;
  } catch {
    return null;
  }
}

// Returns the file's birth (creation) time, falling back to mtime when
// birthtime is unreliable (Linux ext4 without `relatime` reports birthtime as
// epoch 0 or equal to mtime). On macOS (APFS/HFS+) birthtime is always
// accurate. The fallback means: on those Linux filesystems a hand-edited file
// created before today but edited today will still appear as "created today" —
// a known false-positive. The real guarantee is the index-parity check; this
// filter is a best-effort "did you add something this session" hint only.
async function fileBirthtime(filePath: string): Promise<Date | null> {
  try {
    const s = await stat(filePath);
    // birthtimeMs === 0 signals an unsupported filesystem; fall back to mtime.
    if (s.birthtimeMs === 0) return s.mtime;
    return s.birthtime;
  } catch {
    return null;
  }
}

async function fileContent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function listDir(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

async function checkWuNotes(
  buildRoot: string,
  activeWuHandle: string,
  sessionStartMs: number,
  sessionDate: string
): Promise<{ wuNotesTouched: boolean; wuNotesHasTodayHeading: boolean }> {
  // Look in work-units/ and work-units/done/ for the WU file.
  const candidates = [
    path.join(buildRoot, 'work-units', `${activeWuHandle}.md`),
    // Handle numeric prefix patterns (e.g. 112-end-of-session-as-nuflow-workflow.md)
    ...(await findWuFile(buildRoot, activeWuHandle)),
  ];

  for (const candidate of candidates) {
    const mtime = await fileMtime(candidate);
    if (!mtime) continue;

    const touched = mtime.getTime() > sessionStartMs;
    const content = await fileContent(candidate);
    const hasTodayHeading = content
      ? content.includes(sessionDate) && /##\s*(Notes|notes)/.test(content)
      : false;

    return { wuNotesTouched: touched, wuNotesHasTodayHeading: hasTodayHeading };
  }

  return { wuNotesTouched: false, wuNotesHasTodayHeading: false };
}

async function findWuFile(buildRoot: string, activeWuHandle: string): Promise<string[]> {
  const results: string[] = [];
  for (const subdir of ['work-units', path.join('work-units', 'done')]) {
    const dirPath = path.join(buildRoot, subdir);
    try {
      const entries = await readdir(dirPath);
      for (const name of entries) {
        if (name.endsWith('.md') && name.includes(activeWuHandle.replace('wu-', ''))) {
          results.push(path.join(dirPath, name));
        }
      }
    } catch {
      // Directory may not exist.
    }
  }
  return results;
}

async function checkRegisterParity(
  buildRoot: string,
  registerDir: string,
  sessionDate: string,
  filePattern: RegExp
): Promise<{ filesWithoutRow: string[]; rowsWithoutFile: string[] }> {
  const dirPath = path.join(buildRoot, registerDir);
  const indexPath = path.join(dirPath, '_index.md');

  // Files created today (by birthtime — see fileBirthtime for platform notes).
  const allFiles = await listDir(dirPath);
  const todayFiles: string[] = [];
  for (const name of allFiles) {
    if (!filePattern.test(name)) continue;
    const btime = await fileBirthtime(path.join(dirPath, name));
    if (btime && btime.toISOString().startsWith(sessionDate)) {
      todayFiles.push(name);
    }
  }

  // Index rows mentioning today.
  const indexContent = await fileContent(indexPath);
  const todayIndexRows: string[] = [];
  if (indexContent) {
    const lines = indexContent.split('\n');
    for (const line of lines) {
      if (line.includes(sessionDate)) {
        todayIndexRows.push(line.trim());
      }
    }
  }

  // Bijection check: every today file should appear in the index,
  // and every today-dated index row should have a corresponding file.
  const filesWithoutRow: string[] = [];
  for (const file of todayFiles) {
    const baseName = file.replace('.md', '');
    const mentioned = todayIndexRows.some(
      (row) => row.includes(baseName) || row.includes(file)
    );
    if (!mentioned) {
      filesWithoutRow.push(file);
    }
  }

  const rowsWithoutFile: string[] = [];
  for (const row of todayIndexRows) {
    // Try to find any today-file mentioned in the row.
    const mentioned = todayFiles.some(
      (file) => row.includes(file.replace('.md', '')) || row.includes(file)
    );
    if (!mentioned) {
      rowsWithoutFile.push(row);
    }
  }

  return { filesWithoutRow, rowsWithoutFile };
}

async function checkRisksParity(
  buildRoot: string
): Promise<{ filesWithoutRow: string[]; rowsWithoutFile: string[] }> {
  // Risks are stored as index entries only (no individual files), so parity
  // is trivially satisfied — there are no "files" to check against.
  // This check is present for forward-compat when risks get individual files.
  return { filesWithoutRow: [], rowsWithoutFile: [] };
}

/**
 * Recompile the generated regions of STATE.md (D132 / D130: orchestrate-and-write
 * for the generated regions is sanctioned by D132; authored prose is never touched).
 *
 * Fail-open contract (same as `cmdStateDriftCheck`):
 *   - 'skipped' when STATE.md has no sentinel regions yet (pre-cutover) — ok
 *   - 'ok'      when the recompile succeeded (or was already current)
 *   - 'error'   when the compile command returned non-zero (adapter error, splice error)
 *
 * A 'skipped' result is treated as passing by the pack workflow so that
 * end-of-session is not broken for catalogues that haven't completed Stage B cutover.
 */
async function recompileStateMd(
  buildRoot: string,
  store: WorkflowStore
): Promise<{ stateMdRecompileResult: 'ok' | 'skipped' | 'error'; stateMdRecompileDetail?: string }> {
  try {
    const result = await cmdStateCompile(store, { buildRoot });
    if (result.exitCode === 0) {
      return { stateMdRecompileResult: 'ok', stateMdRecompileDetail: result.output?.trim() };
    }
    // Non-zero exit from cmdStateCompile — check if it's the missing-sentinel case (pre-cutover).
    // The missing-sentinel output contains the specific wording from the command.
    if (result.output?.includes('sentinel regions are absent')) {
      return {
        stateMdRecompileResult: 'skipped',
        stateMdRecompileDetail: 'sentinel regions absent — pre-cutover',
      };
    }
    return {
      stateMdRecompileResult: 'error',
      stateMdRecompileDetail: result.output?.trim(),
    };
  } catch (err) {
    return {
      stateMdRecompileResult: 'error',
      stateMdRecompileDetail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkWorkUnitsIndex(buildRoot: string): Promise<boolean> {
  const indexPath = path.join(buildRoot, 'work-units', '_index.md');
  const content = await fileContent(indexPath);
  if (!content) return true; // If no index, no rows to check.

  // Design A (WU 112 fix-pass): operate on table rows only; check status cell only.
  // Row shape after split on '|': ['', id, title, status, dependsOn, ...]
  // (leading empty string from the leading pipe character)
  const lines = content.split('\n');
  for (const line of lines) {
    // Only consider actual table rows (lines starting with '|' after optional whitespace).
    if (!/^\s*\|/.test(line)) continue;
    const cells = line.split('|');
    // Need at least 5 cells: [empty, id, title, status, dependsOn, ...] (leading/trailing empty from outer pipes)
    if (cells.length < 5) continue;
    // Status is the 3rd content cell (index 3 in the split array, after the leading empty).
    const statusCell = cells[3];
    if (!statusCell) continue;
    // A row is completed only if its STATUS cell contains ✅.
    // This avoids false-positives from Depends-on column mentions, legend lines, and phase headers.
    if (!statusCell.includes('✅')) continue;

    // Completed row: extract the first markdown link from the TITLE cell (index 2).
    const titleCell = cells[2];
    if (!titleCell) continue;
    const linkMatch = titleCell.match(/\[.*?\]\((.*?)\)/);
    if (!linkMatch) {
      // No link in the title cell — legacy/sibling WU (lives in a sibling repo, never had a done/ file here).
      // Skip: not verifiable by this gate (presence-only, D130).
      continue;
    }

    const linkTarget = linkMatch[1];
    // A completed row linking to a top-level NNN-...md (not done/) is drift: the WU was never moved.
    if (!linkTarget.includes('done/')) {
      return false;
    }
    // A completed row whose done/ file is missing is also drift.
    const filePath = path.join(buildRoot, 'work-units', linkTarget);
    const mtime = await fileMtime(filePath);
    if (!mtime) {
      return false;
    }
  }
  return true;
}

async function checkStateMd(
  buildRoot: string,
  sessionStartMs: number,
  sessionDate: string
): Promise<{
  stateMdTouched: boolean;
  stateMdLastUpdated: string;
  stateMdLastSessionResolves: boolean;
}> {
  const stateMdPath = path.join(buildRoot, 'STATE.md');
  const mtime = await fileMtime(stateMdPath);
  const stateMdTouched = mtime ? mtime.getTime() > sessionStartMs : false;

  const content = await fileContent(stateMdPath);
  let stateMdLastUpdated = '';
  // Renamed from stateMdLastSessionResolves → stateMdLastSessionPresent (WU 113b).
  // The field checks presence of a non-empty "Last session" row, not link resolution.
  let stateMdLastSessionPresent = false;

  if (content) {
    // Fix 1 (WU 112 fix-pass): accept all three "Last updated" shapes:
    //   table-row: | Last updated | 2026-05-31 (**Session 115 — ...**) ... |
    //   bold-colon: **Last updated:** 2026-05-31
    //   plain-colon: Last updated: 2026-05-31
    // Anchor on the label text (colon optional), grab the FIRST YYYY-MM-DD on the same logical line.
    // The [^\n]*? keeps the match within the label's own row.
    const updatedMatch = content.match(/Last updated[^\n]*?(\d{4}-\d{2}-\d{2})/i);
    if (updatedMatch) {
      stateMdLastUpdated = updatedMatch[1];
    }

    // Fix 2 (WU 112 fix-pass): the real "Last session" row is narrative prose with NO markdown link.
    // Real format: | Last session | Session 112 — ...prose... |
    // Assert only that a non-empty "Last session" row/line is present (D130: do not overclaim).
    // Link-resolution is dropped because the real format carries no link to resolve.
    // Session-log existence on disk is independently verified by Step 7 (checkSessionLog).
    const sessionLineMatch = content.match(/Last session[^\n]*/i);
    if (sessionLineMatch) {
      // The row is non-empty if it contains more than just the label itself.
      const rowText = sessionLineMatch[0].replace(/Last session/i, '').replace(/[|:\s]/g, '');
      stateMdLastSessionPresent = rowText.length > 0;
    }
  }

  // Return under the pack's EndOfSessionFacts field name (stateMdLastSessionResolves)
  // — the internal variable was renamed to stateMdLastSessionPresent above to clarify
  // the semantics (presence check, not link-resolution). The published interface is
  // unchanged so the pack type is not broken.
  return { stateMdTouched, stateMdLastUpdated, stateMdLastSessionResolves: stateMdLastSessionPresent };
}

async function checkSessionLog(
  buildRoot: string,
  sessionDate: string
): Promise<{ sessionLogExists: boolean; sessionLogIndexed: boolean }> {
  const sessionsDir = path.join(buildRoot, 'sessions');
  const allSessionFiles = await listDir(sessionsDir);

  // Look for sessions/<sessionDate>-*.md
  const sessionLogFile = allSessionFiles.find((name) => name.startsWith(sessionDate + '-'));
  const sessionLogExists = sessionLogFile !== undefined;

  let sessionLogIndexed = false;
  if (sessionLogExists && sessionLogFile) {
    const indexPath = path.join(sessionsDir, '_index.md');
    const indexContent = await fileContent(indexPath);
    if (indexContent) {
      sessionLogIndexed =
        indexContent.includes(sessionLogFile) || indexContent.includes(sessionDate);
    }
  }

  return { sessionLogExists, sessionLogIndexed };
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

function formatReport(
  payload: {
    completed: boolean;
    failingChecks: string[];
    steps: Record<EndOfSessionStepId, EndOfSessionStepState>;
    sessionDate: string;
  },
  today: string,
  resumedFrom: EndOfSessionStepId | undefined,
  dryRun: boolean
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('══════════════════════════════════════════════════════════════════════');
  lines.push(`  end-of-session: ${today}${dryRun ? ' (dry run)' : ''}`);
  if (resumedFrom) {
    lines.push(`  resumed from step: ${resumedFrom}`);
  }
  lines.push('══════════════════════════════════════════════════════════════════════');
  lines.push('');

  const STEP_LABELS: Record<EndOfSessionStepId, string> = {
    update_active_wu_notes:  'Step 1  — WU notes updated',
    capture_decisions:       'Step 2  — decisions captured',
    capture_open_questions:  'Step 3  — open questions captured',
    capture_risks:           'Step 4  — risks captured',
    update_work_units_index: 'Step 5  — work-units index updated',
    recompile_state_md:      'Step 5b — STATE.md generated regions recompiled (D132)',
    update_state_md:         'Step 6  — STATE.md updated',
    write_session_log:       'Step 7  — session log written',
    confirm_no_loss:         'Step 8  — confirm-no-loss gate',
    report:                  'Step 9  — report',
  };

  for (const [stepId, state] of Object.entries(payload.steps) as [EndOfSessionStepId, EndOfSessionStepState][]) {
    const label = STEP_LABELS[stepId] ?? stepId;
    const icon = state.status === 'passed' ? '  [PASS]' : state.status === 'failed' ? '  [FAIL]' : '  [....] ';
    lines.push(`${icon} ${label}`);
    if (state.status === 'failed' && state.evidence) {
      // Indent the failure detail.
      for (const evidenceLine of state.evidence.split('\n')) {
        lines.push(`         ${evidenceLine}`);
      }
    }
  }

  lines.push('');

  if (payload.completed) {
    lines.push('  GATE: PASSED — session marked complete.');
    lines.push('');
    lines.push('  NOTE: this gate verifies presence and structure only. It does NOT');
    lines.push('  assert that STATE.md is factually correct or that session-log');
    lines.push('  narrative is true. That judgement stays with the AI and operator.');
  } else {
    lines.push(`  GATE: BLOCKED — ${payload.failingChecks.length} check(s) failed:`);
    lines.push('');
    for (const check of payload.failingChecks) {
      for (const checkLine of check.split('\n')) {
        lines.push(`  ${checkLine}`);
      }
    }
    lines.push('');
    lines.push('  Fix the failing checks (make the artefacts present and well-formed),');
    lines.push('  then re-run `nuos-catalogue end-of-session` to continue / resume.');
  }

  lines.push('══════════════════════════════════════════════════════════════════════');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveActiveWuHandle(store: WorkflowStore): string | null {
  // Try to read the active WU from the wu-active file (WU 136 mechanism).
  // The wu-active command writes a marker file; we can't read it here without
  // knowing the project root. Fall back to the most-recently-modified WU record.
  const wuRecords = store.list().filter((r) => r.register === 'work_unit');
  if (wuRecords.length === 0) return null;

  // Return the most recently modified in_progress WU, or any in_progress.
  const inProgress = wuRecords.filter((r) => (r.status ?? '').includes('in_progress'));
  if (inProgress.length > 0) {
    return inProgress.sort((a, b) =>
      (b.fileModifiedAt ?? '').localeCompare(a.fileModifiedAt ?? '')
    )[0].handle;
  }

  return null;
}
