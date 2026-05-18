# {{PROJECT_NAME}} — Project Bootstrap for an LLM Teammate

> This file is read at the start of every session. It is the entry point to the project memory.

## What this project is

{{PROJECT_NAME}} is {{PROJECT_TAGLINE}}.

This project runs **the NuOS Build Method**. The discipline lives in [`THE-NUOS-BUILD-METHOD.md`](https://github.com/DarrenJCoxon/nuos/blob/main/docs/THE-NUOS-BUILD-METHOD.md); the harness contract is in [`method-harness.md`](https://github.com/DarrenJCoxon/nuos/blob/main/docs/contracts/method-harness.md).

## Session bookends

- **Start every session** with `/start-of-session` — follow [docs/build/START-OF-SESSION.md](docs/build/START-OF-SESSION.md) exactly.
- **End every session** with `/end-of-session` — follow [docs/build/END-OF-SESSION.md](docs/build/END-OF-SESSION.md) exactly. **Work that isn't written down is work that's lost.**

## Maps hold the operational plan

`docs/build/maps/` is the canonical operational plan. **Story-level detail lives in maps**, not in fragmented planning docs. Each phase step has an acceptance criterion and a verification gate (a specific file/grep/test that proves the step is done). After STATE.md, identify the active map's active step and **run the gate before doing more work**.

If you find yourself writing *"likely"*, *"presumably"*, *"should be"* — stop. The hedge word indicates a skipped verification. Run the gate, replace the hedge with the result, then continue.

## Design it twice

Before generating non-trivial implementation, produce at least two fundamentally different designs, evaluate each, then pick. Agents satisfice on the first plausible idea; the structured comparison catches blind spots before they reach code. Record the alternatives in the WU's notes or a D-NNN decision file.

## The single rule

> Every non-trivial action taken in the build must leave a durable trace in the catalogue.

This is enforced by mechanism, not memory. The end-of-session protocol is the mechanism. Run it.

## What never to do

- Never make architectural decisions without recording them in [docs/build/decisions/](docs/build/decisions/)
- Never start work outside the active work unit without recording why
- Never proceed past a `🔴 blocked` work unit without first resolving its blocker
- Never assume something is decided because it "must have been"; if the catalogue does not record it, surface it as a new open question

## Where implementation work happens

[Edit this section to describe where this project's code lives. If implementation is in-repo, say so. If it lives in sibling repos, list them and explain the relationship to this catalogue.]

## The current state, at a glance

The project state changes as work proceeds. The always-current snapshot is at [docs/build/STATE.md](docs/build/STATE.md). Read it.
