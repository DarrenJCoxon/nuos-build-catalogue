/**
 * `nuos-catalogue plan status` — read methodfile.json's planning tracker
 * and print a 5-line summary of where the project is in the planning arc.
 *
 * Read-only; never mutates state. The actual phase advancement is done by
 * the relevant plan-* protocol when it finishes its work and updates the
 * methodfile + STATE.md as part of its end-of-session.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

interface PlanState {
  phaseA_orientation?: PlanStatus;
  phaseB_architecture?: PlanStatus;
  phaseC_uiUxDesignSystem?: PlanStatus;
  phaseD_maps?: PlanStatus;
  phaseE_initialWorkUnits?: PlanStatus;
  completedAt?: string | null;
}

type PlanStatus = 'not_started' | 'in_progress' | 'complete';

interface MethodFile {
  planning?: PlanState;
}

const PHASES: { key: keyof PlanState; label: string }[] = [
  { key: 'phaseA_orientation', label: 'A. Orientation' },
  { key: 'phaseB_architecture', label: 'B. Architecture & Contracts' },
  { key: 'phaseC_uiUxDesignSystem', label: 'C. UI/UX + Design System' },
  { key: 'phaseD_maps', label: 'D. Maps' },
  { key: 'phaseE_initialWorkUnits', label: 'E. Initial Work Units' },
];

function statusIcon(s: PlanStatus | undefined): string {
  switch (s) {
    case 'complete':
      return '✅';
    case 'in_progress':
      return '🟡';
    default:
      return '🔵';
  }
}

function statusLabel(s: PlanStatus | undefined): string {
  switch (s) {
    case 'complete':
      return 'complete';
    case 'in_progress':
      return 'in progress';
    default:
      return 'not started';
  }
}

export interface PlanStatusOptions {
  cwd?: string;
}

export async function cmdPlanStatus(options: PlanStatusOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const methodfilePath = path.join(cwd, 'methodfile.json');

  if (!existsSync(methodfilePath)) {
    console.error(`No methodfile.json found at ${cwd}.`);
    console.error('Run `nuos-catalogue init` first to set up a catalogue.');
    return 1;
  }

  let mf: MethodFile;
  try {
    mf = JSON.parse(await readFile(methodfilePath, 'utf8'));
  } catch (err) {
    console.error(`Couldn't read methodfile.json: ${(err as Error).message}`);
    return 1;
  }

  const planning = mf.planning ?? {};

  console.log('');
  console.log('Planning progress for this project:');
  console.log('');
  for (const { key, label } of PHASES) {
    const status = planning[key] as PlanStatus | undefined;
    console.log(`  ${statusIcon(status)} ${label.padEnd(36)} ${statusLabel(status)}`);
  }
  console.log('');

  const firstNotStarted = PHASES.find(
    (p) => (planning[p.key] as PlanStatus | undefined) !== 'complete',
  );
  if (!firstNotStarted) {
    console.log('All five phases complete. The project is ready to build —');
    console.log('use /start-of-session and /end-of-session for normal work from here.');
    console.log('');
    return 0;
  }

  if ((planning[firstNotStarted.key] as PlanStatus | undefined) === 'in_progress') {
    console.log(`Currently in: ${firstNotStarted.label} (in progress)`);
    console.log('Resume by running /start-of-session — the AI reads the last session log');
    console.log('and picks up at the right step.');
  } else {
    console.log(`Next phase: ${firstNotStarted.label}`);
    console.log('Begin by running /start-of-session — the AI detects the empty phase');
    console.log('and routes to the right planning protocol.');
  }
  console.log('');
  return 0;
}
