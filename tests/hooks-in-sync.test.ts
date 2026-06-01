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

// ---------- 4. WU 113b Stage B: STATE.md drift-block logic present -------

test('templates/hooks/pre-commit contains the staged_state_md guard (WU 113b drift-block)', async () => {
  const template = await readFile(TEMPLATE_HOOK, 'utf8');
  assert.ok(
    template.includes('staged_state_md'),
    'Expected templates/hooks/pre-commit to contain `staged_state_md` ' +
    '(the variable that gates the drift-check on STATE.md being staged). ' +
    'Missing means the WU 113b Stage B drift-block was not landed.'
  );
});

test('templates/hooks/pre-commit contains the nuos-catalogue drift-check invocation (WU 113b)', async () => {
  const template = await readFile(TEMPLATE_HOOK, 'utf8');
  assert.ok(
    template.includes('nuos-catalogue state drift-check'),
    'Expected templates/hooks/pre-commit to contain the `nuos-catalogue state drift-check` ' +
    'invocation. Missing means the WU 113b Stage B drift-block was not landed.'
  );
});

test('templates/hooks/pre-commit guards on command -v nuos-catalogue before drift-check (fail-open)', async () => {
  const template = await readFile(TEMPLATE_HOOK, 'utf8');
  assert.ok(
    template.includes('command -v nuos-catalogue'),
    'Expected templates/hooks/pre-commit to guard on `command -v nuos-catalogue` before ' +
    'invoking the drift-check. The hook must never block commits when the binary is absent.'
  );
});

test('templates/hooks/pre-commit contains the old-binary skip guard (fail-open for < 0.35.0)', async () => {
  const template = await readFile(TEMPLATE_HOOK, 'utf8');
  assert.ok(
    template.includes('generated regions'),
    'Expected templates/hooks/pre-commit to contain the `generated regions` phrase check ' +
    'that distinguishes a genuine drift finding from an old-binary "unknown subcommand" error. ' +
    'Missing means old binaries (< 0.35.0) would block commits on their "unknown command" exit.'
  );
});

test('templates/hooks/pre-commit contains state-drift-block log event (WU 113b)', async () => {
  const template = await readFile(TEMPLATE_HOOK, 'utf8');
  assert.ok(
    template.includes('state-drift-block'),
    'Expected templates/hooks/pre-commit to log a `state-drift-block` event when blocking. ' +
    'Missing means drift-block events are not recorded in the enforcement log.'
  );
});
