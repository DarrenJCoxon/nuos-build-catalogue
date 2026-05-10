/**
 * Per-register markdown renderers — Phase H part 3.
 *
 * Each renderer takes a typed workflow payload (from the build-catalogue
 * pack) and produces a markdown body in the catalogue's house style.
 * The renderers match the conventions used in the live catalogue:
 *
 *   - WU files: `# WU NNN — Title` + `**Status:** ...` + sections for
 *     outcome / dependencies / contracts produced/consumed / acceptance
 *     criteria / etc.
 *   - Decision files: `# DNNN — Title` + `**Status:** ...` +
 *     Context / Decision / Rationale / Alternatives / Consequences.
 *   - Open question files: `# QNNN — Title` + `**Status:** ...` +
 *     Why it matters / Options / Evidence needed / Blocks.
 *   - Persona files: `# PNNN — Title` + seven dimensions + acid-test.
 *
 * The renderers are deliberately conservative: they produce markdown
 * that matches the live convention closely so future hand-edits don't
 * collide with the renderer's output. Round-trip with the migration
 * runner: render → write → migrate → store record's rawMarkdown ==
 * what we just rendered.
 */

import type {
  WorkUnitCreatePayload,
  DecisionCreatePayload,
  OpenQuestionCreatePayload,
  PersonaCreatePayload,
} from '@nusoft/nuflow-pack-nuos-build-catalogue';

const INFRASTRUCTURE_MARKER = 'N/A — infrastructure WU';

export function renderWorkUnit(payload: WorkUnitCreatePayload): string {
  const lines: string[] = [];
  lines.push(`# WU ${formatWuNumber(payload)} — ${payload.title}`);
  lines.push('');
  lines.push(`**Status:** 🔵 proposed`);
  if (payload.phase) {
    lines.push(`**Phase:** ${payload.phase}`);
  }
  lines.push(`**Kind:** ${payload.kind}`);
  if (payload.dependsOn.length > 0) {
    lines.push(`**Depends on:** ${[...payload.dependsOn].join(', ')}`);
  }
  if (payload.blocks.length > 0) {
    lines.push(`**Blocks:** ${[...payload.blocks].join(', ')}`);
  }

  lines.push('');
  lines.push('## Outcome');
  lines.push('');

  const outcome = payload.outcome;
  if (outcome.personaRef && outcome.personaRef !== INFRASTRUCTURE_MARKER) {
    lines.push(`**Persona:** ${outcome.personaRef}`);
    lines.push('');
  }
  if (outcome.trigger && outcome.trigger !== INFRASTRUCTURE_MARKER) {
    lines.push(`**Trigger.** ${outcome.trigger}`);
    lines.push('');
  }
  if (outcome.walkthrough && outcome.walkthrough !== INFRASTRUCTURE_MARKER) {
    lines.push(`**Walkthrough.**`);
    lines.push('');
    lines.push(outcome.walkthrough);
    lines.push('');
  }
  if (
    outcome.personaRef === INFRASTRUCTURE_MARKER &&
    outcome.trigger === INFRASTRUCTURE_MARKER &&
    outcome.walkthrough === INFRASTRUCTURE_MARKER
  ) {
    lines.push(`**Persona / Trigger / Walkthrough:** \`N/A — infrastructure WU\``);
    lines.push('');
  }

  if (payload.approach) {
    lines.push('## Approach');
    lines.push('');
    lines.push(payload.approach);
    lines.push('');
  }

  lines.push('## Acceptance criteria');
  lines.push('');
  if (outcome.acceptanceCriteria.length === 0) {
    lines.push('(to be filled in)');
  } else {
    for (const ac of outcome.acceptanceCriteria) {
      const tick = ac.met ? 'x' : ' ';
      lines.push(`- [${tick}] ${ac.text}`);
    }
  }
  lines.push('');

  lines.push('## Contracts produced');
  lines.push('');
  if (outcome.contractsProduced.length === 0) {
    lines.push('(none)');
  } else {
    for (const c of outcome.contractsProduced) lines.push(`- ${c}`);
  }
  lines.push('');

  lines.push('## Contracts consumed');
  lines.push('');
  if (outcome.contractsConsumed.length === 0) {
    lines.push('(none)');
  } else {
    for (const c of outcome.contractsConsumed) lines.push(`- ${c}`);
  }
  lines.push('');

  lines.push('## Notes / log');
  lines.push('');
  lines.push('(Empty until work starts.)');
  lines.push('');

  return lines.join('\n');
}

function formatWuNumber(payload: WorkUnitCreatePayload): string {
  return String(payload.number).padStart(3, '0');
}

export function renderDecision(payload: DecisionCreatePayload): string {
  const lines: string[] = [];
  lines.push(`# ${payload.handle} — ${payload.title}`);
  lines.push('');
  lines.push(`**Date:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`**Status:** ${payload.status}`);
  lines.push('');
  lines.push('## Context');
  lines.push('');
  lines.push(payload.context);
  lines.push('');
  lines.push('## Decision');
  lines.push('');
  lines.push(payload.decision);
  lines.push('');
  lines.push('## Consequences');
  lines.push('');
  lines.push(payload.consequences);
  lines.push('');
  if (payload.alternativesConsidered) {
    lines.push('## Alternatives considered');
    lines.push('');
    lines.push(payload.alternativesConsidered);
    lines.push('');
  }
  return lines.join('\n');
}

export function renderOpenQuestion(payload: OpenQuestionCreatePayload): string {
  const lines: string[] = [];
  lines.push(`# ${payload.handle} — ${payload.title}`);
  lines.push('');
  lines.push(`**Status:** ${payload.status}`);
  lines.push(`**Raised:** ${new Date().toISOString().slice(0, 10)}`);
  if (payload.blocks.length > 0) {
    lines.push(`**Blocks:** ${[...payload.blocks].join(', ')}`);
  }
  lines.push('');
  lines.push('## Why it matters');
  lines.push('');
  lines.push(payload.whyItMatters);
  lines.push('');
  if (payload.options) {
    lines.push('## Options under consideration');
    lines.push('');
    lines.push(payload.options);
    lines.push('');
  }
  if (payload.evidenceNeeded) {
    lines.push('## What evidence would resolve this');
    lines.push('');
    lines.push(payload.evidenceNeeded);
    lines.push('');
  }
  return lines.join('\n');
}

export function renderPersona(payload: PersonaCreatePayload): string {
  const lines: string[] = [];
  lines.push(`# ${payload.handle} — ${payload.title}`);
  lines.push('');
  lines.push(`**Created:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`**Status:** 🟢 active`);
  lines.push('');
  lines.push('## 1. Identity');
  lines.push('');
  lines.push(payload.identity);
  lines.push('');
  lines.push('## 2. Reality');
  lines.push('');
  lines.push(payload.reality);
  lines.push('');
  lines.push('## 3. Psychology');
  lines.push('');
  lines.push(payload.psychology);
  lines.push('');
  lines.push('## 4. Trigger');
  lines.push('');
  lines.push(payload.trigger);
  lines.push('');
  lines.push('## 5. History');
  lines.push('');
  lines.push(payload.history);
  lines.push('');
  lines.push('## 6. Success');
  lines.push('');
  lines.push(payload.success);
  lines.push('');
  lines.push('## 7. Constraints');
  lines.push('');
  lines.push(payload.constraints);
  lines.push('');
  lines.push('## Acid-test refinement');
  lines.push('');
  lines.push(payload.acidTest);
  lines.push('');
  lines.push('## Used by WUs');
  lines.push('');
  lines.push('(none yet — populated as WUs cite this persona)');
  lines.push('');
  return lines.join('\n');
}
