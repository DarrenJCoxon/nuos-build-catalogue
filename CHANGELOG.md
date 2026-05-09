# Changelog — `@nusoft/nuos-build-catalogue`

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
