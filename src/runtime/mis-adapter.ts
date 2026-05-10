/**
 * `BuildCatalogueMisAdapter` — implements `@nusoft/nuflow`'s
 * `MisWriteAdapter` for the build catalogue's write commands.
 *
 * Translates a typed `WriteIntent` from the build-catalogue pack into
 * markdown edits + JSON workflow-store updates. The store and the
 * markdown file stay in sync by always writing both at commit time.
 *
 * **Per-intent behaviour:**
 *
 * - `work_unit.advance_status`: replace the WU's status line in
 *   markdown; append a Build catalogue history entry naming the
 *   transition + reason; update the store record's `rawMarkdown`.
 *
 * - `work_unit.tick_acceptance_criterion`: append a Build catalogue
 *   history entry naming the criterion index + evidence (no AC-list
 *   parsing in v0.4; the maintainer hand-edits the AC list if they
 *   want, the workflow record is canonical).
 *
 * - `decision.supersede`: edit BOTH the target's status line (`accepted
 *   → superseded by D-NNN`) AND append a history entry to the
 *   superseding decision noting what it supersedes.
 *
 * - `open_question.resolve`: edit the question's status line
 *   (`active → resolved by D-NNN`) and append a history entry to the
 *   resolving decision.
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  MisWriteAdapter,
  MisCommitDecision,
  WriteIntent,
  CommitRef,
} from '@nusoft/nuflow';
import type { WorkflowStore } from '../migrate/store.js';
import type { MigratedRecord } from '../migrate/types.js';
import {
  replaceStatusLine,
  insertStatusLine,
  appendChangeLog,
} from './markdown-edit.js';

export interface BuildCatalogueMisAdapterConfig {
  store: WorkflowStore;
  /** Absolute path to `nuos/docs/build/`. */
  catalogueRoot: string;
}

export function createBuildCatalogueMisAdapter(
  config: BuildCatalogueMisAdapterConfig
): MisWriteAdapter {
  const { store, catalogueRoot } = config;

  const adapter: MisWriteAdapter = {
    canCommit(intent: WriteIntent): MisCommitDecision {
      // Verify all subjects resolve to records the store knows about.
      // The build-catalogue pack ensures handles are well-formed; the
      // adapter ensures they exist.
      for (const subject of intent.subjects) {
        if (!store.has(subject.id)) {
          return {
            allowed: false,
            reason: `BuildCatalogueMisAdapter: no record for subject ${subject.kind}:${subject.id}`,
          };
        }
      }
      return { allowed: true };
    },

    async commit(intent: WriteIntent): Promise<CommitRef> {
      switch (intent.type) {
        case 'work_unit.advance_status':
          await commitAdvanceStatus(store, catalogueRoot, intent);
          break;
        case 'work_unit.tick_acceptance_criterion':
          await commitTickAC(store, catalogueRoot, intent);
          break;
        case 'decision.supersede':
          await commitSupersede(store, catalogueRoot, intent);
          break;
        case 'open_question.resolve':
          await commitResolveQuestion(store, catalogueRoot, intent);
          break;
        default:
          throw new Error(
            `BuildCatalogueMisAdapter: intent type ${intent.type} is not handled by Phase H part 2 (write commands shipped: advance_status, tick_acceptance_criterion, decision.supersede, open_question.resolve)`
          );
      }

      // Persist the workflow store after the operation so the next
      // CLI invocation sees the change.
      await store.flush();

      return {
        commitRef: `cmt_${intent.intentId}`,
        recordType: intent.type,
        recordId: intent.subjects[0]?.id ?? 'unknown',
        committedAt: new Date().toISOString(),
      };
    },
  };

  return adapter;
}

// ---------------------------------------------------------------------------
// Per-intent commit handlers
// ---------------------------------------------------------------------------

async function commitAdvanceStatus(
  store: WorkflowStore,
  catalogueRoot: string,
  intent: WriteIntent
): Promise<void> {
  const payload = intent.payload as {
    targetHandle: string;
    fromStatus: string;
    toStatus: string;
    reason?: string;
  };

  const record = store.get(payload.targetHandle);
  if (!record) {
    throw new Error(`commitAdvanceStatus: no record for ${payload.targetHandle}`);
  }

  // Map workflow status names to user-facing markdown status text.
  const statusEmoji = mapStatusToEmojiText(payload.toStatus);
  const replaced = replaceStatusLine(record.rawMarkdown, statusEmoji);
  let updatedMarkdown = replaced.replaced
    ? replaced.updated
    : insertStatusLine(record.rawMarkdown, statusEmoji);

  updatedMarkdown = appendChangeLog(updatedMarkdown, {
    isoTimestamp: new Date().toISOString(),
    summary: `Status advanced ${payload.fromStatus} → ${payload.toStatus}.`,
    details: payload.reason,
    reference: `intent ${intent.intentId}`,
  });

  // Also update the structured `status` field on the record so the next
  // workflow invocation reads the current state, not the stale migrated value.
  await persist(store, catalogueRoot, record, updatedMarkdown, { status: statusEmoji });
}

async function commitTickAC(
  store: WorkflowStore,
  catalogueRoot: string,
  intent: WriteIntent
): Promise<void> {
  const payload = intent.payload as {
    targetHandle: string;
    criterionIndex: number;
    evidence: string;
    criterionText?: string;
  };

  const record = store.get(payload.targetHandle);
  if (!record) {
    throw new Error(`commitTickAC: no record for ${payload.targetHandle}`);
  }

  const summary = payload.criterionText
    ? `Acceptance criterion ${payload.criterionIndex + 1} ticked: "${payload.criterionText}".`
    : `Acceptance criterion at index ${payload.criterionIndex} ticked.`;

  const updatedMarkdown = appendChangeLog(record.rawMarkdown, {
    isoTimestamp: new Date().toISOString(),
    summary,
    details: `Evidence: ${payload.evidence}`,
    reference: `intent ${intent.intentId}`,
  });

  await persist(store, catalogueRoot, record, updatedMarkdown);
}

async function commitSupersede(
  store: WorkflowStore,
  catalogueRoot: string,
  intent: WriteIntent
): Promise<void> {
  const payload = intent.payload as {
    targetHandle: string;
    supersedingHandle: string;
    reason?: string;
  };

  const target = store.get(payload.targetHandle);
  const superseding = store.get(payload.supersedingHandle);
  if (!target) throw new Error(`commitSupersede: no record for target ${payload.targetHandle}`);
  if (!superseding) {
    throw new Error(`commitSupersede: no record for superseding ${payload.supersedingHandle}`);
  }

  // Target: status accepted → superseded by D-NNN
  const targetStatus = `superseded by ${payload.supersedingHandle}`;
  const targetReplaced = replaceStatusLine(target.rawMarkdown, targetStatus);
  let targetMarkdown = targetReplaced.replaced
    ? targetReplaced.updated
    : insertStatusLine(target.rawMarkdown, targetStatus);

  targetMarkdown = appendChangeLog(targetMarkdown, {
    isoTimestamp: new Date().toISOString(),
    summary: `Superseded by ${payload.supersedingHandle}.`,
    details: payload.reason,
    reference: `intent ${intent.intentId}`,
  });
  await persist(store, catalogueRoot, target, targetMarkdown, { status: targetStatus });

  // Superseding: append a Build catalogue history entry naming what it supersedes.
  const supersedingMarkdown = appendChangeLog(superseding.rawMarkdown, {
    isoTimestamp: new Date().toISOString(),
    summary: `Supersedes ${payload.targetHandle}.`,
    details: payload.reason,
    reference: `intent ${intent.intentId}`,
  });
  await persist(store, catalogueRoot, superseding, supersedingMarkdown);
}

async function commitResolveQuestion(
  store: WorkflowStore,
  catalogueRoot: string,
  intent: WriteIntent
): Promise<void> {
  const payload = intent.payload as {
    targetHandle: string;
    resolvingDecisionHandle: string;
    reason?: string;
  };

  const question = store.get(payload.targetHandle);
  const decision = store.get(payload.resolvingDecisionHandle);
  if (!question) {
    throw new Error(`commitResolveQuestion: no record for question ${payload.targetHandle}`);
  }
  if (!decision) {
    throw new Error(
      `commitResolveQuestion: no record for resolving decision ${payload.resolvingDecisionHandle}`
    );
  }

  const questionStatus = `resolved by ${payload.resolvingDecisionHandle}`;
  const questionReplaced = replaceStatusLine(question.rawMarkdown, questionStatus);
  let questionMarkdown = questionReplaced.replaced
    ? questionReplaced.updated
    : insertStatusLine(question.rawMarkdown, questionStatus);

  questionMarkdown = appendChangeLog(questionMarkdown, {
    isoTimestamp: new Date().toISOString(),
    summary: `Resolved by ${payload.resolvingDecisionHandle}.`,
    details: payload.reason,
    reference: `intent ${intent.intentId}`,
  });
  await persist(store, catalogueRoot, question, questionMarkdown, { status: questionStatus });

  const decisionMarkdown = appendChangeLog(decision.rawMarkdown, {
    isoTimestamp: new Date().toISOString(),
    summary: `Resolves ${payload.targetHandle}.`,
    details: payload.reason,
    reference: `intent ${intent.intentId}`,
  });
  await persist(store, catalogueRoot, decision, decisionMarkdown);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function persist(
  store: WorkflowStore,
  catalogueRoot: string,
  record: MigratedRecord,
  newRawMarkdown: string,
  fieldUpdates: { status?: string | null } = {}
): Promise<void> {
  const sourceAbsolute = path.join(catalogueRoot, record.sourcePath);
  await writeFile(sourceAbsolute, newRawMarkdown, 'utf8');

  const updatedRecord: MigratedRecord = {
    ...record,
    rawMarkdown: newRawMarkdown,
    fileModifiedAt: new Date().toISOString(),
    // Note: migratedAt is preserved (it's the original migration time);
    // fileModifiedAt is updated to track the latest write.
    ...(fieldUpdates.status !== undefined ? { status: fieldUpdates.status } : {}),
  };
  store.put(updatedRecord);
}

function mapStatusToEmojiText(workflowStatus: string): string {
  // The build-catalogue pack uses internal status enum strings
  // (proposed/ready/in_progress/in_review/completed/superseded/...).
  // The catalogue's markdown convention uses emoji-prefixed forms.
  // Map them here so workflows speak in their typed enum but the
  // markdown reads in the human convention.
  switch (workflowStatus) {
    case 'proposed':
      return '🔵 proposed';
    case 'ready':
      return '🟢 ready';
    case 'in_progress':
      return '🟡 in_progress';
    case 'in_review':
      return '🟣 in_review';
    case 'completed':
      return '✅ completed';
    case 'superseded':
      return '🟣 superseded';
    case 'cancelled':
      return '⚫ cancelled';
    case 'deferred-with-trigger':
      return '🔵 deferred-with-trigger';
    case 'blocked-on-question':
      return '🔴 blocked-on-question';
    default:
      return workflowStatus;
  }
}
