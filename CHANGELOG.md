# Changelog — `@nusoft/nuos-build-catalogue`

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
