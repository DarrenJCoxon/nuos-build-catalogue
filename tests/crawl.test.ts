import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crawl } from '../src/indexer/crawl.ts';

async function setup(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'nuos-crawl-'));
  await mkdir(path.join(root, 'build/work-units/done'), { recursive: true });
  await mkdir(path.join(root, 'build/decisions/superseded'), { recursive: true });
  await mkdir(path.join(root, 'build/sessions/archive'), { recursive: true });
  await mkdir(path.join(root, 'contracts'), { recursive: true });
  await mkdir(path.join(root, 'guides'), { recursive: true });

  await writeFile(path.join(root, 'build/work-units/110-foo.md'), '# WU 110\n');
  await writeFile(path.join(root, 'build/work-units/_index.md'), '# Index\n');
  await writeFile(path.join(root, 'build/work-units/done/001-old.md'), '# old\n');
  await writeFile(path.join(root, 'build/decisions/D040-foo.md'), '# D040\n');
  await writeFile(path.join(root, 'build/decisions/superseded/D024.md'), '# old\n');
  await writeFile(path.join(root, 'build/sessions/archive/old.md'), '# archived\n');
  await writeFile(path.join(root, 'contracts/nuvector.md'), '# contract\n');
  await writeFile(path.join(root, 'guides/01-overview.md'), '# guide\n');
  await writeFile(path.join(root, 'build/STATE.md'), '# state\n');
  await writeFile(path.join(root, 'build/something.png'), 'binary');

  return root;
}

describe('crawl', () => {
  it('picks up indexable .md files and skips _index.md', async () => {
    const root = await setup();
    try {
      const files = await crawl({ catalogueRoot: root });
      const rels = files.map((f) => f.relativePath).sort();
      assert.ok(rels.includes('build/work-units/110-foo.md'), 'must include active WU');
      assert.ok(rels.includes('build/decisions/D040-foo.md'), 'must include active decision');
      assert.ok(rels.includes('contracts/nuvector.md'), 'must include contract');
      assert.ok(rels.includes('guides/01-overview.md'), 'must include guide');
      assert.ok(rels.includes('build/STATE.md'), 'must include STATE.md');
      assert.ok(!rels.includes('build/work-units/_index.md'), 'must skip _index.md');
      assert.ok(!rels.includes('build/something.png'), 'must skip non-md');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('skips done/, superseded/, archive/ by default', async () => {
    const root = await setup();
    try {
      const files = await crawl({ catalogueRoot: root });
      const rels = files.map((f) => f.relativePath);
      assert.ok(!rels.some((r) => r.includes('/done/')));
      assert.ok(!rels.some((r) => r.includes('/superseded/')));
      assert.ok(!rels.some((r) => r.includes('/archive/')));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('includes archived dirs when includeArchived is set', async () => {
    const root = await setup();
    try {
      const files = await crawl({ catalogueRoot: root, includeArchived: true });
      const rels = files.map((f) => f.relativePath);
      assert.ok(rels.some((r) => r.includes('/done/')));
      assert.ok(rels.some((r) => r.includes('/superseded/')));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
