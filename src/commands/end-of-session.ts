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
  const catalogueFacts = await gatherFacts(args.buildRoot, activeWuHandle, sessionStartIso, today);

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
  sessionDate: string
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

async function checkWorkUnitsIndex(buildRoot: string): Promise<boolean> {
  const indexPath = path.join(buildRoot, 'work-units', '_index.md');
  const content = await fileContent(indexPath);
  if (!content) return true; // If no index, no rows to check.

  const lines = content.split('\n');
  for (const line of lines) {
    // Look for rows with ✅ that link to a file.
    if (!line.includes('✅')) continue;
    // Extract the link target from markdown link syntax [text](path).
    const linkMatch = line.match(/\[.*?\]\((.*?)\)/);
    if (!linkMatch) continue;
    const linkTarget = linkMatch[1];
    // ✅ WUs should link to done/ subdirectory.
    if (!linkTarget.includes('done/')) {
      return false;
    }
    // Check the linked file exists.
    const filePath = path.join(buildRoot, 'work-units', linkTarget.startsWith('done/') ? linkTarget : `done/${path.basename(linkTarget)}`);
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
  let stateMdLastSessionResolves = false;

  if (content) {
    // Parse "Last updated:" line.
    const updatedMatch = content.match(/\*\*Last updated:\*\*\s*(\d{4}-\d{2}-\d{2})/i) ||
      content.match(/Last updated:\s*(\d{4}-\d{2}-\d{2})/i);
    if (updatedMatch) {
      stateMdLastUpdated = updatedMatch[1];
    }

    // Parse "Last session:" link and check the target file exists.
    const sessionLinkMatch = content.match(/\*\*Last session:\*\*.*?\[.*?\]\((.*?)\)/i) ||
      content.match(/Last session:.*?\[.*?\]\((.*?)\)/i);
    if (sessionLinkMatch) {
      const linkTarget = sessionLinkMatch[1];
      // Link targets are relative to docs/build/ (the buildRoot).
      const targetPath = path.join(buildRoot, linkTarget);
      const targetMtime = await fileMtime(targetPath);
      stateMdLastSessionResolves = targetMtime !== null;
    }
  }

  return { stateMdTouched, stateMdLastUpdated, stateMdLastSessionResolves };
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
    update_active_wu_notes:  'Step 1 — WU notes updated',
    capture_decisions:       'Step 2 — decisions captured',
    capture_open_questions:  'Step 3 — open questions captured',
    capture_risks:           'Step 4 — risks captured',
    update_work_units_index: 'Step 5 — work-units index updated',
    update_state_md:         'Step 6 — STATE.md updated',
    write_session_log:       'Step 7 — session log written',
    confirm_no_loss:         'Step 8 — confirm-no-loss gate',
    report:                  'Step 9 — report',
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
