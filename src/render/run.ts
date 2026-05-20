/**
 * Orchestrator for `nuos-catalogue render` — generates companion HTML views
 * for the visual registers (ui-ux, design-system, maps, architecture) from
 * the canonical markdown.
 *
 * Companions are *generated artefacts*, not source. The markdown remains the
 * source of truth for every agent, every search, every diff. The companion
 * exists so a human operator can scan visual artefacts (wireframes, swatches,
 * timelines, module graphs) in their natural medium instead of reading prose
 * descriptions of them.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { renderSurfaces } from './surfaces.js';
import { renderDesignSystem } from './design-system.js';
import { renderMaps } from './maps.js';
import { renderArchitecture } from './architecture.js';

export const RENDERABLE_REGISTERS = ['surfaces', 'design-system', 'maps', 'architecture'] as const;
export type RenderableRegister = (typeof RENDERABLE_REGISTERS)[number];

export interface RenderOptions {
  buildRoot: string;
  /** Only render these registers (default: all). */
  only?: RenderableRegister[];
  /** Override "now" for deterministic output in tests. */
  now?: () => Date;
}

export interface RenderReport {
  results: { register: RenderableRegister; written: boolean; outPath: string; detail: string }[];
}

export async function runRender(options: RenderOptions): Promise<RenderReport> {
  const { buildRoot } = options;
  const targets = options.only ?? [...RENDERABLE_REGISTERS];
  const now = options.now ?? (() => new Date());
  const generatedAt = isoDate(now());
  const projectName = await resolveProjectName(buildRoot);

  const ctx = { buildRoot, projectName, generatedAt };
  const report: RenderReport = { results: [] };

  for (const register of targets) {
    switch (register) {
      case 'surfaces': {
        const r = await renderSurfaces(ctx);
        report.results.push({
          register,
          written: r.written,
          outPath: r.outPath,
          detail: r.written ? `${r.surfaceCount} surfaces` : 'skipped (no ui-ux/)',
        });
        break;
      }
      case 'design-system': {
        const r = await renderDesignSystem(ctx);
        report.results.push({
          register,
          written: r.written,
          outPath: r.outPath,
          detail: r.written ? 'rendered' : 'skipped (no design-system/)',
        });
        break;
      }
      case 'maps': {
        const r = await renderMaps(ctx);
        report.results.push({
          register,
          written: r.written,
          outPath: r.outPath,
          detail: r.written ? `${r.mapCount} maps` : 'skipped (no maps/)',
        });
        break;
      }
      case 'architecture': {
        const r = await renderArchitecture(ctx);
        report.results.push({
          register,
          written: r.written,
          outPath: r.outPath,
          detail: r.written ? `${r.moduleCount} modules` : 'skipped (no architecture/)',
        });
        break;
      }
    }
  }

  return report;
}

async function resolveProjectName(buildRoot: string): Promise<string> {
  // buildRoot is `<project>/docs/build`; methodfile.json lives at the project root.
  const projectRoot = path.resolve(buildRoot, '..', '..');
  const methodfilePath = path.join(projectRoot, 'methodfile.json');
  if (existsSync(methodfilePath)) {
    try {
      const mf = JSON.parse(await readFile(methodfilePath, 'utf8')) as {
        project?: { name?: string };
      };
      if (mf.project?.name) return mf.project.name;
    } catch {
      // fall through to directory-name default
    }
  }
  return path.basename(projectRoot);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
