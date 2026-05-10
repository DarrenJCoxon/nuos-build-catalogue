/**
 * readline-based prompt helpers for interactive CLI commands.
 *
 * Built on node:readline/promises (no new deps). The prompt object
 * carries an open readline interface; callers are responsible for
 * closing it via `prompt.close()` when done. The pattern is:
 *
 *   const p = openPrompt();
 *   try {
 *     const title = await p.ask('Title: ');
 *     // ...
 *   } finally {
 *     p.close();
 *   }
 *
 * Tests substitute a mock implementation by injecting a Prompt object
 * directly to the create handlers; the readline-backed openPrompt is
 * only invoked from the CLI shell.
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export interface Prompt {
  ask(question: string): Promise<string>;
  askMultiline(question: string, sentinel?: string): Promise<string>;
  askChoice(question: string, choices: string[]): Promise<string>;
  confirm(question: string, defaultYes?: boolean): Promise<boolean>;
  print(line: string): void;
  close(): void;
}

export function openPrompt(): Prompt {
  const rl = createInterface({ input: stdin, output: stdout });

  return {
    async ask(question: string): Promise<string> {
      return (await rl.question(question)).trim();
    },

    async askMultiline(question: string, sentinel = '.'): Promise<string> {
      stdout.write(`${question}\n  (end with a single line containing only "${sentinel}")\n`);
      const lines: string[] = [];
      while (true) {
        const line = await rl.question('');
        if (line.trim() === sentinel) break;
        lines.push(line);
      }
      return lines.join('\n').trim();
    },

    async askChoice(question: string, choices: string[]): Promise<string> {
      const numbered = choices.map((c, i) => `  ${i + 1}. ${c}`).join('\n');
      while (true) {
        const answer = (await rl.question(`${question}\n${numbered}\nChoose (1–${choices.length}): `)).trim();
        const idx = parseInt(answer, 10);
        if (Number.isInteger(idx) && idx >= 1 && idx <= choices.length) {
          return choices[idx - 1];
        }
        // Allow typing the choice text directly.
        const direct = choices.find((c) => c.toLowerCase() === answer.toLowerCase());
        if (direct) return direct;
        stdout.write(`(unrecognised — try a number 1–${choices.length} or the choice text)\n`);
      }
    },

    async confirm(question: string, defaultYes = true): Promise<boolean> {
      const suffix = defaultYes ? '[Y/n]' : '[y/N]';
      const answer = (await rl.question(`${question} ${suffix} `)).trim().toLowerCase();
      if (answer === '') return defaultYes;
      return answer === 'y' || answer === 'yes';
    },

    print(line: string): void {
      stdout.write(`${line}\n`);
    },

    close(): void {
      rl.close();
    },
  };
}

/**
 * Validation helpers that return `null` when valid, error string when not.
 */
export const validate = {
  nonEmpty(value: string, fieldName: string): string | null {
    if (value.trim().length === 0) return `${fieldName} must be non-empty`;
    return null;
  },
  matches(value: string, pattern: RegExp, fieldName: string, hint?: string): string | null {
    if (!pattern.test(value)) {
      return `${fieldName} did not match expected pattern${hint ? ` (${hint})` : ''}`;
    }
    return null;
  },
};

/**
 * Repeatedly ask a question until validation passes. Validators can
 * return null (valid) or an error string (invalid; will be shown and
 * the question re-asked).
 */
export async function askUntilValid(
  p: Prompt,
  question: string,
  validator: (value: string) => string | null,
  options: { multiline?: boolean; sentinel?: string } = {}
): Promise<string> {
  while (true) {
    const value = options.multiline
      ? await p.askMultiline(question, options.sentinel)
      : await p.ask(question);
    const error = validator(value);
    if (!error) return value;
    p.print(`(${error})`);
  }
}
