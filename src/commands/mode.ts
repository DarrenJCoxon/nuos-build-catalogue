/**
 * `nuos-catalogue mode` — read or set the operator mode in methodfile.json.
 *
 *   nuos-catalogue mode                  → prints the current mode
 *   nuos-catalogue mode <name>           → sets the mode and stamps modeSelectedAt
 *
 * Valid names: coaching, standard, developer.
 *
 * The mode shapes the *tone* of every operator-facing protocol — see
 * docs/build/OPERATOR-MODES.md for what each mode means. The picker
 * normally runs once at first /start-of-session; this CLI command exists
 * so the operator can change their mind without hand-editing JSON.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const VALID_MODES = ['coaching', 'standard', 'developer'] as const;
export type OperatorMode = (typeof VALID_MODES)[number];

export function isOperatorMode(v: unknown): v is OperatorMode {
  return typeof v === 'string' && (VALID_MODES as readonly string[]).includes(v);
}

export interface ModeOptions {
  cwd?: string;
  /** When omitted, the command prints the current mode and exits 0. */
  mode?: string;
  /** Override "now" — used by tests for deterministic timestamps. */
  now?: () => string;
}

export async function cmdMode(options: ModeOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const methodfilePath = path.join(cwd, 'methodfile.json');

  if (!existsSync(methodfilePath)) {
    console.error(`No methodfile.json found at ${cwd}.`);
    console.error('Run `nuos-catalogue init` first to set up a catalogue.');
    return 1;
  }

  let raw: string;
  try {
    raw = await readFile(methodfilePath, 'utf8');
  } catch (err) {
    console.error(`Couldn't read methodfile.json: ${(err as Error).message}`);
    return 1;
  }

  let mf: Record<string, unknown>;
  try {
    mf = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    console.error(`methodfile.json is not valid JSON: ${(err as Error).message}`);
    return 1;
  }

  const operator = (mf.operator as Record<string, unknown> | undefined) ?? {};
  const current = operator.mode;

  if (options.mode === undefined) {
    if (isOperatorMode(current)) {
      console.log(current);
      return 0;
    }
    console.log('(unset)');
    console.log('');
    console.log('Run `nuos-catalogue mode <coaching|standard|developer>` to set,');
    console.log('or just start /start-of-session and the picker will run automatically.');
    return 0;
  }

  if (!isOperatorMode(options.mode)) {
    console.error(`unknown mode: ${options.mode}`);
    console.error(`valid modes: ${VALID_MODES.join(', ')}`);
    return 1;
  }

  const today = (options.now ?? (() => new Date().toISOString().slice(0, 10)))();

  const updated = {
    ...mf,
    operator: {
      ...operator,
      mode: options.mode,
      modeSelectedAt: today,
    },
  };

  // Preserve a trailing newline to match the JSON convention in the rest of the
  // project (every other written file ends with a newline; tooling like git diff
  // is happier that way).
  const trailingNewline = raw.endsWith('\n') ? '\n' : '';
  await writeFile(methodfilePath, JSON.stringify(updated, null, 2) + trailingNewline, 'utf8');

  const previous = isOperatorMode(current) ? current : '(unset)';
  console.log(`Operator mode: ${previous} → ${options.mode}`);
  console.log(`Tone for every operator-facing protocol now matches '${options.mode}'.`);
  console.log(`See docs/build/OPERATOR-MODES.md for what that means in practice.`);
  return 0;
}
