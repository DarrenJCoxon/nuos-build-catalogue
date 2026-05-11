/**
 * `nuos-catalogue swarm status` — list recent swarm runs from docs/build/swarm/.
 * `nuos-catalogue swarm cost`   — aggregate cost across swarm runs.
 *
 * Read-only. Pulls from the audit files written by `/build-wu` to
 * `docs/build/swarm/YYYY-MM-DD-wu-<handle>.md`. Both commands rely on
 * the convention that the swarm-run template's Cost table totals on a
 * `**Total**` row and the Outcome field is in the front of the file.
 *
 * The CLI is intentionally lenient — if a run file is missing the
 * expected sections (hand-written, partially filled, mid-write) the
 * commands surface what they can rather than failing.
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { resolveBuildRoot } from '../path-resolution.js';

interface SwarmRun {
  filename: string;
  filePath: string;
  date: string; // YYYY-MM-DD parsed from filename
  workUnit: string | null; // handle parsed from filename
  outcome: string | null; // first non-empty value from "Outcome:" line
  totalCostLine: string | null; // raw "**Total** ... **£X+Y+Z**" line text
}

const FILENAME_RE = /^(\d{4}-\d{2}-\d{2})-wu-([\w-]+)\.md$/i;

async function loadSwarmRuns(buildRoot: string): Promise<SwarmRun[]> {
  const swarmDir = path.join(buildRoot, 'swarm');
  if (!existsSync(swarmDir)) return [];

  const entries = await readdir(swarmDir, { withFileTypes: true });
  const runs: SwarmRun[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (entry.name.startsWith('_')) continue; // skip _index.md, _template.md
    const m = entry.name.match(FILENAME_RE);
    if (!m) continue;

    const filePath = path.join(swarmDir, entry.name);
    const content = await readFile(filePath, 'utf8');
    const outcome = extractOutcome(content);
    const totalCostLine = extractTotalCost(content);
    runs.push({
      filename: entry.name,
      filePath,
      date: m[1],
      workUnit: m[2],
      outcome,
      totalCostLine,
    });
  }
  runs.sort((a, b) => b.date.localeCompare(a.date));
  return runs;
}

function extractOutcome(content: string): string | null {
  const m = content.match(/^\*\*Outcome:\*\*\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

function extractTotalCost(content: string): string | null {
  // Look for a markdown table row containing both "**Total**" and a £ figure.
  for (const line of content.split('\n')) {
    if (line.includes('**Total**') && line.includes('£')) {
      return line.trim();
    }
  }
  return null;
}

export interface SwarmCommandOptions {
  cwd?: string;
  limit?: number;
}

export async function cmdSwarmStatus(options: SwarmCommandOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  let buildRoot: string;
  try {
    buildRoot = resolveBuildRoot(undefined, { cwd });
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  }

  const runs = await loadSwarmRuns(buildRoot);
  if (runs.length === 0) {
    console.log('');
    console.log('No swarm runs filed yet.');
    console.log('');
    console.log('A swarm run lands in docs/build/swarm/ each time you invoke');
    console.log('`/build-wu <handle>` against a work unit.');
    console.log('');
    return 0;
  }

  const limit = options.limit ?? 10;
  const recent = runs.slice(0, limit);
  console.log('');
  console.log(`Recent swarm runs (showing ${recent.length} of ${runs.length}):`);
  console.log('');
  for (const run of recent) {
    const outcome = run.outcome ?? '(no outcome recorded)';
    console.log(`  ${run.date}  wu-${run.workUnit}  →  ${outcome}`);
  }
  console.log('');
  console.log(`See files in: ${path.join(buildRoot, 'swarm')}`);
  console.log('');
  return 0;
}

export async function cmdSwarmCost(options: SwarmCommandOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  let buildRoot: string;
  try {
    buildRoot = resolveBuildRoot(undefined, { cwd });
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  }

  const runs = await loadSwarmRuns(buildRoot);
  if (runs.length === 0) {
    console.log('No swarm runs filed yet. Cost is 0.');
    return 0;
  }

  console.log('');
  console.log('Swarm cost summary (best-effort estimates from audit files):');
  console.log('');
  for (const run of runs) {
    const cost = run.totalCostLine ?? '(no cost recorded)';
    console.log(`  ${run.date}  wu-${run.workUnit}`);
    console.log(`    ${cost}`);
  }
  console.log('');
  console.log('Estimates only. Real cost depends on retry counts and actual context loaded.');
  console.log('To track real spend, use the Anthropic billing dashboard or the API usage endpoint.');
  console.log('');
  return 0;
}
