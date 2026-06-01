# nuos-build-catalogue

Indexes the NuOS build catalogue (`docs/build/`, `docs/contracts/`, `docs/philosophy/`, `docs/guides/`) into NuVector for semantic search. Implements [WU 110](../nuos/docs/build/work-units/110-index-catalogue-into-nuvector.md).

This is the first concrete step in NuOS taking over its own build, per [D040](../nuos/docs/build/decisions/D040-nuos-led-build-is-foundation-not-parallel-track.md). Before WU 110, finding things in the catalogue meant `grep`. After WU 110, it means semantic queries with metadata filters.

## Setup

```bash
npm install
```

The embedder is selected via `NUOS_CATALOGUE_EMBEDDER`:

| Value | Provider | Default model | Dimensions | Notes |
|---|---|---|---|---|
| `ollama` (default) | Local Ollama | `qwen3-embedding:0.6b` | 1024 | **Sovereignty by default.** No network egress. The 0.6b default (~600 MB) runs on any modern laptop, including CPU-only. For better recall on a machine with headroom, raise fidelity with `NUOS_CATALOGUE_OLLAMA_MODEL=qwen3-embedding:4b` (2560 dims, ~2.5 GB) or `qwen3-embedding:8b` (4096 dims, ~4.7 GB). Needs `ollama serve` running and the model pulled (`ollama pull qwen3-embedding:0.6b`). |
| `vertex` | Google Vertex | `text-embedding-005` | 768 | Cloud Google. Needs `GOOGLE_CLOUD_PROJECT` plus a Vertex access token (set `GOOGLE_VERTEX_ACCESS_TOKEN`, or have `gcloud` on PATH and run `gcloud auth application-default login`). |
| `openai` | OpenAI | `text-embedding-3-small` | 1536 | Cloud OpenAI. Needs `OPENAI_API_KEY`. |
| `stub` | Hash-based, no API | — | 384 | Tests + dev only. Results are noisy. |

Switching embedder (or model variant) requires a full reindex (`rm -rf .nuos-catalogue && npm run index`) because dimensions differ.

## Quick start

```bash
# Pre-flight (one time):
ollama serve                          # in another shell
ollama pull qwen3-embedding:0.6b      # ~600 MB download

# Index the catalogue (first time re-embeds everything; later runs only re-embed changed files)
npm run index

# Search
npm run search -- "module boundary enforcement"
npm run search -- "epistemic discipline" --kind=decision --limit=5
npm run search -- "EHCP lifecycle" --json

# Re-run after editing a few files (only changed files re-embed)
npm run index
```

## Storage

Index lives at `.nuos-catalogue/index.nv` (file-backed NuVector store, REDB underneath) plus a sibling `hashes.json` mapping each file path to its content SHA-256 + the chunk IDs it produced. Both are committed to git so the index state is reproducible across machines (Topology A per [D041](../nuos/docs/build/decisions/D041-nuos-meta-package-integration-layer.md)).

If `.nuos-catalogue/index.nv` ever gets corrupt or out-of-sync, delete the directory and re-run `npm run index`.

## Verification gate

Before any other code lands, the verification gate proves that `@nusoft/nuvector@0.1.0` actually persists file-backed storage across process restarts. Re-run it any time you bump the NuVector dep or suspect storage is broken:

```bash
npm run verify-storage
```

Pass = file storage works in the published binary; the indexer can use it. Fail = something has regressed and the package needs a Postgres fallback or a NuVector fix.

## Architecture in one paragraph

`crawl` walks the catalogue picking up `.md` files (skipping `_index.md`, `done/`, `archive/`, `superseded/`). Each file goes to `chunkMarkdown` which splits on H1/H2/H3 boundaries (preserving code fences) into ~600-token chunks with deterministic IDs. `extractMetadata` produces structured metadata per file (kind, idInKind, status, date, cross-refs). The `Embedder` then turns chunk texts into Float32Array vectors. The orchestrator (`runIndex`) only re-embeds files whose content hash has changed since the last run, then `upsert`s them into NuVector as `nuwiki_article_summary` records. `runSearch` embeds the query and calls `searchKnowledge` to retrieve the top-K hits, which the formatter renders as a human-readable list or JSON.

## Out of scope (Phase 0)

- Auto-running on commit — that's WU 128.
- A GUI — CLI only.
- Writing to NuVector via NuFlow workflows — that's WU 111.
- Compiling NuWiki articles from indexed content — WU 113–115.
- Multi-user / concurrent indexing.
- Adopting `@nusoft/nuos` — uses NuVector directly until WU 130 ships.

## Known API quirks (NuVector v0.1.0)

Discovered during the WU 110 implementation; documented here so future contributors don't burn time rediscovering them:

- `embedding` must be a `Float32Array`, not a plain `number[]`. Plain arrays fail with `Get TypedArray info failed on NvMemoryRecord.embedding`.
- Search results expose the upsert-time `id` as `ref` on each item (asymmetry with the input shape).
- `tenant` belongs on `MemoryRecord` (upsert) but not on `SearchKnowledgeRequest` — the store-level tenant from `NuVector.open` scopes search automatically.
- `searchKnowledge` operates on Layer 1 records (`nuwiki_article_summary`); to make a chunk retrievable directly, index it as `nuwiki_article_summary`. `nuwiki_section` is for sections within an enclosing article and requires `searchSectionsInArticles` with the article IDs.

## Tests

```bash
npx tsx --test tests/
```

13 tests across `chunk`, `metadata`, `crawl` cover the indexing primitives. End-to-end is exercised by running `npm run index` then `npm run search` against the real catalogue.

## License

Private; not published to npm.
