# Map [number] — [title]

> **The canonical operational plan for [workstream name].** Sequenced work units from "today" to "[goal state]", each with phase-step decomposition, contracts realised, and verification gates anchored in target-repo files. If a step isn't here, it isn't planned. This map is the single source of truth for [workstream name] — read this before any other planning surface.

> Replace the bracketed placeholders. Delete this hint block.

## How to read this map

The catalogue's decomposition (which this map operationalises):

```
Contracts                deep-module surfaces — what the system IS
   │
   │ realised by
   ▼
Maps                     strategic plan — when, in what order, why
   │
   │ ordering
   ▼
Work units (WUs)         executable units against contract surfaces — what ships
   │
   │ decomposed into
   ▼
Phases                   sub-units when a WU is too large for one shot
   │
   │ decomposed into
   ▼
Phase steps              the actual moves; each has acceptance + verification gate
```

Maps own **sequencing and outline**. WU files own **acceptance design and execution log**. Contracts own **the surface specs**. Sessions own **the temporal history**. No other planning artefact.

## The five agentic-age patterns this map enforces

These are the load-bearing discipline for agent-led building (codified in [`THE-NUOS-BUILD-METHOD.md`](https://github.com/DarrenJCoxon/nuos/blob/main/docs/THE-NUOS-BUILD-METHOD.md) §post-Phase-3 epistemic discipline):

1. **Verification gates anchored in target-repo files** — every phase step names a specific file/grep/test as acceptance proof. Closes the spec-vs-reality drift loop.
2. **Maps as single canonical plan** — story-level detail lives here, not in side docs. Closes the proliferation loop.
3. **Contracts as immutable truth** — phase steps cite the contract surface they realise. Closes the "agent makes things up" loop.
4. **Hedge words as stop signal** — "likely", "presumably", "should be" indicate a missing verification step.
5. **Design alternatives before implementation** — Ousterhout's "design it twice"; produce at least two fundamentally different designs, evaluate, then pick or hybrid before generating non-trivial implementation. Phase steps that generate implementation carry an implicit prerequisite: design alternatives recorded in WU notes.

## Where we are now ([date])

| WU | Title | Status | Repo / branch |
|---|---|---|---|
| [WU number] | [title] | [🔵 ready / 🟡 in flight / 🟣 in_review / ✅ done / 🔴 blocked] | [repo + branch] |

## What "[goal state]" means

The workstream is **complete** when all of the following hold simultaneously:

1. [Outcome 1]
2. [Outcome 2]
3. [Outcome 3]
4. ...

(List the verifiable end-state of the workstream. Each outcome should be an observable fact about the system, not a process step.)

## Critical path

```
[diagram of WU sequencing with dependencies — use ASCII art or describe in prose]
```

---

## WU [number] — [title]

| Field | Value |
|---|---|
| Contracts realised | [which contract surface(s) this WU fulfils] |
| Status | [🔵 / 🟡 / 🟣 / ✅ / 🔴] |
| Repo | [repo + branch] |
| Estimate | [working days] |
| Depends on | [upstream WUs / npm publishes / external] |

**Design alternatives considered (Pattern N — before any non-trivial implementation step):**

> If this WU includes any non-trivial architectural choice (schema, migration, integration shape, adapter, RBAC, audit, retention, error-handling), record at least two fundamentally different design candidates here before phase steps that generate implementation. State the chosen one and why. Delete this block if the WU is purely incremental work against an already-decided design.

- **Option A:** [first fundamentally different design]. Trade-offs: [...]. Errors created: [...].
- **Option B:** [second fundamentally different design]. Trade-offs: [...]. Errors created: [...].
- *(Option C if useful)*
- **Chosen:** [A / B / C / hybrid] because [...]. Records as: [WU notes / D-NNN decision file].

| # | Phase step | Acceptance | Verification gate |
|---|---|---|---|
| 1 | [what move is being made] | [what proves it produced the intended outcome] | [specific file/grep/test the operator runs to confirm] |
| 2 | ... | ... | ... |

**Done when:** [the overall WU acceptance — usually "all N steps complete + canonical green line + integration test"].

**Risks:** [anything that could derail the WU; mitigations].

---

## WU [number] — [title]

[Repeat the structure above for each WU on the critical path. Each WU with non-trivial design choices gets its own "Design alternatives considered" block; routine incremental WUs can omit it.]

---

## What runs in parallel

[List independent workstreams that don't gate the critical path.]

## Trigger conditions for deferred WUs

[List WUs that are deferred and what unblocks them.]

## What this map is not

- It does NOT describe [out-of-scope topic 1] — see [other doc].
- It does NOT cover [out-of-scope topic 2] — see [other doc].

## How to use this map

- **At session start** — read this map plus the active WU's spec file. The map tells you which phase step is next + the verification gate; the WU spec tells you the deeper acceptance design.
- **Mid-step** — if you find yourself writing a hedge word ("likely", "presumably", "should be"), stop. Run the verification gate's grep/test/file-read first. Replace the hedge with the result.
- **At session end** — flip phase-step status here; if scope changed, edit the step description here (not in a side doc).
- **When a phase completes** — flip the WU's phase status; update STATE.md to reflect; confirm the dependency graph still holds.

## Pointers

- [List relevant WU files, contracts, decisions, prior maps]
