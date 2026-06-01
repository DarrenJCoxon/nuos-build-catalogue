/**
 * Drift guard for the bundled pre-commit hook template (D127 fix — WU 216).
 *
 * Three invariants are asserted:
 *
 *   1. SYNC — `scripts/hooks/pre-commit` (the CLI's own installed copy) is
 *      byte-identical to `templates/hooks/pre-commit` (the published source
 *      consumers install from). If they diverge, consumers get a different
 *      hook than what the CLI itself runs.
 *
 *      Fix: copy one over the other, then re-run `bash scripts/install-hooks.sh`
 *      in any downstream project to propagate.
 *
 *   2. D127 LOGIC PRESENT — the template contains the HEAD-status pre-image
 *      read that D127 introduced. The key markers are:
 *        - `git show "HEAD:$f"` — reads the committed state of a decision file
 *        - `candidate_decisions` — the correctly-scoped variable that feeds the
 *          HEAD-status loop
 *        - `locked_decisions` — the filtered list of only truly-locked decisions
 *        - `accepted|active)` — the case arm that gates on locked statuses only
 *
 *   3. OLD BUGGY LOGIC ABSENT — the old unconditional block used the variable
 *      name `modified_decisions` to gate every D-NNN edit regardless of status.
 *      That variable name is completely absent from the fixed hook and would
 *      only reappear if someone accidentally reverted to the pre-D127 version.
 *
 * This test mirrors the pattern in tests/protocols-in-sync.test.ts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_HOOK = path.join(REPO_ROOT, 'templates', 'hooks', 'pre-commit');
const SCRIPTS_HOOK  = path.join(REPO_ROOT, 'scripts',   'hooks', 'pre-commit');

// ---------- 1. Sync invariant -------------------------------------------

test('scripts/hooks/pre-commit is byte-identical to templates/hooks/pre-commit', async () => {
  const template = await readFile(TEMPLATE_HOOK, 'utf8');
  const scripts  = await readFile(SCRIPTS_HOOK,  'utf8');
  assert.equal(
    scripts,
    template,
    'scripts/hooks/pre-commit has drifted from templates/hooks/pre-commit. ' +
    'Copy one over the other so they are identical, then re-run ' +
    '`bash scripts/install-hooks.sh` in any downstream project to propagate.'
  );
});

// ---------- 2. D127 logic present ----------------------------------------

test('templates/hooks/pre-commit contains the HEAD pre-image read (D127 fix)', async () => {
  const template = await readFile(TEMPLATE_HOOK, 'utf8');
  assert.ok(
    template.includes('git show "HEAD:$f"'),
    'Expected templates/hooks/pre-commit to contain `git show "HEAD:$f"` ' +
    '(the D127 HEAD pre-image read). The hook may have been reverted to the ' +
    'pre-D127 version that blocked all D-NNN modifications unconditionally.'
  );
});

test('templates/hooks/pre-commit contains the candidate_decisions variable (D127 fix)', async () => {
  const template = await readFile(TEMPLATE_HOOK, 'utf8');
  assert.ok(
    template.includes('candidate_decisions'),
    'Expected templates/hooks/pre-commit to contain `candidate_decisions` ' +
    '(the correctly-scoped variable introduced by D127). Missing means the ' +
    'hook may have been reverted to the pre-D127 version.'
  );
});

test('templates/hooks/pre-commit contains the locked_decisions variable (D127 fix)', async () => {
  const template = await readFile(TEMPLATE_HOOK, 'utf8');
  assert.ok(
    template.includes('locked_decisions'),
    'Expected templates/hooks/pre-commit to contain `locked_decisions` ' +
    '(the status-filtered variable introduced by D127). Missing means the ' +
    'hook may have been reverted to the pre-D127 version.'
  );
});

test('templates/hooks/pre-commit contains the accepted|active case arm (D127 fix)', async () => {
  const template = await readFile(TEMPLATE_HOOK, 'utf8');
  assert.ok(
    template.includes('accepted|active)'),
    'Expected templates/hooks/pre-commit to contain the case arm `accepted|active)` ' +
    '(the status gate introduced by D127 that limits blocks to locked decisions). ' +
    'Missing means the hook may have been reverted to the pre-D127 version.'
  );
});

// ---------- 3. Old buggy logic absent ------------------------------------

test('templates/hooks/pre-commit does NOT contain the old modified_decisions variable (pre-D127 regression guard)', async () => {
  const template = await readFile(TEMPLATE_HOOK, 'utf8');
  assert.ok(
    !template.includes('modified_decisions'),
    'templates/hooks/pre-commit contains `modified_decisions`, which was the ' +
    'variable name used by the pre-D127 unconditional block that blocked every ' +
    'D-NNN edit regardless of the decision\'s committed status. This variable ' +
    'should not appear in the fixed hook. The hook may have been reverted.'
  );
});
