# Changelog — `@nusoft/nuos-build-catalogue`

## 0.9.0 — 2026-05-10 — Env-var support for multi-project use

Adds env-var defaults so the CLI works ergonomically against any catalogue, not just the nuos sibling. **Use case:** Sensight (the first consumer-product adoption of the build-catalogue tooling) has its catalogue at `current-projects/sensight/docs/build/` — passing `--build-root=...` to every command was friction. Now the maintainer sets the env vars in their shell profile (or per-project via direnv / .envrc) and every CLI command picks them up.

**New env vars:**

| Variable | What it controls | Maps to flag |
| --- | --- | --- |
| `NUOS_CATALOGUE_BUILD_ROOT` | Path to the catalogue's `docs/build/` dir | `--build-root` |
| `NUOS_CATALOGUE_WORKFLOWS` | Path to the JSON workflow store file | `--workflows` |
| `NUOS_CATALOGUE_ROOT` | Path to the catalogue's `docs/` dir (semantic-search index source) | `--catalogue` |
| `NUOS_CATALOGUE_INDEX_DIR` | Default parent dir for `index.nv` + `workflows.json` | (no flag; controls computed defaults) |

Resolution order is unchanged from before: explicit flag (highest precedence) → env var → package-relative fallback (works only against the nuos catalogue as a sibling). The fallback path is preserved for backward compatibility with the original WU 110 use case; new consumers should use env vars or flags.

Help text in `nuos-catalogue help` now documents all five env vars.

**Tests:** 113/113 (unchanged; the env-var support is additive).

**Smoke verified against Sensight:**

```bash
export NUOS_CATALOGUE_BUILD_ROOT="/path/to/sensight/docs/build"
export NUOS_CATALOGUE_WORKFLOWS="/path/to/sensight/.nuos-catalogue/workflows.json"
nuos-catalogue summary
# → reads Sensight's catalogue, no flags needed
```

## 0.8.1 — 2026-05-10 — Dep-range fix for pack at 0.1.0

Patch follow-up to 0.8.0. The pack repo bumped 0.0.6 → 0.1.0 in this
session's commit `c85f607`, but the CLI's `dependencies` range for
`@nusoft/nuflow-pack-nuos-build-catalogue` was still `^0.0.6` —
which (per semver caret rules on `0.0.x`) does not match `0.1.0`.
Caught before publish; range bumped to `^0.1.0` per D045 (caret
ranges, never exact pins).

## 0.8.0 — 2026-05-10 — Phase J: WU 111 ship readiness

Marks the CLI as ready for the WU 111 cutover. No new commands or behaviour changes since 0.7.0 — this is the version-and-documentation release that ships alongside `@nusoft/nuflow-pack-nuos-build-catalogue@0.1.0`.

**Added**
- `docs/INTEGRATION-RUNBOOK.md` — operator-facing runbook covering install on a new machine, four-step smoke verification, day-to-day use, build catalogue history convention, and troubleshooting. The canonical reference for "how to use this CLI from clean install to first commit".
- `.gitignore` for `.nuos-catalogue/` — the JSON workflow store is local state in Mode 1 (markdown canonical). Re-running `migrate` is deterministic; the file does not need to live in git. Mode 2 (post-WU-113) may revisit if JSON becomes canonical.

**Test totals:** 113/113 across 33 suites (unchanged from 0.7.0).

**What's not in this release**
- The actual `npm publish` of either this CLI or the pack (the maintainer's guardrail).
- The live one-shot migration commit (the maintainer chooses when to commit `.nuos-catalogue/workflows.json` if at all — per the gitignore, today's default is "don't commit").
- The 5-day soak begins after publish.

## 0.7.0 — 2026-05-10 — Phase H part 3 interactive create commands (WU 111)

Closes WU 111's last substantive surface before Phase J. Four interactive `create` commands ship: `wu create`, `decision create`, `question create`, `persona create`. Each walks the operator through the relevant register's protocol body (per `scripts/protocols/wu-new.md`, `persona-new.md`, etc.) and drives the workflow lifecycle to commit.

**New CLI subcommands:**

```
nuos-catalogue wu       create   (interactive — multi-step prompts)
nuos-catalogue decision create   (interactive)
nuos-catalogue question create   (interactive)
nuos-catalogue persona  create   (interactive — seven dimensions + acid-test per D046)
```

**Architecture.** Three new modules:

- `src/runtime/markdown-render.ts` — pure renderers per register. `renderWorkUnit` produces the D046 six-field shape (with N/A markers for infrastructure WUs); `renderDecision` produces the Context / Decision / Consequences / Alternatives shape; `renderOpenQuestion` produces Why-it-matters / Options / Evidence-needed; `renderPersona` walks the seven dimensions + acid-test.
- `src/commands/prompt.ts` — readline-based prompt helpers using `node:readline/promises` (no new deps). Exports `Prompt` interface (so tests can mock), `openPrompt()` factory, and `askUntilValid` validation loop helper.
- `src/commands/create.ts` — four interactive handlers + four pure capture-builders. Each interactive command takes an injected `Prompt` so tests can substitute a `MockPrompt`.

**MIS adapter extended for `*.create` intents.** New `commitCreateRecord` handler: renders the workflow's typed payload via the appropriate renderer, writes the new markdown file at `<register-dir>/<handle>-<slug>.md` (creating the register dir if needed — e.g. `personas/` is empty in the live catalogue and the persona create operation auto-creates it), adds a new `MigratedRecord` to the JSON store with the appropriate initial status. The `canCommit` check skips the subjects-must-exist guard for create intents (the placeholder `wu-pending` / `d-pending` etc. doesn't yet exist).

**Test approach.** Three layers:

1. **Renderers** — pure-function tests confirming output matches the expected catalogue style (5 tests).
2. **Capture-builders** — pure-function tests confirming the typed payload shape (3 tests).
3. **End-to-end via mock Prompt** — `MockPrompt` scripts answers in order; the test runs the interactive shell, drives the workflow lifecycle, then asserts the resulting markdown file on disk + the JSON store record (4 tests, one per command).

**`wu create` UX details.**
- `kind` choice via `askChoice` over `[feature, infrastructure, spike, remediation]`.
- For infrastructure WUs, persona/trigger/walkthrough are auto-marked `N/A — infrastructure WU` and the prompts are skipped.
- For outcome WUs, all three are required (validated non-empty).
- AC entered one-per-line with a blank line to finish; same pattern for contracts produced + contracts consumed.
- Approach paragraph is optional (defaults to no).

**`persona create` UX details.**
- Seven dimensions each prompted as multi-line input (sentinel `.`).
- Acid-test refinement is the eighth multi-line prompt.
- Validation: every dimension non-empty after trim. The pack's workflow rejects with a clear error if any dimension is empty.

**`decision create` and `question create` UX details.**
- Decision: title, then context/decision/consequences as multi-line. Optional alternatives-considered.
- Question: title, why-it-matters, optional options sketch, optional evidence-needed, optional CSV of WUs blocked.

**Test totals:** 113/113 across 33 suites (was 101/101 in 0.6.0; +12 new tests).

**What's not in this release**
- Phase J — conformance suite + 0.1.0 publish + live cutover migration + WU 128 enforcement-flag flip + 5-day soak.
- Quality-trap surfacing in `wu create` — the four traps (vagueness, technical language, happy-path-only, kitchen-sink) per the `wu-new` protocol body are not yet surfaced as active prompts at review time. Deferred to a refinement pass; for now the operator self-applies the traps before saving (the prompt body suggests this).
- Decision file's `Rationale` field — `renderDecision` produces Context/Decision/Consequences/Alternatives but not Rationale (which the live catalogue uses inconsistently — sometimes folded into Decision, sometimes a separate section). The renderer follows the more conservative subset.

## 0.6.0 — 2026-05-10 — AC parser closes the wu tick + wu advance --to=completed gaps (WU 111)

Closes the two scope cuts from 0.5.0 by adding an acceptance-criteria parser.

**`wu tick` now flips the actual checkbox.** Before 0.6.0 it appended an audit-log entry only. Now it parses the AC list out of the markdown, finds the AC at the supplied index, and replaces the unticked line with the ticked equivalent in the same style:

- `- [ ] text` → `- [x] text`
- `1. text` → `1. ✅ text`

The audit-log entry is still appended for the workflow record. If the AC section can't be parsed (atypical shape — only WU 073 in the live catalogue), the tick falls back to audit-log-only and labels the entry `(audit-log-only — AC list not recognised)`.

**`wu advance --to=completed` now works via CLI when all AC are ticked.** The CLI extracts the AC list from the markdown using `extractForCompletion`, attaches it to the workflow capture as `metadata.acceptanceCriteria`, and the pack's completion gate (Phase C) verifies every entry. Evidence inference:
- Ticked AC with a matching `## Build catalogue history` entry → the evidence string from that entry (e.g., commit ref).
- Ticked AC with no matching history entry → `"Ticked in source markdown."` (the maintainer hand-ticked).
- Unticked AC → no evidence; the gate rejects naming the AC.

**Two AC shapes recognised** (matching what the live catalogue uses across 130+ files):
1. **Checkbox:** `- [ ] text` / `- [x] text` — the newer convention; used by WU 111 itself.
2. **Numbered + emoji:** `1. ✅ text` (ticked) / `1. text` (unticked) — the older convention; common in `done/` files.

**Live verification.** The §6 real-fixture test parses WU 111's actual AC list: 14 unticked checkbox entries; every entry round-trips through `tickAcceptanceCriterion` → checked equivalent → `parseAcceptanceCriteria` again with met=true.

**Added**
- `src/runtime/ac-parse.ts` — `parseAcceptanceCriteria(rawMarkdown)`, `tickAcceptanceCriterion(rawMarkdown, index)`, `extractForCompletion(rawMarkdown)`. Plus a `parseHistoryEvidence` helper that bridges the audit log into the completion gate.
- `tests/ac-parse.test.ts` — 21 acceptance tests across 6 sections (checkbox parsing, numbered+emoji parsing, tick-with-style-preservation, evidence inference, end-to-end through the CLI on a synthetic corpus, and the WU 111 real-fixture test).

**Bug-fixes during testing**
1. The first cut of `parseHistoryEvidence` used a multiline-flag regex with `$` for end-of-input, which actually matched end-of-line and cut entry blocks short before the Evidence sub-bullet. Fixed by switching to a section-bounded split-by-bullet approach.
2. The `commands-write.test.ts` test for "advance to completed without AC" was asserting the old workflow rejection message. With the AC parser in place, an empty AC section now produces a different (clearer) error: `"at least one acceptance criterion"`. Test matcher updated.

**Test totals:** 101/101 across 30 suites (was 82/82 in 0.5.0; +19 new tests).

**What's not in this release**
- Interactive `create` commands (Phase H part 3 — `wu create`, `decision create`, `persona create`)
- Phase J cutover

## 0.5.0 — 2026-05-10 — Phase H part 2 flag-driven write commands (WU 111)

Adds the four flag-driven write commands and wires the build-catalogue NuFlow runtime end-to-end. Markdown files and the JSON workflow store now stay in sync atomically — every write operation updates both.

**New CLI subcommands:**

```
nuos-catalogue wu       advance   <handle> --to=<status> [--reason="..."]
nuos-catalogue wu       tick      <handle> --index=N --evidence="..."
nuos-catalogue decision supersede <target> --by=<superseding> [--reason="..."]
nuos-catalogue question resolve   <q-handle> --by=<d-handle> [--reason="..."]
```

**Architecture.** Three new modules:

- `src/runtime/markdown-edit.ts` — pure helpers: `replaceStatusLine` (handles both bold and pipe-table forms); `insertStatusLine` (inserts after H1 if no status line exists); `appendChangeLog` (adds structured entries to a `## Build catalogue history` section, idempotent across calls).
- `src/runtime/mis-adapter.ts` — `BuildCatalogueMisAdapter` implementing NuFlow's `MisWriteAdapter`. Per-intent commit handlers for the four supported workflow types. Both the markdown file on disk AND the JSON store record are updated in `persist()`; the `status` field on the record is updated alongside `rawMarkdown` so the next workflow invocation reads the current state, not the stale migrated value.
- `src/runtime/runtime.ts` — `createBuildCatalogueRuntime({ store, catalogueRoot })` wires NuFlow runtime + stub memory adapters + the build-catalogue MIS adapter + registers the `@nusoft/nuflow-pack-nuos-build-catalogue` pack.

**New deps:** `@nusoft/nuflow ^0.4.1` (+ devDep `file:../nuflow`); `@nusoft/nuflow-pack-nuos-build-catalogue ^0.0.6` (+ devDep `file:../nuflow-pack-nuos-build-catalogue`). Both load via the CLI when a write command is invoked; they are not loaded for read commands or the migration runner.

**Honest scope cut: AC-list parser deferred.** `wu tick` does not parse the AC list out of the markdown. Instead, it appends a structured entry to the `## Build catalogue history` section naming the criterion index and evidence. The AC list itself stays as the maintainer wrote it; the workflow record + audit chain are the canonical statements. The full AC parser is its own project (different files use different AC shapes — checkbox lists, numbered lists, prose bullets, sub-headings); deferred until a future phase if the audit-log-only approach proves insufficient.

**Honest scope cut: `wu advance --to=completed` requires AC list.** The pack's completion gate (Phase C) requires every AC to have `met: true` with non-empty evidence. The CLI doesn't extract the AC list from markdown, so `--to=completed` fails at the gate with the workflow's own clear error message. This is intentional — completion through the CLI requires the AC parser, which is the same deferred work as `wu tick`. For now, the maintainer flips status to `completed` by hand-editing the markdown directly (and the existing `regenerate` command will surface the resulting drift). When the AC parser lands, the CLI path becomes available.

**Bug-fix surfaced and fixed during testing.** First version of the MIS adapter updated `rawMarkdown` and `fileModifiedAt` on the store record but not the `status` field. The next workflow invocation read the stale `status`, normalised it to the migrated value (e.g., `ready`), and the transition validity check rejected what should have been a legal sequence (e.g., advancing `in_progress → in_review` after just advancing `ready → in_progress`). Fixed by passing the new status through the `persist()` helper as a field update alongside `rawMarkdown`.

**Test totals:** 82/82 across 24 suites (was 63/63 across 18 in Phase I; +19 new tests for write commands + markdown editors).

**Coverage:**
- Markdown editors: replace bold + pipe-table forms; insert after H1; append to history (creates section, appends idempotently).
- `wu advance`: legal transitions update status + history; `→ completed` without AC fails with the gate's error; unknown handle rejected; missing `--to` rejected.
- `wu tick`: appends history entry; rejects empty evidence; rejects negative index.
- `decision supersede`: updates target's status + appends history; appends history to superseding (without changing its status); rejects unknown target; rejects missing `--by`.
- `question resolve`: updates Q's status + appends history; appends history to resolving D; rejects unknown question.
- `regenerate-check` reports zero drift after any write command (store-disk sync verified).

**What's not in this release**
- Interactive `create` commands (Phase H part 3 — `wu create`, `decision create`, `persona create`); these need real prompt UX mirroring the markdown protocol bodies; deferred.
- AC-list parser (deferred; `wu tick` and `wu advance --to=completed` use the audit-log-only approach for now).
- Conformance suite + 0.1.0 publish + live cutover migration + WU 128 enforcement-flag flip (Phase J).

## 0.4.0 — 2026-05-10 — Phase I regenerate + drift report (WU 111)

Adds the `regenerate` subcommand: walks the JSON workflow store, compares each record's stored `rawMarkdown` to its source file, reports drift. Three operating modes: `--check` (default; reports drift), `--diff` (same as check; future enhancement will add unified-diff output), `--write` (overwrite source files with the stored canonical form — Mode 2 cutover; not normally used in Mode 1).

**Scope: Mode 1 verification gate, not Mode 2 field-by-field rendering.** Phase G's migration runner stopped at count parity — the `MigratedRecord` shape preserves `rawMarkdown` verbatim but doesn't extract field-level data (no AC list, no decision body parsed out of markdown). So "regeneration" in Mode 1 is byte-identical reproduction from `rawMarkdown` + drift detection. The richer field-by-field rendering only matters at Mode 2 (post-WU-113), when workflow state mutates through the lifecycle and markdown is generated from richer fields. Phase I therefore ships as the verification-gate version: proves the roundtrip works (trivially, since it's a cache), and detects when a markdown file diverges from the migrated record.

**Live validation against the real catalogue (post-Q019 resolution):**

```
$ nuos-catalogue migrate --workflows=$TMP/wf.json
scanned: 166, migrated: 166, skipped: 0 (zero conflicts)

$ nuos-catalogue regenerate --workflows=$TMP/wf.json
scanned: 166, identical: 166, differs: 0, missing: 0, unreadable: 0
by register: work_unit=114, decision=38, open_question=14, persona=0
```

The roundtrip is verified end-to-end. After the live cutover at Phase J, drift detection becomes the catalogue-discipline gate that surfaces hand-edits-without-workflow-update.

**Why the workflow body in the pack stays a stub.** The pack defines `regenerate_markdown_catalogue` as a workflow handle, but its body remains a stub. The CLI's `regenerate` subcommand does the work directly (reads JSON store, runs drift check). Wiring the workflow body to invoke this code path through NuFlow's lifecycle would be theatre at this stage (no real reason to round-trip through `startWorkflow → confirm → commit` for a read-only verification). Future WU 113 (markdown-as-generated-output cutover) may revisit this if there's a clear need.

**Added**
- `src/regenerate/types.ts` — `DriftEntry`, `DriftReport`, `RegenerateConfig`
- `src/regenerate/diff.ts` — `countLineDiff(before, after)` LCS-based line-counting helper
- `src/regenerate/check.ts` — `runRegenerate({ catalogueRoot, store, registerFilter?, write? })`
- `src/cli.ts` — new `regenerate` subcommand with `--register`, `--diff`, `--write`, `--build-root`, `--workflows`, plus updated help text
- `tests/regenerate.test.ts` — 11 acceptance tests across line-diff math, zero-drift roundtrip, drift detection on edit, register filter, missing-source detection, --write overwrite

**Test totals:** 63/63 across 18 suites.

**What's not in this release**
- Field-by-field renderers (Mode 2 cutover; deferred until WU 113)
- Unified-diff output beyond line-counts (deferred; small enhancement)
- The pack's `regenerate_markdown_catalogue` workflow body (stays a stub; see above)

## 0.3.0 — 2026-05-10 — Phase H read commands + Phase G conflict reporting (WU 111)

**Phase H read commands.** Eight new CLI subcommands for inspecting the migrated workflow store: `summary`, `wu list/show`, `decision list/show`, `question list/show`, `persona list/show`. All accept `--json` for machine consumption. List commands accept `--status=<text>` (substring match, case-insensitive) and `--limit=N`. The `show` subcommands accept canonical handles (`wu-111`, `D046`, `Q009`, `P001`) AND friendly variants (`WU 111`, `111`, `D45`, `Q9`) — the latter normalised before lookup.

**Phase G conflict reporting (small refinement).** The migrator now distinguishes idempotent skips (same source path, re-run) from genuine handle conflicts (different source files claiming the same handle). Conflicts are reported in the migration output with a warning section that names every dropped file and points the maintainer at the fix.

**Real-world finding from live dry-run.** The current live catalogue has 3 WUs sharing the prefix `072b-` in `work-units/done/`:
- `072b-phase-2-step-6-design.md`
- `072b-production-wiring-spec.md`
- `072b-sensight-per-student-propose-mode.md`

Without conflict reporting, the migrator would silently keep one and drop two. With the conflict report, the maintainer sees the issue immediately. This kind of catalogue-discipline feedback is exactly what the migrator needs to surface before the live cutover at Phase J.

**Live end-to-end smoke (no commit; temp-dir):**
```
$ nuos-catalogue migrate --workflows=$TMP/wf.json
scanned: 165, migrated: 163, skipped: 2 (with 2 handle conflicts on wu-072b reported)

$ nuos-catalogue summary --workflows=$TMP/wf.json
total: 163 (work_unit 114, decision 36, open_question 13, persona 0)

$ nuos-catalogue wu list --status=ready --workflows=$TMP/wf.json
6 records: wu-048, wu-072b, wu-083, wu-094, wu-111, wu-125
```

**Added (Phase H)**
- `src/commands/format.ts` — shared list/show formatters (human + JSON; width-aware tabular output)
- `src/commands/handlers.ts` — `listRegister()`, `showRecord()`, `normaliseHandle()`, `listAcrossRegisters()`, `commandToRegister()`
- `src/cli.ts` — new subcommand dispatch for `summary`, `wu`, `decision`, `question`, `persona` plus updated help text
- `tests/commands-read.test.ts` — 23 acceptance tests across normaliseHandle, list (sort, filter, limit, JSON, empty), show (canonical, friendly, integer, JSON, missing, wrong-register), summary, command→register dispatch

**Added (Phase G refinement)**
- `MigrationReport.conflicts: HandleConflict[]` — per-conflict winner/loser source paths
- Migrator distinguishes idempotent re-run skips from genuine conflicts
- CLI surfaces conflicts with a prominent ⚠ warning section
- One new test in `tests/migrate.test.ts` (§3b) verifying conflict detection on a synthetic two-file collision

**Test totals:** 52/52 across 13 suites.

**What's not in this release**
- Write commands (`wu advance`, `wu tick`, `decision supersede`, `open_question.resolve`) — flag-driven; deferred to a follow-up alongside the workflow-pack runtime wiring
- Interactive `create` commands (`wu create`, `decision create`, `persona create`) — these need real prompt UX mirroring the `wu-new` / `persona-new` markdown protocol bodies; substantial UX scope, deferred

## 0.2.0 — 2026-05-10 — Phase G migration runner (WU 111)

Adds the `migrate` subcommand: lifts every artefact in the live catalogue (work units, decisions, open questions, personas) into a JSON-backed workflow record store. Idempotent; tolerant of pre-D046 markdown shapes; subdirectory-aware (`work-units/done/`, `decisions/superseded/`).

**Storage decision: JSON, not NuVector (yet).** A flat `.nuos-catalogue/workflows.json` keyed by handle. Inspectable, simple, sets up Phase I (markdown regeneration) cleanly. NuVector cutover is a deliberate follow-up; the store interface is narrow (`has`, `get`, `put`, `list`, `flush`) so a NuVector adapter can be substituted later without changing call sites.

**Scope: count parity, not field-level fidelity.** Pre-D046 WUs and decisions don't have the new D046 six-field shape in their markdown — the parser preserves handle, number, title, status, slug, source path, raw markdown, and file mtime. Field-level fidelity comes when the catalogue is *authored* via the workflow lifecycle (post-cutover). Migration is back-fill, not transcription.

**Live validation against the real catalogue (dry-run):** 165 artefacts scanned cleanly — 116 WUs, 36 decisions, 13 open questions, 0 personas (the personas register is empty pre-WU-111). Zero parser errors. The actual one-shot live migration runs at Phase J per the WU 111 spec.

**Tolerance for real-world shapes:**
- WU sub-numbers (`030g-...`, `072a-...`, `072b-...`) — the integer part is the number; the suffix flows through into the handle (e.g. `wu-030g`)
- Status extraction handles both `**Status:** ...` (bold) and `| Status | ... |` (pipe-table) forms
- Subdirectories `done/` and `superseded/` are walked one level deep and assigned to the parent register
- `_index.md` files and templates (filenames containing `template`) are skipped
- Empty registers (e.g. `personas/` pre-author) report 0/0 cleanly without error

**Added**
- `src/migrate/types.ts` — `MigratedRecord`, `MigrationReport`, `Register`
- `src/migrate/parsers.ts` — `parseFile()` per-register parser; `registerForRelativePath()` directory→register dispatcher
- `src/migrate/store.ts` — `WorkflowStore` interface backed by `.nuos-catalogue/workflows.json` (schemaVersion 1)
- `src/migrate/run.ts` — `runMigrate()` walker + orchestration + idempotence
- `src/cli.ts` — `migrate` subcommand with `--build-root`, `--workflows`, `--dry-run` flags
- `tests/migrate.test.ts` — 14 acceptance tests across pure parser, register dispatch, full-corpus migration (synthetic 5-artefact fixture), idempotence, subdirectory recursion, dry-run

**Test totals:** 28/28 across 7 suites.

## 0.1.0 — 2026-05-09

First release. Implements [WU 110](../nuos/docs/build/work-units/done/110-index-catalogue-into-nuvector.md) per [D040](../nuos/docs/build/decisions/D040-nuos-led-build-is-foundation-not-parallel-track.md).

**Added**
- Markdown-aware chunker that splits on H1/H2/H3 boundaries, preserves code fences, and merges near-empty headings into substantive siblings to eliminate noise hits in semantic search
- Per-kind metadata extractor — work units, decisions, sessions, open questions, risks, contracts, philosophy, guides, maps, state, build_order, reference
- Hash-based incremental indexer — only re-embeds files whose content has changed since the last run
- Four embedder implementations:
  - `ollama` (default, per [D042](../nuos/docs/build/decisions/D042-nuos-local-inference-posture.md)) — `qwen3-embedding:8b` (4096 dims) by default; `4b` and `0.6b` variants supported
  - `vertex` — Google Vertex `text-embedding-005` (768 dims)
  - `openai` — OpenAI `text-embedding-3-small` (1536 dims)
  - `stub` — deterministic SHA-256 hash for tests
- Embedder `dispose()` discipline per D042 — local-inference models are unloaded after use; CLI calls dispose() in `finally` blocks
- `nuos-catalogue` CLI with `index`, `search`, and `help` subcommands
- Index → search round-trip verified end-to-end against the live NuOS catalogue: 139 files, 1617 chunks, semantic queries return substantive results in ~330–390 ms

**Architectural anchors**
- D040 — NuOS-led build is the foundation, not a parallel track
- D041 — `@nusoft/nuos` meta-package; this package is a sibling, not a dependent
- D042 — local-first inference; models unloaded after use
- D043 — catalogue indexer stays a separate package (this one)
