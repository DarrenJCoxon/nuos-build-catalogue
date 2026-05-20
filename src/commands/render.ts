/**
 * `nuos-catalogue render [register]` — regenerate the HTML companion views
 * for the visual registers (ui-ux, design-system, maps, architecture).
 *
 *   nuos-catalogue render                  # render all four
 *   nuos-catalogue render surfaces         # render just ui-ux/_view.html
 *   nuos-catalogue render design-system    # render just design-system/_view.html
 *   nuos-catalogue render maps             # render just maps/_view.html
 *   nuos-catalogue render architecture     # render just architecture/_view.html
 *
 * Companion HTML files are *generated artefacts*. The canonical source for
 * every register stays markdown — every agent (architect, coder, reviewer)
 * reads markdown. The HTML exists so the operator can review inherently visual
 * artefacts in their natural medium.
 */

import path from 'node:path';

import { resolveBuildRoot } from '../path-resolution.js';
import { RENDERABLE_REGISTERS, runRender, type RenderableRegister } from '../render/run.js';

export interface RenderCommandOptions {
  cwd?: string;
  /** Optional register name (`surfaces`, `design-system`, `maps`, `architecture`). */
  positional?: string;
  /** Override for --build-root flag. */
  buildRootFlag?: string | boolean;
  /** Override "now" for deterministic test output. */
  now?: () => Date;
}

export async function cmdRender(options: RenderCommandOptions = {}): Promise<number> {
  const buildRoot = resolveBuildRoot(options.buildRootFlag, { cwd: options.cwd ?? process.cwd() });

  let only: RenderableRegister[] | undefined;
  if (options.positional && options.positional !== 'all') {
    if (!(RENDERABLE_REGISTERS as readonly string[]).includes(options.positional)) {
      console.error(`unknown register: ${options.positional}`);
      console.error(`available: ${RENDERABLE_REGISTERS.join(', ')}`);
      return 1;
    }
    only = [options.positional as RenderableRegister];
  }

  const report = await runRender({ buildRoot, only, now: options.now });

  for (const r of report.results) {
    const status = r.written ? '✓' : '·';
    const rel = path.relative(process.cwd(), r.outPath);
    console.log(`  ${status} ${r.register.padEnd(16)} ${r.detail.padEnd(20)} ${r.written ? rel : ''}`);
  }
  const writtenCount = report.results.filter((r) => r.written).length;
  console.log('');
  console.log(`${writtenCount}/${report.results.length} register${report.results.length === 1 ? '' : 's'} rendered.`);
  return 0;
}
