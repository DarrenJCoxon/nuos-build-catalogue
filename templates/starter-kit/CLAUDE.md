# {{PROJECT_NAME}} — Project Bootstrap for an LLM Teammate

> This file is read at the start of every session. It is the entry point to the project memory.

## What this project is

{{PROJECT_NAME}} is {{PROJECT_TAGLINE}}.

This project runs **the NuOS Build Method** — see [the canonical strategic note](https://github.com/DarrenJCoxon/nuos/blob/main/docs/THE-NUOS-BUILD-METHOD.md) for the discipline, and [the harness contract](https://github.com/DarrenJCoxon/nuos/blob/main/docs/contracts/method-harness.md) for how the catalogue plugs into NuOS when wired.

## At the start of every session — always

Run the start-of-session protocol. The single command is:

> "Run start-of-session"

When asked to do this, follow [docs/build/START-OF-SESSION.md](docs/build/START-OF-SESSION.md) exactly. It will:

1. Read [docs/build/STATE.md](docs/build/STATE.md) — the always-current project snapshot
2. Read the most recent entry in [docs/build/sessions/](docs/build/sessions/)
3. Identify the active work unit and read it in full
4. Surface any blocking open questions or risks
5. Confirm the state and propose the next concrete action

## At the end of every session — always

Run the end-of-session protocol. The single command is:

> "Run end-of-session"

When asked to do this, follow [docs/build/END-OF-SESSION.md](docs/build/END-OF-SESSION.md) exactly. It will:

1. Update the active work unit's notes with what was done
2. Update [docs/build/STATE.md](docs/build/STATE.md) to reflect current state
3. Write a new session log entry in [docs/build/sessions/](docs/build/sessions/)
4. Update any decisions, open questions, or risks that emerged
5. Update the relevant `_index.md` files
6. Verify nothing is lost

If a session ends without the end-of-session protocol being run, work may be lost. Always run it.

## The canonical operational plan lives in maps

The `docs/build/maps/` directory holds the canonical operational plan for this project. **Story-level detail lives in maps**, not in fragmented planning docs. Each phase step in a map has an acceptance criterion and a verification gate (a specific file/grep/test in the target repo that proves the step is done).

When a session starts, after reading STATE.md, identify the active map and read the active phase step. The verification gate names exactly what to run to know whether the step is complete. **Run the gate before doing more work.**

If you find yourself writing *"likely"*, *"presumably"*, *"should be"* in code or planning text, **stop**. The hedge word indicates a verification step was skipped. Run the gate, replace the hedge with the result, then continue.

**Before generating non-trivial implementation, produce at least two fundamentally different designs, evaluate each, then pick.** This is Ousterhout's "design it twice" applied to agent-led work. Agents satisfice on the first plausible idea; the structured comparison is what catches blind spots before they reach code. Record the alternatives in the WU's notes (or a D-NNN decision file).

These are two of the five agentic-age patterns codified in [`THE-NUOS-BUILD-METHOD.md`](https://github.com/DarrenJCoxon/nuos/blob/main/docs/THE-NUOS-BUILD-METHOD.md) §post-Phase-3 epistemic discipline. The discipline isn't borrowed from agile; it's shaped for the specific failure modes of LLM-driven building.

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
