import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractMetadata } from '../src/indexer/metadata.ts';

async function withTempFile(relPath: string, content: string, fn: (abs: string, rel: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'nuos-meta-'));
  try {
    const abs = path.join(root, path.basename(relPath));
    await writeFile(abs, content, 'utf8');
    await fn(abs, relPath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('extractMetadata', () => {
  it('classifies work units, decisions, sessions, open questions', async () => {
    const checks: Array<[string, string, string | null, string]> = [
      ['build/work-units/110-foo.md', '# WU 110\n', 'WU 110', 'work_unit'],
      ['build/decisions/D040-foo.md', '# D040\n', 'D040', 'decision'],
      ['build/open-questions/Q015-foo.md', '# Q015\n', 'Q015', 'open_question'],
      ['contracts/x.md', 'irrelevant', null, 'contract'],
      ['build/STATE.md', 'irrelevant', null, 'state'],
      ['build/BUILD-ORDER.md', 'irrelevant', null, 'build_order'],
    ];
    for (const [rel, content, idInKind, kind] of checks) {
      await withTempFile(rel, content, async (abs) => {
        const meta = await extractMetadata(abs, rel, content);
        assert.equal(meta.kind, kind, `kind for ${rel}`);
        assert.equal(meta.idInKind, idInKind, `idInKind for ${rel}`);
      });
    }
  });

  it('extracts status line', async () => {
    const md = `# Foo\n\n**Status:** 🟢 ready\n\nbody\n`;
    await withTempFile('build/work-units/x.md', md, async (abs, rel) => {
      const meta = await extractMetadata(abs, rel, md);
      assert.match(meta.status ?? '', /ready/);
    });
  });

  it('extracts cross references for D-NNN, Q-NNN, WU NNN', async () => {
    const md = `Per [D040](D040.md), see also Q015 and WU 110, plus WU 072a.`;
    await withTempFile('build/decisions/D041-x.md', md, async (abs, rel) => {
      const meta = await extractMetadata(abs, rel, md);
      assert.deepEqual(meta.crossRefs.sort(), ['D040', 'Q015', 'WU 072a', 'WU 110']);
    });
  });

  it('extracts an explicit Date line', async () => {
    const md = `**Date:** 2026-05-08\n\n# title\n`;
    await withTempFile('build/sessions/s.md', md, async (abs, rel) => {
      const meta = await extractMetadata(abs, rel, md);
      assert.equal(meta.date, '2026-05-08');
    });
  });
});
