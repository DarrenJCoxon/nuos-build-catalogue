/**
 * WU 110 verification gate — Pattern J discipline.
 *
 * The @nusoft/nuvector README documents three storage backends:
 *   - "memory:"            — in-memory, ephemeral
 *   - "./project.nv"       — local file
 *   - { kind: "postgres" } — Postgres
 *
 * Before WU 110 commits to file-backed storage, we must prove empirically
 * that opening a file-backed store, upserting a record, closing it, and
 * reopening in a fresh process actually returns the record. Hedge words
 * ("the README says it works") are not acceptance — only this script
 * passing is.
 *
 * This is run twice: once in --write mode, then again in --read mode.
 * Run via: pnpm verify-storage  (does both phases in one process tree)
 */

import { NuVector } from '@nusoft/nuvector';
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const STORAGE_PATH = path.resolve(path.dirname(__filename), '../.verify-test.nv');
const DIMENSIONS = 8; // tiny for this smoke test
const TENANT = 'verify_test';
const RECORD_ID = 'verify_record_001';

// Deterministic non-zero embedding (NuVector requires Float32Array)
const fixedEmbedding = new Float32Array(
  Array.from({ length: DIMENSIONS }, (_, i) => (i + 1) / 10),
);

async function writePhase(): Promise<void> {
  console.log('[write phase] cleaning previous state at', STORAGE_PATH);
  if (existsSync(STORAGE_PATH)) {
    rmSync(STORAGE_PATH, { recursive: true, force: true });
  }

  console.log('[write phase] opening NuVector with file storage');
  const memory = await NuVector.open({
    storage: STORAGE_PATH,
    dimensions: DIMENSIONS,
    tenant: TENANT,
  });

  console.log('[write phase] upserting record', RECORD_ID);
  await memory.upsert({
    id: RECORD_ID,
    kind: 'nuwiki_article_summary',
    embedding: fixedEmbedding,
    text: 'verification record — must survive process restart',
    tenant: TENANT,
    metadata: { test: 'verify-persistence', written_at: Date.now() },
  });

  console.log('[write phase] record written, closing store');
  // NuVector may or may not expose a close(); rely on process exit to flush.
  process.exit(0);
}

async function readPhase(): Promise<void> {
  console.log('[read phase] reopening NuVector at', STORAGE_PATH);
  if (!existsSync(STORAGE_PATH)) {
    console.error('[read phase] FAIL — storage path does not exist after write phase');
    process.exit(2);
  }

  const memory = await NuVector.open({
    storage: STORAGE_PATH,
    dimensions: DIMENSIONS,
    tenant: TENANT,
  });

  console.log('[read phase] searching for the verification record');
  const result = await memory.searchKnowledge({
    query: 'verification record',
    embedding: fixedEmbedding,
    budget: { maxTokens: 1000, maxArticles: 5 },
  });

  const items = (result?.items ?? []) as Array<{
    ref?: string;
    id?: string;
    metadata?: Record<string, unknown>;
  }>;
  const found = items.some((item) => item.ref === RECORD_ID || item.id === RECORD_ID);

  if (found) {
    console.log('[read phase] PASS — record retrieved across process restart');
    console.log('[read phase] verdict: file-backed persistence WORKS in this NuVector build');
    process.exit(0);
  } else {
    console.error('[read phase] FAIL — record not found after restart');
    console.error('[read phase] retrieved items:', JSON.stringify(items, null, 2));
    console.error('[read phase] verdict: file-backed persistence does NOT work in this NuVector build');
    console.error('[read phase] WU 110 must fall back to Postgres');
    process.exit(3);
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2];

  if (mode === '--write') {
    await writePhase();
    return;
  }
  if (mode === '--read') {
    await readPhase();
    return;
  }

  // Orchestrator: spawn write then read in fresh processes
  console.log('=== WU 110 storage-backend verification gate ===');
  await new Promise<void>((resolve, reject) => {
    const child = spawn('npx', ['tsx', __filename, '--write'], { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`write phase exited with code ${code}`));
    });
  });

  await new Promise<void>((resolve, reject) => {
    const child = spawn('npx', ['tsx', __filename, '--read'], { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) {
        console.log('\n=== VERIFICATION GATE: PASS ===');
        resolve();
      } else {
        console.error('\n=== VERIFICATION GATE: FAIL ===');
        process.exit(code ?? 1);
      }
    });
  });
}

main().catch((err) => {
  console.error('verification script error:', err);
  process.exit(1);
});
