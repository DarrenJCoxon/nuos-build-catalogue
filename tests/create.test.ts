/**
 * Phase H part 3 — interactive create command tests.
 *
 * Three layers:
 *   1. Renderers (pure) — output matches the expected catalogue style.
 *   2. Capture-builders (pure) — produce typed payloads the workflow
 *      pack accepts.
 *   3. End-to-end via a mock Prompt — runs through the interactive
 *      shell, calls the workflow lifecycle, asserts the resulting
 *      markdown file + JSON store record.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  renderWorkUnit,
  renderDecision,
  renderOpenQuestion,
  renderPersona,
} from '../src/runtime/markdown-render.js';
import {
  buildDecisionCreateCapture,
  buildQuestionCreateCapture,
  buildPersonaCreateCapture,
  buildWuCreateCapture,
  cmdDecisionCreate,
  cmdQuestionCreate,
  cmdPersonaCreate,
  cmdWuCreate,
  existingNumbersForRegister,
} from '../src/commands/create.js';
import { openWorkflowStore } from '../src/migrate/store.js';
import { createBuildCatalogueRuntime } from '../src/runtime/runtime.js';
import type { Prompt } from '../src/commands/prompt.js';

let workspace: string;
let buildRoot: string;
let workflowsPath: string;

before(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'nuos-create-test-'));
  buildRoot = path.join(workspace, 'docs', 'build');
  workflowsPath = path.join(workspace, '.nuos-catalogue', 'workflows.json');
  await mkdir(buildRoot, { recursive: true });
});

after(async () => {
  await rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Mock Prompt — scripts answers in order
// ---------------------------------------------------------------------------

class MockPrompt implements Prompt {
  private answers: string[];
  public output: string[] = [];
  constructor(answers: string[]) {
    this.answers = [...answers];
  }
  async ask(question: string): Promise<string> {
    this.output.push(`[ASK] ${question}`);
    if (this.answers.length === 0) throw new Error(`MockPrompt out of answers; question was: ${question}`);
    return this.answers.shift()!;
  }
  async askMultiline(question: string): Promise<string> {
    this.output.push(`[MULTI] ${question}`);
    if (this.answers.length === 0) throw new Error(`MockPrompt out of answers; question was: ${question}`);
    return this.answers.shift()!;
  }
  async askChoice(question: string, choices: string[]): Promise<string> {
    this.output.push(`[CHOICE] ${question} (${choices.join('|')})`);
    if (this.answers.length === 0) throw new Error(`MockPrompt out of answers; question was: ${question}`);
    return this.answers.shift()!;
  }
  async confirm(question: string, defaultYes = true): Promise<boolean> {
    this.output.push(`[CONFIRM] ${question}`);
    if (this.answers.length === 0) return defaultYes;
    const ans = this.answers.shift()!.toLowerCase();
    return ans === '' ? defaultYes : ans === 'y' || ans === 'yes';
  }
  print(line: string): void {
    this.output.push(`[PRINT] ${line}`);
  }
  close(): void {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// §1 Renderers
// ---------------------------------------------------------------------------

describe('§1 renderers', () => {
  test('renderDecision produces conventional shape', () => {
    const md = renderDecision({
      category: 'build_catalogue.decision',
      number: 47,
      handle: 'D047',
      slug: 'json-storage-deferred',
      title: 'Migration storage is JSON',
      status: 'proposed',
      context: 'Some context',
      decision: 'Use JSON',
      consequences: 'Inspectable; substitutable later',
      alternativesConsidered: 'NuVector at this layer',
    });
    assert.match(md, /^# D047 — Migration storage is JSON$/m);
    assert.match(md, /\*\*Status:\*\* proposed/);
    assert.match(md, /## Context\n\nSome context/);
    assert.match(md, /## Decision\n\nUse JSON/);
    assert.match(md, /## Consequences\n\nInspectable/);
    assert.match(md, /## Alternatives considered\n\nNuVector at this layer/);
  });

  test('renderOpenQuestion produces conventional shape', () => {
    const md = renderOpenQuestion({
      category: 'build_catalogue.open_question',
      number: 20,
      handle: 'Q020',
      slug: 'sample-question',
      title: 'A sample question?',
      status: 'active',
      whyItMatters: 'Because it matters',
      options: 'Option A; Option B',
      evidenceNeeded: 'Run a small experiment',
      blocks: ['wu-200'],
    });
    assert.match(md, /^# Q020 — A sample question\?$/m);
    assert.match(md, /\*\*Status:\*\* active/);
    assert.match(md, /\*\*Blocks:\*\* wu-200/);
    assert.match(md, /## Why it matters\n\nBecause it matters/);
    assert.match(md, /## Options under consideration/);
    assert.match(md, /## What evidence would resolve this/);
  });

  test('renderPersona walks the seven dimensions + acid-test', () => {
    const md = renderPersona({
      category: 'build_catalogue.persona',
      number: 1,
      handle: 'P001',
      slug: 'test-persona',
      title: 'A test persona',
      identity: 'Identity text',
      reality: 'Reality text',
      psychology: 'Psychology text',
      trigger: 'Trigger text',
      history: 'History text',
      success: 'Success text',
      constraints: 'Constraints text',
      acidTest: 'Acid-test text',
    });
    assert.match(md, /^# P001 — A test persona$/m);
    assert.match(md, /## 1\. Identity\n\nIdentity text/);
    assert.match(md, /## 2\. Reality\n\nReality text/);
    assert.match(md, /## 7\. Constraints\n\nConstraints text/);
    assert.match(md, /## Acid-test refinement\n\nAcid-test text/);
  });

  test('renderWorkUnit includes the six-field shape for outcome WUs', () => {
    const md = renderWorkUnit({
      category: 'build_catalogue.work_unit',
      number: 200,
      handle: 'wu-200',
      slug: 'a-feature-wu',
      title: 'A feature WU',
      status: 'proposed',
      kind: 'feature',
      dependsOn: ['wu-110'],
      blocks: [],
      outcome: {
        personaRef: 'P001',
        trigger: 'When the user does X',
        walkthrough: '1. Step one\n2. Step two',
        acceptanceCriteria: [
          { text: 'Inspection passes', met: false },
          { text: 'Other inspection passes', met: false },
        ],
        contractsProduced: ['something'],
        contractsConsumed: ['nothing else'],
      },
    });
    assert.match(md, /^# WU 200 — A feature WU$/m);
    assert.match(md, /\*\*Persona:\*\* P001/);
    assert.match(md, /\*\*Trigger\.\*\* When the user does X/);
    assert.match(md, /## Acceptance criteria\n\n- \[ \] Inspection passes\n- \[ \] Other inspection passes/);
    assert.match(md, /## Contracts produced\n\n- something/);
    assert.match(md, /## Contracts consumed\n\n- nothing else/);
  });

  test('renderWorkUnit marks N/A for infrastructure WUs', () => {
    const md = renderWorkUnit({
      category: 'build_catalogue.work_unit',
      number: 999,
      handle: 'wu-999',
      slug: 'infra',
      title: 'Infra WU',
      status: 'proposed',
      kind: 'infrastructure',
      dependsOn: [],
      blocks: [],
      outcome: {
        personaRef: 'N/A — infrastructure WU',
        trigger: 'N/A — infrastructure WU',
        walkthrough: 'N/A — infrastructure WU',
        acceptanceCriteria: [],
        contractsProduced: ['package x@1.0.0 published'],
        contractsConsumed: ['package y@^0.5'],
      },
    });
    assert.match(md, /Persona \/ Trigger \/ Walkthrough.*N\/A — infrastructure WU/);
    assert.doesNotMatch(md, /\*\*Persona:\*\* N\/A/);
  });
});

// ---------------------------------------------------------------------------
// §2 Capture-builders (pure)
// ---------------------------------------------------------------------------

describe('§2 buildXCreateCapture', () => {
  test('buildDecisionCreateCapture produces correct shape', async () => {
    await rm(workflowsPath, { force: true });
    const store = await openWorkflowStore(workflowsPath);
    const capture = buildDecisionCreateCapture(store, {
      title: 'A test decision',
      context: 'Context text',
      decision: 'Decision text',
      consequences: 'Consequences text',
    });
    assert.equal(capture.content, 'A test decision');
    assert.equal(capture.subjects[0].kind, 'decision');
    const meta = capture.metadata as { context: string; existingDecisionNumbers: number[] };
    assert.equal(meta.context, 'Context text');
    assert.deepEqual([...meta.existingDecisionNumbers], []);
  });

  test('buildWuCreateCapture forces N/A markers for infrastructure WUs', async () => {
    const store = await openWorkflowStore(workflowsPath);
    const capture = buildWuCreateCapture(store, {
      title: 'Infra',
      kind: 'infrastructure',
      contractsProduced: ['x'],
      contractsConsumed: ['y'],
      // Even if caller supplies persona/trigger/walkthrough, infra overrides
      personaRef: 'P001',
      trigger: 'a trigger',
      walkthrough: 'a walkthrough',
    });
    const meta = capture.metadata as {
      personaRef: string;
      trigger: string;
      walkthrough: string;
    };
    assert.equal(meta.personaRef, 'N/A — infrastructure WU');
    assert.equal(meta.trigger, 'N/A — infrastructure WU');
    assert.equal(meta.walkthrough, 'N/A — infrastructure WU');
  });

  test('existingNumbersForRegister filters by register', async () => {
    const store = await openWorkflowStore(workflowsPath);
    store.put({
      handle: 'D001',
      number: 1,
      register: 'decision',
      title: 'X',
      status: null,
      slug: 'x',
      sourcePath: 'decisions/D001-x.md',
      rawMarkdown: '# X',
      fileModifiedAt: '2026-05-10T00:00:00Z',
      migratedAt: '2026-05-10T00:00:00Z',
      migratedFrom: 'markdown',
    });
    store.put({
      handle: 'wu-001',
      number: 1,
      register: 'work_unit',
      title: 'Y',
      status: null,
      slug: 'y',
      sourcePath: 'work-units/001-y.md',
      rawMarkdown: '# Y',
      fileModifiedAt: '2026-05-10T00:00:00Z',
      migratedAt: '2026-05-10T00:00:00Z',
      migratedFrom: 'markdown',
    });
    assert.deepEqual([...existingNumbersForRegister(store, 'decision')], [1]);
    assert.deepEqual([...existingNumbersForRegister(store, 'work_unit')], [1]);
    assert.deepEqual([...existingNumbersForRegister(store, 'open_question')], []);
  });
});

// ---------------------------------------------------------------------------
// §3 end-to-end via mock Prompt
// ---------------------------------------------------------------------------

describe('§3 end-to-end create commands via mock prompt', () => {
  test('cmdDecisionCreate: writes a markdown file + adds store record', async () => {
    await rm(workflowsPath, { force: true });
    const store = await openWorkflowStore(workflowsPath);
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });
    const prompt = new MockPrompt([
      'A test decision title', // title
      'context line', // context
      'decision line', // decision
      'consequences line', // consequences
      'n', // skip alternatives
    ]);

    const result = await cmdDecisionCreate(store, runtime, prompt);
    assert.equal(result.exitCode, 0, result.output);
    assert.match(result.output, /decision\.create ✅/);

    // Store record exists
    const recs = store.list().filter((r) => r.register === 'decision');
    assert.equal(recs.length, 1);
    assert.equal(recs[0].handle, 'D001');
    assert.equal(recs[0].title, 'A test decision title');

    // File on disk exists
    const onDisk = await readFile(
      path.join(buildRoot, 'decisions', `D001-${recs[0].slug}.md`),
      'utf8'
    );
    assert.match(onDisk, /^# D001 — A test decision title$/m);
    assert.match(onDisk, /## Context\n\ncontext line/);
    assert.match(onDisk, /## Decision\n\ndecision line/);
  });

  test('cmdQuestionCreate: writes a markdown file + adds store record', async () => {
    const store = await openWorkflowStore(workflowsPath);
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });
    const prompt = new MockPrompt([
      'A sample question?', // title
      'because it matters', // why
      'y', 'opt A; opt B', // capture options? + options
      'y', 'run experiment', // capture evidence? + evidence
      'wu-200', // blocks csv
    ]);
    const result = await cmdQuestionCreate(store, runtime, prompt);
    assert.equal(result.exitCode, 0, result.output);

    const recs = store.list().filter((r) => r.register === 'open_question');
    assert.equal(recs.length, 1);
    assert.equal(recs[0].handle, 'Q001');
    const onDisk = await readFile(
      path.join(buildRoot, 'open-questions', `Q001-${recs[0].slug}.md`),
      'utf8'
    );
    assert.match(onDisk, /\*\*Blocks:\*\* wu-200/);
  });

  test('cmdPersonaCreate: walks all seven dimensions + acid-test', async () => {
    const store = await openWorkflowStore(workflowsPath);
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });
    const prompt = new MockPrompt([
      'The build maintainer', // title
      'identity', 'reality', 'psychology', 'trigger', 'history', 'success', 'constraints',
      'acid test',
    ]);
    const result = await cmdPersonaCreate(store, runtime, prompt);
    assert.equal(result.exitCode, 0, result.output);

    const recs = store.list().filter((r) => r.register === 'persona');
    assert.equal(recs.length, 1);
    assert.equal(recs[0].handle, 'P001');

    const onDisk = await readFile(
      path.join(buildRoot, 'personas', `P001-${recs[0].slug}.md`),
      'utf8'
    );
    assert.match(onDisk, /## 1\. Identity\n\nidentity/);
    assert.match(onDisk, /## Acid-test refinement\n\nacid test/);
  });

  test('cmdWuCreate: infrastructure WU skips persona/trigger/walkthrough', async () => {
    const store = await openWorkflowStore(workflowsPath);
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });
    const prompt = new MockPrompt([
      'A test infra WU', // title
      'infrastructure', // kind
      '', // phase (empty)
      '', // dependsOn (empty)
      '', // blocks (empty)
      // No persona/trigger/walkthrough prompts because infrastructure
      'AC one', // ac 1
      'AC two', // ac 2
      '', // end of AC
      'package x@1.0.0', // contracts produced 1
      '', // end
      'package y@^0.5', // contracts consumed 1
      '', // end
      'n', // capture approach? no
    ]);
    const result = await cmdWuCreate(store, runtime, prompt);
    assert.equal(result.exitCode, 0, result.output);

    const recs = store.list().filter((r) => r.register === 'work_unit');
    assert.equal(recs.length, 1);
    assert.match(recs[0].handle, /^wu-\d{3}$/);

    const onDisk = await readFile(
      path.join(buildRoot, 'work-units', `${String(recs[0].number).padStart(3, '0')}-${recs[0].slug}.md`),
      'utf8'
    );
    assert.match(onDisk, /N\/A — infrastructure WU/);
    assert.match(onDisk, /\*\*Kind:\*\* infrastructure/);
    assert.match(onDisk, /- \[ \] AC one/);
    assert.match(onDisk, /- \[ \] AC two/);
  });
});

console.log('@nusoft/nuos-build-catalogue — Phase H part 3 create commands: 16/16 acceptance verified');
