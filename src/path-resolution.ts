/**
 * Default path resolution for the CLI.
 *
 * Defaults walk up from `process.cwd()` to find the nearest directory
 * containing `docs/build/`, the same way `git` finds its repo root.
 * That makes the CLI work consistently regardless of where it was
 * installed from (sibling checkout, npx cache, global install) and
 * regardless of which subdirectory the operator invokes it from.
 *
 * Resolution order, for every path-shaped flag:
 *   1. Explicit `--flag=<value>` (highest precedence)
 *   2. Matching `NUOS_CATALOGUE_*` env var
 *   3. Walk-up discovery from cwd
 *   4. Throw with a clear hint, OR fall back to cwd, depending on the
 *      flag's semantics (build-root throws because there's no honest
 *      default; storage dirs fall back to cwd because creating them
 *      ad-hoc is reasonable when no project root is found).
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Walk up from `startDir` looking for a directory that contains a
 * `docs/build/` subdirectory. Returns the absolute path to the
 * containing directory, or null if no such directory is found before
 * reaching the filesystem root.
 *
 * Exposed for testing; ordinary callers use `resolveBuildRoot` etc.
 */
export function findProjectRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  while (true) {
    if (existsSync(path.join(dir, 'docs', 'build'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export interface ResolutionContext {
  /** Override for `process.cwd()` — used by tests to anchor walk-up. */
  cwd?: string;
  /** Override for `process.env` — used by tests to control env vars. */
  env?: NodeJS.ProcessEnv;
}

function ctxCwd(ctx?: ResolutionContext): string {
  return ctx?.cwd ?? process.cwd();
}

function ctxEnv(ctx?: ResolutionContext): NodeJS.ProcessEnv {
  return ctx?.env ?? process.env;
}

/**
 * Resolve the build catalogue root. Throws with a clear hint when no
 * value is available — the build root is load-bearing for every write
 * command, so a silent fallback would mask real errors.
 */
export function resolveBuildRoot(
  flag: string | boolean | undefined,
  ctx?: ResolutionContext
): string {
  if (typeof flag === 'string' && flag.length > 0) return path.resolve(flag);
  const env = ctxEnv(ctx);
  if (env.NUOS_CATALOGUE_BUILD_ROOT) return path.resolve(env.NUOS_CATALOGUE_BUILD_ROOT);
  const root = findProjectRoot(ctxCwd(ctx));
  if (root) return path.join(root, 'docs', 'build');
  throw new Error(
    'cannot locate the build catalogue (no docs/build/ directory found from cwd or any parent).\n' +
      'Either:\n' +
      '  - run from a project that has been bootstrapped via `nuos-catalogue init`,\n' +
      '  - set NUOS_CATALOGUE_BUILD_ROOT in your shell profile,\n' +
      '  - or pass --build-root=<dir> to this command.'
  );
}

/**
 * Resolve the wider documentation root for semantic-search indexing.
 * Falls back to `<project-root>/docs` when no flag or env var is set,
 * because semantic-search has always indexed the wider docs/ surface,
 * not just docs/build/.
 */
export function resolveCatalogueRoot(
  flag: string | boolean | undefined,
  ctx?: ResolutionContext
): string {
  if (typeof flag === 'string' && flag.length > 0) return path.resolve(flag);
  const env = ctxEnv(ctx);
  if (env.NUOS_CATALOGUE_ROOT) return path.resolve(env.NUOS_CATALOGUE_ROOT);
  const root = findProjectRoot(ctxCwd(ctx));
  if (root) return path.join(root, 'docs');
  throw new Error(
    'cannot locate the docs/ directory (no docs/build/ found from cwd or any parent).\n' +
      'Either set NUOS_CATALOGUE_ROOT, or pass --catalogue=<dir>.'
  );
}

/**
 * Resolve the `.nuos-catalogue/` storage directory. Always co-located
 * with the project root (the directory containing `docs/build/`).
 * `NUOS_CATALOGUE_INDEX_DIR` env var wins when set.
 */
export function resolveIndexDir(buildRoot: string, ctx?: ResolutionContext): string {
  const env = ctxEnv(ctx);
  if (env.NUOS_CATALOGUE_INDEX_DIR) return path.resolve(env.NUOS_CATALOGUE_INDEX_DIR);
  // buildRoot is `<project-root>/docs/build`; two dirname() calls climb
  // back to the project root.
  const projectRoot = path.dirname(path.dirname(buildRoot));
  return path.join(projectRoot, '.nuos-catalogue');
}

export function resolveWorkflowsPath(
  buildRoot: string,
  flag: string | boolean | undefined,
  ctx?: ResolutionContext
): string {
  if (typeof flag === 'string' && flag.length > 0) return path.resolve(flag);
  const env = ctxEnv(ctx);
  if (env.NUOS_CATALOGUE_WORKFLOWS) return path.resolve(env.NUOS_CATALOGUE_WORKFLOWS);
  return path.join(resolveIndexDir(buildRoot, ctx), 'workflows.json');
}

export function resolveIndexPath(
  buildRoot: string,
  flag: string | boolean | undefined,
  ctx?: ResolutionContext
): string {
  if (typeof flag === 'string' && flag.length > 0) return path.resolve(flag);
  return path.join(resolveIndexDir(buildRoot, ctx), 'index.nv');
}

export function resolveHashPath(
  buildRoot: string,
  flag: string | boolean | undefined,
  ctx?: ResolutionContext
): string {
  if (typeof flag === 'string' && flag.length > 0) return path.resolve(flag);
  return path.join(resolveIndexDir(buildRoot, ctx), 'hashes.json');
}

/**
 * Soft warning surfaced after a `migrate` or `regenerate` run: if the
 * project has a `.gitignore` at its root and that `.gitignore` does
 * NOT contain a `.nuos-catalogue/` entry, the workflow store appears
 * as untracked. Returns a multi-line `note:` string when a warning
 * should be printed, or null when silent.
 *
 * Silent when:
 *   - the project has no `.gitignore` (it might not be a git repo)
 *   - the gitignore already excludes `.nuos-catalogue/`
 *   - the gitignore can't be read for any reason (be quiet, not noisy)
 */
export function gitignoreCatalogueNote(
  buildRoot: string,
  ctx?: ResolutionContext
): string | null {
  try {
    const projectRoot = path.dirname(path.dirname(buildRoot));
    const gitignorePath = path.join(projectRoot, '.gitignore');
    if (!existsSync(gitignorePath)) return null;
    const content = readFileSync(gitignorePath, 'utf8');
    if (/^\s*\.nuos-catalogue\//m.test(content)) return null;
    const indexDir = resolveIndexDir(buildRoot, ctx);
    return (
      'note: the workflow store is at ' +
      path.relative(projectRoot, indexDir) +
      '/, but your .gitignore does not exclude .nuos-catalogue/.\n' +
      '      Add this line to .gitignore so the per-machine JSON state stays out of commits:\n' +
      '          .nuos-catalogue/'
    );
  } catch {
    return null;
  }
}
