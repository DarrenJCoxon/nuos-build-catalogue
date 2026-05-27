# Deep modules

> The architectural commitment that this project is built from **deep modules** — small interface, large hidden complexity — and never from shallow ones. This is the most load-bearing decision in the project's shape, and the rule cannot be broken as the build progresses.

## What a deep module is

A deep module is a chunk of the system with:

- **A small interface** — few public functions, few public types, few entry points. What other modules need to know to use it is small.
- **A large hidden body** — significant complexity, state, branching, integration with external systems, edge-case handling, all *behind* the interface.

The asymmetry between interface and body is the **depth ratio**. A deep module hides a lot behind a little. A shallow module hides little behind a little — its interface is roughly as wide as its implementation, so the module is almost pure overhead.

Ousterhout's *A Philosophy of Software Design* names this directly: **the best modules are deep**. They reduce the total cognitive load of the system because every caller pays a small interface cost in exchange for a large hidden cost they no longer have to think about.

## What a shallow module looks like

These are the failure modes this project rejects:

- **The pass-through** — a module whose public methods each call exactly one method in another module, adding nothing. Wraps without hiding.
- **The util / helper grab-bag** — `utils.ts`, `helpers/`, `common/`. A directory of unrelated functions sharing only the property that nobody knew where else to put them. No hidden complexity, no coherent responsibility.
- **The leaky abstraction** — the interface exposes the implementation's data structures, internal types, or assumptions. Callers must understand the implementation to use the interface correctly. The hidden body is not actually hidden.
- **The thin wrapper** — a module that exists to rename, re-export, or thinly adapt another module. Adds a layer of indirection without adding encapsulation.
- **The micro-module** — three files, four functions, one responsibility that should have lived inside a larger module. The boundary itself becomes the overhead.
- **The premature split** — taking a feature whose complexity could have been absorbed by an existing deep module and giving it its own module *just because it's new*. Splits cohesion without earning depth.

When a shallow module appears, the system pays the interface cost (boundaries, contracts, imports, indirection) without earning the encapsulation benefit. Shallow modules accumulate; the system becomes a sprawl of thin layers that hide nothing and force every change to thread through many files.

## The rule, in one sentence

> **Every new feature added during the build either lives inside an existing deep module, or constitutes a new deep module with a stated interface, stated hidden complexity, and a stated depth justification. There is no third option.**

This rule is non-negotiable. It applies to every work unit. It applies whether the work is greenfield or a follow-on. It applies whether the operator is in `lite`, `standard`, or `power` mode. It is enforced by the protocols (intake gate in `/wu-new`, architectural quality gate in `/build-wu`, audit by the reviewer) and by a Claude PreToolUse hook (`check-module-discipline.sh`) that blocks writes to source paths not claimed by any module.

## How to apply the rule when filing a work unit

When `/wu-new` runs, the operator is asked which module the work belongs to. Three answers are possible:

1. **"It belongs to module X (existing)."** Check that the WU's responsibility actually fits inside X's hidden complexity — not just that the file paths happen to overlap. If yes, the WU's `Module:` field is set to `X` and the work proceeds. The architecture file for X is updated if the WU adds new paths or surfaces.

2. **"It needs a new module Y."** The architect runs first, before the WU is filed. They produce a contract for Y: its small interface, its large hidden complexity, the depth justification. The new module is filed in `docs/build/architecture/Y.md`, the relevant contract(s) are filed in `docs/build/contracts/`, and only then is the WU filed with `Module: Y`.

3. **"I'm not sure — it could go in X or it could be Y."** This is the most common case and the most dangerous. Default to **fits inside X** until the architect explicitly justifies the split. The cost of an under-split module is rework; the cost of an over-split system is permanent shallow sprawl that compounds. The first error is cheap to fix, the second is not.

## How to apply the rule when designing

The architect's brief, for any work unit, must answer three questions before the coder spawns:

1. **Which module owns this?** Named, with a link to its architecture file.
2. **What does the interface look like after this change?** The new public methods/exports/routes — explicit, small, named.
3. **What complexity is hidden behind that interface?** The state, the branching, the external integrations, the edge cases the caller does not have to think about.

If the third answer is small relative to the second, the design is shallow. The architect must either fold the work into an existing deep module (so the new complexity joins existing hidden complexity) or expand the hidden body (more is genuinely encapsulated here) — never ship a shallow new module.

## How to apply the rule during implementation

The coder may not create a new top-level source directory unless a corresponding architecture file claims it under `## Paths claimed`. The PreToolUse hook enforces this. If the coder finds themselves wanting to create `src/foo/` mid-implementation, that is a signal — pause, route back to the architect, get the module filed (or get `foo/` claimed by an existing module) before the file is written.

This is friction by design. Most shallow modules are born from a coder's mid-flight decision to "just split this out." The hook makes that decision visible and routes it through the architect.

## How to apply the rule during review

The reviewer reads every change against three checks:

- **Did this work create a new module?** If yes, is the architecture file present, is the interface small, is the hidden complexity large, is the depth justification recorded?
- **Did this work extend an existing module?** If yes, does the extension actually live inside the module's hidden complexity — or is it leaking into the interface in a way that makes the module shallower than it was?
- **Did this work add code to an unclaimed path?** If yes, the hook should already have caught it; if it didn't, that's a hook gap to file.

A change that creates or worsens a shallow module is a `REQUEST CHANGES`, not an `APPROVE`. Speed of delivery is never an acceptable reason to ship a shallow module — see the no-shortcuts policy that already governs the architect's brief.

## Why this matters more than most architectural rules

Most architectural commitments can be re-evaluated when the situation changes. Module depth cannot. A shallow module ships interface contracts, file paths, imports, and tests that callers build against — un-splitting it later means rewriting all of them. By the time the cost of the wrong split is felt, the cost of fixing it is large enough that it never gets fixed. The shallow split becomes permanent.

So the discipline is **enforce at intake**, not at cleanup. The intake gate is the cheap moment. Every other moment is more expensive.

## Related

- The no-shortcuts policy (architect.md, build-wu.md) — shallow modules are a class of shortcut
- The design-it-twice rule (architect.md) — one of the two designs must explore folding into an existing module
- The module template (`../build/architecture/module-template.md`) — the contract every new module must fill in
- The module-discipline hook (`.claude/hooks/check-module-discipline.sh`) — the mechanical gate
