/**
 * Phase H part 3 — interactive create commands.
 *
 * Four commands: `wu create`, `decision create`, `question create`,
 * `persona create`. Each walks the operator through the relevant
 * register's protocol body (per `scripts/protocols/wu-new.md` etc.)
 * and drives the workflow lifecycle to commit.
 *
 * Capture-builders are split out as pure functions so tests can verify
 * the typed-payload shape without exercising readline. The interactive
 * shell (`cmdWu*Create`) prompts, calls the builder, and drives the
 * runtime.
 */

import type { NuFlowRuntime, ActorRef, CaptureInput } from '@nusoft/nuflow';
import type {
  WorkUnitCreateMetadata,
  DecisionCreateMetadata,
  OpenQuestionCreateMetadata,
  PersonaCreateMetadata,
} from '@nusoft/nuflow-pack-nuos-build-catalogue';

import type { WorkflowStore } from '../migrate/store.js';
import type { MigratedRecord, Register } from '../migrate/types.js';
import { type Prompt, askUntilValid, validate } from './prompt.js';

const BUILD_MAINTAINER: ActorRef = {
  kind: 'staff',
  id: 'build-maintainer',
  role: 'build-maintainer',
};

export interface CreateHandlerResult {
  output: string;
  exitCode: number;
}

// ---------------------------------------------------------------------------
// Existing-numbers helper — pulls register's prior numbers from the store
// ---------------------------------------------------------------------------

export function existingNumbersForRegister(
  store: WorkflowStore,
  register: Register
): readonly number[] {
  return store
    .list()
    .filter((r) => r.register === register)
    .map((r) => r.number);
}

// ---------------------------------------------------------------------------
// decision create
// ---------------------------------------------------------------------------

export async function cmdDecisionCreate(
  store: WorkflowStore,
  runtime: NuFlowRuntime,
  prompt: Prompt
): Promise<CreateHandlerResult> {
  prompt.print('Creating a new decision (D-NNN).');
  prompt.print('');

  const title = await askUntilValid(
    prompt,
    'Title (one short sentence — what was decided): ',
    (v) => validate.nonEmpty(v, 'title')
  );

  const context = await askUntilValid(
    prompt,
    'Context — why this decision was needed (multi-line):',
    (v) => validate.nonEmpty(v, 'context'),
    { multiline: true }
  );

  const decision = await askUntilValid(
    prompt,
    'Decision — what was decided, in one or two sentences (multi-line):',
    (v) => validate.nonEmpty(v, 'decision'),
    { multiline: true }
  );

  const consequences = await askUntilValid(
    prompt,
    'Consequences — what this commits us to and forecloses (multi-line):',
    (v) => validate.nonEmpty(v, 'consequences'),
    { multiline: true }
  );

  const captureAlternatives = await prompt.confirm(
    'Capture alternatives considered?',
    true
  );
  const alternativesConsidered = captureAlternatives
    ? await prompt.askMultiline('Alternatives considered (multi-line):')
    : undefined;

  const metadata: DecisionCreateMetadata = {
    existingDecisionNumbers: existingNumbersForRegister(store, 'decision'),
    context,
    decision,
    consequences,
    alternativesConsidered,
  };

  return await driveCreateLifecycle(runtime, 'decision.create', {
    channel: 'typed_note',
    content: title,
    subjects: [{ kind: 'decision', id: 'd-pending' }],
    metadata: metadata as unknown as Record<string, unknown>,
  });
}

// ---------------------------------------------------------------------------
// question create
// ---------------------------------------------------------------------------

export async function cmdQuestionCreate(
  store: WorkflowStore,
  runtime: NuFlowRuntime,
  prompt: Prompt
): Promise<CreateHandlerResult> {
  prompt.print('Creating a new open question (Q-NNN).');
  prompt.print('');

  const title = await askUntilValid(
    prompt,
    'The question — one sentence ending in "?": ',
    (v) => validate.nonEmpty(v, 'title')
  );

  const whyItMatters = await askUntilValid(
    prompt,
    'Why it matters — what is blocked, what choice depends on it (multi-line):',
    (v) => validate.nonEmpty(v, 'whyItMatters'),
    { multiline: true }
  );

  const captureOptions = await prompt.confirm('Sketch options under consideration?', true);
  const options = captureOptions
    ? await prompt.askMultiline('Options (multi-line):')
    : undefined;

  const captureEvidence = await prompt.confirm('Note what evidence would resolve this?', true);
  const evidenceNeeded = captureEvidence
    ? await prompt.askMultiline('Evidence needed (multi-line):')
    : undefined;

  const blocksCsv = (
    await prompt.ask('WUs this blocks (comma-separated WU handles, or empty): ')
  ).trim();
  const blocks = blocksCsv ? blocksCsv.split(',').map((s) => s.trim()).filter(Boolean) : [];

  const metadata: OpenQuestionCreateMetadata = {
    existingQuestionNumbers: existingNumbersForRegister(store, 'open_question'),
    whyItMatters,
    options: options || undefined,
    evidenceNeeded: evidenceNeeded || undefined,
    blocks,
  };

  return await driveCreateLifecycle(runtime, 'open_question.create', {
    channel: 'typed_note',
    content: title,
    subjects: [{ kind: 'open_question', id: 'q-pending' }],
    metadata: metadata as unknown as Record<string, unknown>,
  });
}

// ---------------------------------------------------------------------------
// persona create
// ---------------------------------------------------------------------------

export async function cmdPersonaCreate(
  store: WorkflowStore,
  runtime: NuFlowRuntime,
  prompt: Prompt
): Promise<CreateHandlerResult> {
  prompt.print('Creating a new persona (P-NNN). Per D046, walk the seven dimensions + acid-test.');
  prompt.print('A persona is a design constraint, not a demographic snapshot. If a dimension');
  prompt.print('does not change a future design decision, rewrite it until it does.');
  prompt.print('');

  const title = await askUntilValid(
    prompt,
    'Persona name (e.g. "The DSL on call for 18 months"): ',
    (v) => validate.nonEmpty(v, 'title')
  );

  prompt.print('');
  prompt.print('Each of the next seven dimensions is multi-line input.');
  prompt.print('');

  const identity = await askDimension(prompt, '1. Identity — who they are in the context of THIS system');
  const reality = await askDimension(prompt, '2. Reality — physical environment when they use the outcome');
  const psychology = await askDimension(prompt, '3. Psychology — technical confidence, stress level, tolerance for confusion');
  const trigger = await askDimension(prompt, '4. Trigger — what brings them to this outcome (a real-world event)');
  const history = await askDimension(prompt, '5. History — what they have done before arriving here');
  const success = await askDimension(prompt, '6. Success — what "done" looks like from THEIR perspective');
  const constraints = await askDimension(prompt, '7. Constraints — what they cannot or will not do');

  const acidTest = await askUntilValid(
    prompt,
    'Acid-test refinement — the hardest legitimate combination of constraints (multi-line):',
    (v) => validate.nonEmpty(v, 'acidTest'),
    { multiline: true }
  );

  const metadata: PersonaCreateMetadata = {
    existingPersonaNumbers: existingNumbersForRegister(store, 'persona'),
    identity,
    reality,
    psychology,
    trigger,
    history,
    success,
    constraints,
    acidTest,
  };

  return await driveCreateLifecycle(runtime, 'persona.create', {
    channel: 'typed_note',
    content: title,
    subjects: [{ kind: 'persona', id: 'p-pending' }],
    metadata: metadata as unknown as Record<string, unknown>,
  });
}

async function askDimension(prompt: Prompt, label: string): Promise<string> {
  return askUntilValid(
    prompt,
    `${label} (multi-line):`,
    (v) => validate.nonEmpty(v, 'dimension'),
    { multiline: true }
  );
}

// ---------------------------------------------------------------------------
// wu create
// ---------------------------------------------------------------------------

export async function cmdWuCreate(
  store: WorkflowStore,
  runtime: NuFlowRuntime,
  prompt: Prompt
): Promise<CreateHandlerResult> {
  prompt.print('Creating a new work unit (WU-NNN).');
  prompt.print(
    'Per D046, a WU carries the six-field outcome shape (persona / trigger / walkthrough'
  );
  prompt.print(
    '/ acceptance criteria / contracts produced / contracts consumed). Infrastructure WUs'
  );
  prompt.print(
    '(build, publish, hardening, refactor) skip persona/trigger/walkthrough.'
  );
  prompt.print('');

  const title = await askUntilValid(
    prompt,
    'Title (one short sentence — what does this WU deliver?): ',
    (v) => validate.nonEmpty(v, 'title')
  );

  const kind = (await prompt.askChoice('Kind?', [
    'feature',
    'infrastructure',
    'spike',
    'remediation',
  ])) as 'feature' | 'infrastructure' | 'spike' | 'remediation';

  const phaseAnswer = (await prompt.ask('Phase tag (e.g. "0 — NuOS Foundation"; empty for none): ')).trim();
  const phase = phaseAnswer || undefined;

  const dependsCsv = (
    await prompt.ask('Depends on (comma-separated handles or empty): ')
  ).trim();
  const dependsOn = dependsCsv ? dependsCsv.split(',').map((s) => s.trim()).filter(Boolean) : [];

  const blocksCsv = (
    await prompt.ask('Blocks (comma-separated handles or empty): ')
  ).trim();
  const blocks = blocksCsv ? blocksCsv.split(',').map((s) => s.trim()).filter(Boolean) : [];

  const isInfrastructure = kind === 'infrastructure';
  let personaRef: string | 'N/A — infrastructure WU' | undefined;
  let trigger: string | 'N/A — infrastructure WU' | undefined;
  let walkthrough: string | 'N/A — infrastructure WU' | undefined;

  if (isInfrastructure) {
    personaRef = 'N/A — infrastructure WU';
    trigger = 'N/A — infrastructure WU';
    walkthrough = 'N/A — infrastructure WU';
    prompt.print('(persona/trigger/walkthrough auto-marked N/A for infrastructure WU)');
  } else {
    personaRef = (
      await prompt.ask('Persona ref (P-NNN handle, or leave empty to skip): ')
    ).trim() || undefined;
    trigger = await askUntilValid(
      prompt,
      'Trigger — the real-world event that makes this outcome necessary (multi-line):',
      (v) => validate.nonEmpty(v, 'trigger'),
      { multiline: true }
    );
    walkthrough = await askUntilValid(
      prompt,
      'Walkthrough — numbered steps from the persona\'s perspective; surface failure paths inline (multi-line):',
      (v) => validate.nonEmpty(v, 'walkthrough'),
      { multiline: true }
    );
  }

  prompt.print('');
  prompt.print('Acceptance criteria (5–10; each evaluable by inspection alone — auditor\'s test).');
  prompt.print('Enter one per line; blank line ends.');
  const acceptanceCriteria: string[] = [];
  while (true) {
    const ac = (await prompt.ask(`AC ${acceptanceCriteria.length + 1} (blank to finish): `)).trim();
    if (!ac) break;
    acceptanceCriteria.push(ac);
  }

  prompt.print('');
  prompt.print('Contracts produced — what this WU makes available to other WUs once it lands.');
  prompt.print('One per line; blank line ends.');
  const contractsProduced: string[] = [];
  while (true) {
    const c = (await prompt.ask(`Produced ${contractsProduced.length + 1}: `)).trim();
    if (!c) break;
    contractsProduced.push(c);
  }

  prompt.print('');
  prompt.print('Contracts consumed — what must already exist before this WU can run.');
  prompt.print('One per line; blank line ends.');
  const contractsConsumed: string[] = [];
  while (true) {
    const c = (await prompt.ask(`Consumed ${contractsConsumed.length + 1}: `)).trim();
    if (!c) break;
    contractsConsumed.push(c);
  }

  const wantApproach = await prompt.confirm('Capture an Approach paragraph?', false);
  const approach = wantApproach
    ? await prompt.askMultiline('Approach (multi-line):')
    : undefined;

  const metadata: WorkUnitCreateMetadata = {
    kind,
    phase,
    existingWUNumbers: existingNumbersForRegister(store, 'work_unit'),
    dependsOn,
    blocks,
    personaRef,
    trigger,
    walkthrough,
    acceptanceCriteria,
    contractsProduced,
    contractsConsumed,
    approach,
  };

  return await driveCreateLifecycle(runtime, 'work_unit.create', {
    channel: 'typed_note',
    content: title,
    subjects: [{ kind: 'work_unit', id: 'wu-pending' }],
    metadata: metadata as unknown as Record<string, unknown>,
  });
}

// ---------------------------------------------------------------------------
// Lifecycle driver
// ---------------------------------------------------------------------------

async function driveCreateLifecycle(
  runtime: NuFlowRuntime,
  workflowType: string,
  capture: CaptureInput
): Promise<CreateHandlerResult> {
  let workflow;
  try {
    workflow = await runtime.startWorkflow(workflowType, BUILD_MAINTAINER, capture);
  } catch (err) {
    return {
      output: `${workflowType} rejected at start: ${(err as Error).message}`,
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

  const handle = (workflow.writeIntent?.payload as { handle?: string })?.handle ?? 'unknown';
  return {
    output: `${workflowType} ✅ created ${handle}  (commit ${workflow.commitRef?.commitRef ?? '?'})`,
    exitCode: 0,
  };
}

// ---------------------------------------------------------------------------
// Pure capture-builders for tests (mirror the prompts above without I/O)
// ---------------------------------------------------------------------------

export interface DecisionCreateInputs {
  title: string;
  context: string;
  decision: string;
  consequences: string;
  alternativesConsidered?: string;
}

export function buildDecisionCreateCapture(
  store: WorkflowStore,
  inputs: DecisionCreateInputs
): CaptureInput {
  return {
    channel: 'typed_note',
    content: inputs.title,
    subjects: [{ kind: 'decision', id: 'd-pending' }],
    metadata: {
      existingDecisionNumbers: existingNumbersForRegister(store, 'decision'),
      context: inputs.context,
      decision: inputs.decision,
      consequences: inputs.consequences,
      alternativesConsidered: inputs.alternativesConsidered,
    } satisfies DecisionCreateMetadata as unknown as Record<string, unknown>,
  };
}

export interface QuestionCreateInputs {
  title: string;
  whyItMatters: string;
  options?: string;
  evidenceNeeded?: string;
  blocks?: readonly string[];
}

export function buildQuestionCreateCapture(
  store: WorkflowStore,
  inputs: QuestionCreateInputs
): CaptureInput {
  return {
    channel: 'typed_note',
    content: inputs.title,
    subjects: [{ kind: 'open_question', id: 'q-pending' }],
    metadata: {
      existingQuestionNumbers: existingNumbersForRegister(store, 'open_question'),
      whyItMatters: inputs.whyItMatters,
      options: inputs.options,
      evidenceNeeded: inputs.evidenceNeeded,
      blocks: inputs.blocks,
    } satisfies OpenQuestionCreateMetadata as unknown as Record<string, unknown>,
  };
}

export interface PersonaCreateInputs {
  title: string;
  identity: string;
  reality: string;
  psychology: string;
  trigger: string;
  history: string;
  success: string;
  constraints: string;
  acidTest: string;
}

export function buildPersonaCreateCapture(
  store: WorkflowStore,
  inputs: PersonaCreateInputs
): CaptureInput {
  return {
    channel: 'typed_note',
    content: inputs.title,
    subjects: [{ kind: 'persona', id: 'p-pending' }],
    metadata: {
      existingPersonaNumbers: existingNumbersForRegister(store, 'persona'),
      identity: inputs.identity,
      reality: inputs.reality,
      psychology: inputs.psychology,
      trigger: inputs.trigger,
      history: inputs.history,
      success: inputs.success,
      constraints: inputs.constraints,
      acidTest: inputs.acidTest,
    } satisfies PersonaCreateMetadata as unknown as Record<string, unknown>,
  };
}

export interface WuCreateInputs {
  title: string;
  kind: 'feature' | 'infrastructure' | 'spike' | 'remediation';
  phase?: string;
  dependsOn?: readonly string[];
  blocks?: readonly string[];
  personaRef?: string;
  trigger?: string;
  walkthrough?: string;
  acceptanceCriteria?: readonly string[];
  contractsProduced: readonly string[];
  contractsConsumed: readonly string[];
  approach?: string;
}

export function buildWuCreateCapture(
  store: WorkflowStore,
  inputs: WuCreateInputs
): CaptureInput {
  const isInfra = inputs.kind === 'infrastructure';
  const personaRef: string | undefined = isInfra
    ? 'N/A — infrastructure WU'
    : inputs.personaRef;
  const trigger: string | undefined = isInfra
    ? 'N/A — infrastructure WU'
    : inputs.trigger;
  const walkthrough: string | undefined = isInfra
    ? 'N/A — infrastructure WU'
    : inputs.walkthrough;
  return {
    channel: 'typed_note',
    content: inputs.title,
    subjects: [{ kind: 'work_unit', id: 'wu-pending' }],
    metadata: {
      kind: inputs.kind,
      phase: inputs.phase,
      existingWUNumbers: existingNumbersForRegister(store, 'work_unit'),
      dependsOn: inputs.dependsOn,
      blocks: inputs.blocks,
      personaRef,
      trigger,
      walkthrough,
      acceptanceCriteria: inputs.acceptanceCriteria,
      contractsProduced: inputs.contractsProduced,
      contractsConsumed: inputs.contractsConsumed,
      approach: inputs.approach,
    } satisfies WorkUnitCreateMetadata as unknown as Record<string, unknown>,
  };
}

// MigratedRecord re-export so write-side tests can construct fixtures.
export type { MigratedRecord };
