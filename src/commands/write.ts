/**
 * Phase H part 2 — flag-driven write commands.
 *
 * Each handler:
 *   1. Validates the flags
 *   2. Looks up the target record from the store
 *   3. Builds a typed `CaptureInput` for the relevant workflow
 *   4. Drives the NuFlow lifecycle through the runtime
 *   5. Reports the result
 *
 * No interactive prompts; flag-driven only. Interactive `create`
 * commands are deferred (Phase H part 3).
 */

import type { NuFlowRuntime, ActorRef, CaptureInput } from '@nusoft/nuflow';
import type { WorkflowStore } from '../migrate/store.js';
import type { MigratedRecord } from '../migrate/types.js';
import { normaliseHandle } from './handlers.js';
import { extractForCompletion } from '../runtime/ac-parse.js';

const BUILD_MAINTAINER: ActorRef = {
  kind: 'staff',
  id: 'build-maintainer',
  role: 'build-maintainer',
};

export interface WriteHandlerResult {
  output: string;
  exitCode: number;
}

// ---------------------------------------------------------------------------
// wu advance <handle> --to=<status> [--reason="..."]
// ---------------------------------------------------------------------------

export async function cmdWuAdvance(
  store: WorkflowStore,
  runtime: NuFlowRuntime,
  args: { handle?: string; to?: string; reason?: string }
): Promise<WriteHandlerResult> {
  if (!args.handle) {
    return { output: 'Usage: nuos-catalogue wu advance <handle> --to=<status> [--reason="..."]', exitCode: 2 };
  }
  if (!args.to) {
    return { output: '--to=<status> is required (e.g. --to=in_progress)', exitCode: 2 };
  }
  const handle = normaliseHandle('work_unit', args.handle);
  const record = store.get(handle);
  if (!record || record.register !== 'work_unit') {
    return { output: `no work_unit record for handle "${handle}"`, exitCode: 1 };
  }

  const fromStatus = inferWorkflowStatus(record);

  // For → completed, the pack's completion gate requires the AC list.
  // Extract it from the markdown so the gate can verify every AC is
  // ticked-with-evidence. For other transitions the AC list is informational.
  const acceptanceCriteria =
    args.to === 'completed' ? extractForCompletion(record.rawMarkdown) : undefined;

  const capture: CaptureInput = {
    channel: 'typed_note',
    content: `advance ${handle} → ${args.to}${args.reason ? `: ${args.reason}` : ''}`,
    subjects: [{ kind: 'work_unit', id: handle }],
    metadata: {
      targetHandle: handle,
      fromStatus,
      toStatus: args.to,
      reason: args.reason,
      acceptanceCriteria,
    },
  };

  return await driveLifecycle(runtime, 'work_unit.advance_status', capture, handle, args.to);
}

function inferWorkflowStatus(record: MigratedRecord): string {
  // Strip emoji + leading/trailing whitespace from the stored status text.
  const raw = (record.status ?? '').trim();
  // Pull the first ASCII word that matches a known status enum.
  const KNOWN = [
    'proposed',
    'ready',
    'in_progress',
    'in_review',
    'completed',
    'superseded',
    'cancelled',
    'deferred-with-trigger',
    'blocked-on-question',
    'in_flight',
    'in flight',
    'blocked',
  ];
  const lower = raw.toLowerCase();
  for (const candidate of KNOWN) {
    if (lower.includes(candidate)) {
      // Normalise variants we accept on input but don't have in the
      // pack's state machine.
      if (candidate === 'in_flight' || candidate === 'in flight') return 'in_progress';
      if (candidate === 'blocked') return 'blocked-on-question';
      return candidate;
    }
  }
  return 'proposed';
}

// ---------------------------------------------------------------------------
// wu tick <handle> --index=N --evidence="..."
// ---------------------------------------------------------------------------

export async function cmdWuTick(
  store: WorkflowStore,
  runtime: NuFlowRuntime,
  args: { handle?: string; index?: number; evidence?: string }
): Promise<WriteHandlerResult> {
  if (!args.handle) {
    return {
      output: 'Usage: nuos-catalogue wu tick <handle> --index=N --evidence="..."',
      exitCode: 2,
    };
  }
  if (typeof args.index !== 'number' || !Number.isInteger(args.index) || args.index < 0) {
    return { output: '--index=<non-negative integer> is required', exitCode: 2 };
  }
  if (!args.evidence || args.evidence.trim().length === 0) {
    return { output: '--evidence="..." is required (non-empty)', exitCode: 2 };
  }

  const handle = normaliseHandle('work_unit', args.handle);
  if (!store.has(handle)) {
    return { output: `no work_unit record for handle "${handle}"`, exitCode: 1 };
  }

  const capture: CaptureInput = {
    channel: 'typed_note',
    content: `tick AC #${args.index} on ${handle}`,
    subjects: [{ kind: 'work_unit', id: handle }],
    metadata: {
      targetHandle: handle,
      criterionIndex: args.index,
      evidence: args.evidence,
    },
  };

  return await driveLifecycle(
    runtime,
    'work_unit.tick_acceptance_criterion',
    capture,
    handle,
    `index ${args.index}`
  );
}

// ---------------------------------------------------------------------------
// decision supersede <target> --by=<superseding> [--reason="..."]
// ---------------------------------------------------------------------------

export async function cmdDecisionSupersede(
  store: WorkflowStore,
  runtime: NuFlowRuntime,
  args: { target?: string; by?: string; reason?: string }
): Promise<WriteHandlerResult> {
  if (!args.target) {
    return {
      output: 'Usage: nuos-catalogue decision supersede <target> --by=<superseding> [--reason="..."]',
      exitCode: 2,
    };
  }
  if (!args.by) {
    return { output: '--by=<superseding D-handle> is required', exitCode: 2 };
  }

  const target = normaliseHandle('decision', args.target);
  const superseding = normaliseHandle('decision', args.by);

  const targetRecord = store.get(target);
  const supersedingRecord = store.get(superseding);
  if (!targetRecord || targetRecord.register !== 'decision') {
    return { output: `no decision record for target "${target}"`, exitCode: 1 };
  }
  if (!supersedingRecord || supersedingRecord.register !== 'decision') {
    return { output: `no decision record for superseding "${superseding}"`, exitCode: 1 };
  }

  const capture: CaptureInput = {
    channel: 'typed_note',
    content: `supersede ${target} by ${superseding}`,
    subjects: [
      { kind: 'decision', id: target },
      { kind: 'decision', id: superseding },
    ],
    metadata: {
      targetHandle: target,
      supersedingHandle: superseding,
      // Workflow validates this matches; we infer from the stored status.
      // For decisions we assume the target is currently 'accepted' unless
      // the markdown says otherwise; the workflow rejects invalid input.
      targetCurrentStatus: 'accepted',
      reason: args.reason,
    },
  };

  return await driveLifecycle(runtime, 'decision.supersede', capture, target, superseding);
}

// ---------------------------------------------------------------------------
// question resolve <q-handle> --by=<d-handle> [--reason="..."]
// ---------------------------------------------------------------------------

export async function cmdQuestionResolve(
  store: WorkflowStore,
  runtime: NuFlowRuntime,
  args: { qHandle?: string; by?: string; reason?: string }
): Promise<WriteHandlerResult> {
  if (!args.qHandle) {
    return {
      output: 'Usage: nuos-catalogue question resolve <q-handle> --by=<d-handle> [--reason="..."]',
      exitCode: 2,
    };
  }
  if (!args.by) {
    return { output: '--by=<resolving D-handle> is required', exitCode: 2 };
  }

  const qHandle = normaliseHandle('open_question', args.qHandle);
  const dHandle = normaliseHandle('decision', args.by);

  const qRecord = store.get(qHandle);
  const dRecord = store.get(dHandle);
  if (!qRecord || qRecord.register !== 'open_question') {
    return { output: `no open_question record for handle "${qHandle}"`, exitCode: 1 };
  }
  if (!dRecord || dRecord.register !== 'decision') {
    return { output: `no decision record for resolving handle "${dHandle}"`, exitCode: 1 };
  }

  const capture: CaptureInput = {
    channel: 'typed_note',
    content: `resolve ${qHandle} by ${dHandle}`,
    subjects: [
      { kind: 'open_question', id: qHandle },
      { kind: 'decision', id: dHandle },
    ],
    metadata: {
      targetHandle: qHandle,
      targetCurrentStatus: 'active',
      resolvingDecisionHandle: dHandle,
      reason: args.reason,
    },
  };

  return await driveLifecycle(runtime, 'open_question.resolve', capture, qHandle, dHandle);
}

// ---------------------------------------------------------------------------
// Lifecycle driver — single path that handles all four workflows
// ---------------------------------------------------------------------------

async function driveLifecycle(
  runtime: NuFlowRuntime,
  workflowType: string,
  capture: CaptureInput,
  primarySubject: string,
  detail: string
): Promise<WriteHandlerResult> {
  let workflow;
  try {
    workflow = await runtime.startWorkflow(workflowType, BUILD_MAINTAINER, capture);
  } catch (err) {
    return {
      output: `${workflowType} rejected at start: ${(err as Error).message}`,
      exitCode: 1,
    };
  }

  if (workflow.status === 'waiting_for_clarification') {
    return {
      output: `${workflowType} produced a clarification request: ${workflow.clarification?.reason ?? 'unspecified'}`,
      exitCode: 1,
    };
  }

  if (workflow.status !== 'waiting_for_confirmation') {
    return {
      output: `${workflowType} unexpected post-start status: ${workflow.status}`,
      exitCode: 1,
    };
  }

  workflow = await runtime.confirmIntent(workflow.id, BUILD_MAINTAINER.id);

  if (workflow.status === 'waiting_for_approval') {
    workflow = await runtime.approveIntent(workflow.id, BUILD_MAINTAINER.id);
  }

  if (workflow.status !== 'committing') {
    return {
      output: `${workflowType} unexpected pre-commit status: ${workflow.status}`,
      exitCode: 1,
    };
  }

  workflow = await runtime.commitIntent(workflow.id, BUILD_MAINTAINER.id);

  if (workflow.status !== 'completed') {
    return {
      output: `${workflowType} commit failed: status=${workflow.status}`,
      exitCode: 1,
    };
  }

  return {
    output: `${workflowType} ✅ ${primarySubject} → ${detail}  (commit ${workflow.commitRef?.commitRef ?? '?'})`,
    exitCode: 0,
  };
}
