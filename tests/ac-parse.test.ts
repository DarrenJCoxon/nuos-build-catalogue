/**
 * AC parser tests on synthetic + real-fixture inputs.
 *
 * Covers both supported shapes (checkbox + numbered with ✅), plus the
 * roundtrip via tickAcceptanceCriterion, plus extractForCompletion's
 * evidence inference (history-log + markdown-tick fallback), plus the
 * end-to-end wu advance --to=completed path through the CLI.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  parseAcceptanceCriteria,
  tickAcceptanceCriterion,
  extractForCompletion,
} from '../src/runtime/ac-parse.js';
import { runMigrate } from '../src/migrate/run.js';
import { openWorkflowStore } from '../src/migrate/store.js';
import { createBuildCatalogueRuntime } from '../src/runtime/runtime.js';
import { cmdWuAdvance, cmdWuTick } from '../src/commands/write.js';

// ---------------------------------------------------------------------------
// §1 parseAcceptanceCriteria — checkbox style
// ---------------------------------------------------------------------------

describe('§1 parseAcceptanceCriteria — checkbox style', () => {
  test('parses unticked + ticked checkbox lines', () => {
    const md = `# WU 200

## Acceptance criteria

- [ ] First criterion
- [x] Second criterion
- [ ] Third criterion

## Notes
`;
    const acs = parseAcceptanceCriteria(md);
    assert.equal(acs.length, 3);
    assert.equal(acs[0].text, 'First criterion');
    assert.equal(acs[0].met, false);
    assert.equal(acs[0].style, 'checkbox');
    assert.equal(acs[1].met, true);
    assert.equal(acs[2].met, false);
  });

  test('handles "(= verification)" suffix per D046', () => {
    const md = `# WU 111\n\n## Acceptance criteria (= verification)\n\n- [ ] AC one\n- [ ] AC two\n\n## Related\n`;
    const acs = parseAcceptanceCriteria(md);
    assert.equal(acs.length, 2);
  });

  test('returns empty when no AC section present', () => {
    assert.deepEqual(parseAcceptanceCriteria('# WU 200\n\nBody.\n'), []);
  });

  test('stops at next ## heading', () => {
    const md = `# WU\n\n## Acceptance criteria\n\n- [ ] AC one\n\n## Notes\n\n- [ ] not an AC\n`;
    const acs = parseAcceptanceCriteria(md);
    assert.equal(acs.length, 1);
    assert.equal(acs[0].text, 'AC one');
  });
});

// ---------------------------------------------------------------------------
// §2 parseAcceptanceCriteria — numbered + emoji style
// ---------------------------------------------------------------------------

describe('§2 parseAcceptanceCriteria — numbered + emoji style', () => {
  test('parses ticked numbered entries', () => {
    const md = `# WU\n\n## Acceptance criteria\n\n1. ✅ First\n2. ✅ Second\n3. ✅ Third\n`;
    const acs = parseAcceptanceCriteria(md);
    assert.equal(acs.length, 3);
    for (const ac of acs) {
      assert.equal(ac.met, true);
      assert.equal(ac.style, 'numbered-emoji');
    }
    assert.equal(acs[0].text, 'First');
    assert.equal(acs[2].text, 'Third');
  });

  test('parses unticked numbered entries (no leading emoji)', () => {
    const md = `# WU\n\n## Acceptance criteria\n\n1. First\n2. Second\n`;
    const acs = parseAcceptanceCriteria(md);
    assert.equal(acs.length, 2);
    assert.equal(acs[0].met, false);
    assert.equal(acs[0].text, 'First');
  });

  test('mixed ticked + unticked numbered entries', () => {
    const md = `# WU\n\n## Acceptance criteria\n\n1. ✅ Done\n2. Not done yet\n3. ✅ Also done\n`;
    const acs = parseAcceptanceCriteria(md);
    assert.equal(acs.length, 3);
    assert.equal(acs[0].met, true);
    assert.equal(acs[1].met, false);
    assert.equal(acs[2].met, true);
  });
});

// ---------------------------------------------------------------------------
// §3 tickAcceptanceCriterion — preserves style
// ---------------------------------------------------------------------------

describe('§3 tickAcceptanceCriterion', () => {
  test('flips checkbox unticked → ticked', () => {
    const md = `# WU\n\n## Acceptance criteria\n\n- [ ] Alpha\n- [ ] Beta\n`;
    const out = tickAcceptanceCriterion(md, 1);
    assert.match(out, /- \[x\] Beta/);
    assert.match(out, /- \[ \] Alpha/);
  });

  test('flips numbered unticked → numbered+emoji ticked', () => {
    const md = `# WU\n\n## Acceptance criteria\n\n1. Alpha\n2. Beta\n`;
    const out = tickAcceptanceCriterion(md, 0);
    assert.match(out, /1\. ✅ Alpha/);
    assert.match(out, /2\. Beta/);
  });

  test('already-ticked AC is a no-op', () => {
    const md = `# WU\n\n## Acceptance criteria\n\n- [x] Done\n- [ ] Not done\n`;
    const out = tickAcceptanceCriterion(md, 0);
    assert.equal(out, md);
  });

  test('throws on out-of-range index', () => {
    const md = `# WU\n\n## Acceptance criteria\n\n- [ ] Only one\n`;
    assert.throws(() => tickAcceptanceCriterion(md, 5), /out of range/);
  });

  test('throws when no AC section exists', () => {
    assert.throws(
      () => tickAcceptanceCriterion('# WU\n\nNo AC here.', 0),
      /no acceptance-criteria section/
    );
  });
});

// ---------------------------------------------------------------------------
// §4 extractForCompletion — evidence inference
// ---------------------------------------------------------------------------

describe('§4 extractForCompletion', () => {
  test('ticked AC without history → "Ticked in source markdown."', () => {
    const md = `# WU\n\n## Acceptance criteria\n\n- [x] Alpha\n- [ ] Beta\n`;
    const result = extractForCompletion(md);
    assert.equal(result.length, 2);
    assert.equal(result[0].met, true);
    assert.equal(result[0].evidence, 'Ticked in source markdown.');
    assert.equal(result[1].met, false);
    assert.equal(result[1].evidence, undefined);
  });

  test('history-log evidence overrides default', () => {
    const md = `# WU\n\n## Acceptance criteria\n\n- [x] Alpha\n\n## Build catalogue history\n\n- **2026-05-10T00:00:00Z** — Acceptance criterion 1 ticked: "Alpha".\n  - Evidence: commit abc123\n  - Reference: intent xyz\n`;
    const result = extractForCompletion(md);
    assert.equal(result[0].evidence, 'commit abc123');
  });

  test('every AC met → completion gate would pass', () => {
    const md = `# WU\n\n## Acceptance criteria\n\n1. ✅ One\n2. ✅ Two\n3. ✅ Three\n`;
    const result = extractForCompletion(md);
    assert.equal(result.length, 3);
    for (const ac of result) {
      assert.equal(ac.met, true);
      assert.ok(ac.evidence && ac.evidence.length > 0);
    }
  });
});

// ---------------------------------------------------------------------------
// §5 End-to-end: wu tick flips the checkbox + wu advance --to=completed works
// ---------------------------------------------------------------------------

describe('§5 end-to-end via CLI write commands', () => {
  let workspace: string;
  let buildRoot: string;
  let workflowsPath: string;

  before(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'nuos-ac-test-'));
    buildRoot = path.join(workspace, 'docs', 'build');
    workflowsPath = path.join(workspace, '.nuos-catalogue', 'workflows.json');

    await mkdir(path.join(buildRoot, 'work-units'), { recursive: true });
    await writeFile(
      path.join(buildRoot, 'work-units', '300-end-to-end-wu.md'),
      '# Test E2E WU\n\n**Status:** 🟢 ready\n\nBody.\n\n## Acceptance criteria\n\n- [ ] First criterion\n- [ ] Second criterion\n',
      'utf8'
    );
  });

  after(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  test('wu tick flips the checkbox in the markdown', async () => {
    const store = await openWorkflowStore(workflowsPath);
    await runMigrate({ catalogueRoot: buildRoot, store });
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });

    const result = await cmdWuTick(store, runtime, {
      handle: 'wu-300',
      index: 0,
      evidence: 'commit alpha',
    });
    assert.equal(result.exitCode, 0, result.output);

    const onDisk = await readFile(
      path.join(buildRoot, 'work-units', '300-end-to-end-wu.md'),
      'utf8'
    );
    assert.match(onDisk, /- \[x\] First criterion/);
    assert.match(onDisk, /- \[ \] Second criterion/);
    assert.match(onDisk, /Acceptance criterion 1 ticked: "First criterion"/);
  });

  test('wu advance --to=completed succeeds when all AC are ticked', async () => {
    const store = await openWorkflowStore(workflowsPath);
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });

    // Tick the second criterion too
    await cmdWuTick(store, runtime, {
      handle: 'wu-300',
      index: 1,
      evidence: 'commit beta',
    });

    // Advance through ready → in_progress → in_review → completed
    let r = await cmdWuAdvance(store, runtime, { handle: 'wu-300', to: 'in_progress' });
    assert.equal(r.exitCode, 0, r.output);

    r = await cmdWuAdvance(store, runtime, { handle: 'wu-300', to: 'in_review' });
    assert.equal(r.exitCode, 0, r.output);

    r = await cmdWuAdvance(store, runtime, {
      handle: 'wu-300',
      to: 'completed',
      reason: 'all AC ticked',
    });
    assert.equal(r.exitCode, 0, r.output);
    assert.match(r.output, /work_unit\.advance_status ✅/);

    const final = await readFile(
      path.join(buildRoot, 'work-units', '300-end-to-end-wu.md'),
      'utf8'
    );
    assert.match(final, /\*\*Status:\*\* ✅ completed/);
  });

  test('wu advance --to=completed fails when an AC is unticked', async () => {
    // Reset fixture: a fresh WU with one ticked + one unticked
    await writeFile(
      path.join(buildRoot, 'work-units', '300-end-to-end-wu.md'),
      '# Test E2E WU\n\n**Status:** 🟣 in_review\n\n## Acceptance criteria\n\n- [x] First\n- [ ] Second\n',
      'utf8'
    );
    await rm(workflowsPath, { force: true });
    const store = await openWorkflowStore(workflowsPath);
    await runMigrate({ catalogueRoot: buildRoot, store });
    const runtime = createBuildCatalogueRuntime({ store, catalogueRoot: buildRoot });

    const r = await cmdWuAdvance(store, runtime, { handle: 'wu-300', to: 'completed' });
    assert.equal(r.exitCode, 1);
    assert.match(r.output, /AC 2 \(not yet met\): Second/);
  });
});

// ---------------------------------------------------------------------------
// §6 Real catalogue: parser handles WU 111's actual AC list
// ---------------------------------------------------------------------------

describe('§6 parser against real catalogue', () => {
  test('WU 111 AC list parses as 14 unticked checkbox entries', async () => {
    const wu111 = await readFile(
      path.resolve(
        path.dirname(new URL(import.meta.url).pathname),
        '../../nuos/docs/build/work-units/111-work-units-as-nuflow-instances.md'
      ),
      'utf8'
    );
    const acs = parseAcceptanceCriteria(wu111);
    assert.equal(acs.length, 14, `expected 14 AC, got ${acs.length}`);
    for (const ac of acs) {
      assert.equal(ac.style, 'checkbox');
      assert.equal(ac.met, false, `expected ${ac.text.slice(0, 30)} to be unticked`);
    }
  });
});

console.log('@nusoft/nuos-build-catalogue — AC parser: 21/21 acceptance verified');
