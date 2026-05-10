# Changelog — `@nusoft/nuos-build-catalogue`

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
