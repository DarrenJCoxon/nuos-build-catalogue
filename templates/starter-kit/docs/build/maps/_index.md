# Maps — index

> Maps are the canonical operational plan for a project running the NuOS Build Method. **Story-level detail lives in maps**, not in fragmented planning docs. If a phase step isn't here, it isn't planned. The maps are the single source of truth for sequencing.

## Why maps matter (the post-Phase-3 evolution)

The NuOS catalogue has many surfaces — decisions, contracts, work units, sessions, risks, open questions. Maps are what stops planning from sprawling across all of them. Maps own:

- **Sequencing** — which work unit comes when, with explicit dependencies
- **Phase-step decomposition** — when a WU is too large for one shot, the phase steps live here, each with acceptance + verification gate
- **Contracts realised** — every WU on the path cites the contract surface(s) it fulfils

This is one of the four agentic-age patterns codified in the NuOS Build Method (see [`docs/THE-NUOS-BUILD-METHOD.md`](https://github.com/DarrenJCoxon/nuos/blob/main/docs/THE-NUOS-BUILD-METHOD.md) §post-Phase-3). The pattern: **maps as single canonical plan** closes the proliferation loop. A fresh session — human or agent — should be able to read STATE.md + the active map and have full operational context.

## Map conventions

- **Map 1 — the horizon.** The whole project journey, narrative form. Layperson-readable. If you read only one map, this is it.
- **Map 2 — phases-in-detail (optional).** When the project has clearly separated phases (e.g., NuOS's Phases 0–F), this map gives mid-level detail per phase.
- **Map N — canonical operational plan(s).** One per major workstream. Story-level detail with verification gates. This is where the active work lives.

A small project may only need Map 1 + Map 2 (canonical plan). A larger project may have several Map N variants for parallel workstreams. The convention: numbered sequentially; the latest is the most operational.

## Story-step shape

Every executable phase step in a map has the following shape (per [`01-template.md`](01-template.md)):

```
| # | Phase step | Acceptance | Verification gate |
|---|---|---|---|
| 1 | <what move is being made> | <what proves it produced the intended outcome> | <specific file/grep/test in the target repo that the operator runs to confirm the gate> |
```

The **verification gate** is the load-bearing column for agent-led work. *"This works"* is not a gate. *"`grep 'createSensightMisWriteAdapter' apps/web/lib/nuos/nuflow/runtime.ts` returns a hit"* is a gate. Vague gates leave room for plausible-looking work that doesn't match reality; precise gates close that loop.

## Hedge words are a stop signal

If you find yourself writing *"likely"*, *"presumably"*, *"should be"* in a map, stop. The hedge word indicates a verification step you skipped. Replace it with the grep/test/file-read result before the map ships.

## Design alternatives before implementation

For any non-trivial architectural choice — schema, migration, integration shape, adapter design, audit composition, RBAC pattern, error-handling strategy, retention policy — **produce at least two fundamentally different designs, evaluate them, then pick or hybrid before any implementation is generated.** This is Ousterhout's "design it twice" applied to agent-led work.

Two syntactic variations of the same design (e.g., `USING` clause vs `WITH CHECK` clause for the same RLS pattern) do not count. Three fundamentally different designs (e.g., session-variable RLS / Supabase auth.uid() RLS / defense-in-depth + app-side enforcement) do count.

Record the alternatives in the WU's Design notes (or as a D-NNN decision when the choice is durable enough). The audit trail of *"we considered A, B, C; chose B because X"* is catalogue value — future sessions can re-evaluate when context changes.

In maps, any phase step whose work is *"generate non-trivial implementation"* carries an implicit prerequisite: design alternatives recorded in the WU notes. The gate fires before code is written, not after.

## Naming

- `01-the-horizon.md` — the high-level narrative (recommend keep verbatim if adopting unchanged)
- `02-<name>.md` — phases-in-detail or first canonical operational plan
- `03-<name>.md`, `04-<name>.md`, etc. — additional canonical plans per workstream

When a map is superseded (e.g., the project's operational shape changes), preserve the old map with a `(HISTORICAL)` header pointing at its replacement. Don't delete — the evolution is part of the audit trail.

## Maps in this catalogue

| File | Title | Purpose |
|---|---|---|
| `01-template.md` | Map template | Shape for a canonical operational map (copy + rename) |

Update this list as you add real maps.
