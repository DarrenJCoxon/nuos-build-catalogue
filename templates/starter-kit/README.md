# NuOS Catalogue Starter

> A copy-this-and-go template for any project adopting **the NuOS Build Method**. Unzip into a fresh project, replace the `{{PROJECT_NAME}}` placeholders, commit, and the project is harness-ready. The starter kit gets you to a healthy catalogue in under thirty minutes; from there, the build pack `build-pack-nuos-method` (when it ships per WU 049) can wire up the NuOS runtime harness.

## What this is

The NuOS Build Method is described in [`nuos/docs/THE-NUOS-BUILD-METHOD.md`](https://github.com/DarrenJCoxon/nuos/blob/main/docs/THE-NUOS-BUILD-METHOD.md). The method requires a structured catalogue: decisions, work units, sessions, risks, open questions, plus protocols for starting and ending every session.

This starter kit is the **catalogue scaffold** — the directory tree, the template files, the `methodfile.json` manifest, and the protocols pre-populated with sensible defaults. It is the static, copy-and-edit form of a NuOS-method catalogue.

The starter kit is *not* the harness. The harness is when NuVector indexes the catalogue, NuFlow runs the protocols, and NuWiki compiles the snapshots. Until you wire the harness, the catalogue runs on operator discipline and an LLM teammate. That is sufficient for a small team running the method on its own; harnessing comes when scale demands it.

## What's in here

```
.
├── README.md                          # this file
├── methodfile.json                    # the manifest the harness reads
├── CLAUDE.md                          # session-start instruction for an LLM teammate
└── docs/
    ├── philosophy/                    # the project's architectural commitments — narrative
    │   └── _index.md
    ├── contracts/                     # type-stable surfaces — what each part of the project promises
    │   └── _index.md
    ├── guides/                        # the persuasion layer — investor, customer, partner-readable
    │   └── _index.md
    └── build/
        ├── STATE.md                   # always-current snapshot — read this first every session
        ├── START-OF-SESSION.md        # the protocol — every session starts by following this
        ├── END-OF-SESSION.md          # the protocol — every session ends by following this
        ├── maps/                      # the canonical operational plan(s) — story-level detail with verification gates
        │   ├── _index.md
        │   └── 01-template.md
        ├── decisions/
        │   ├── _index.md
        │   └── D001-template.md
        ├── work-units/
        │   ├── _index.md
        │   └── 001-template.md
        ├── sessions/
        │   ├── _index.md
        │   └── 0000-00-00-template.md
        ├── risks/
        │   └── _index.md
        └── open-questions/
            └── _index.md
```

## Epistemic discipline — the central commitment for agent-led building

Method note (post-Phase-3 evolution; see [`THE-NUOS-BUILD-METHOD.md`](https://github.com/DarrenJCoxon/nuos/blob/main/docs/THE-NUOS-BUILD-METHOD.md)). The catalogue's discipline isn't borrowed from agile — it's shaped for the specific failure modes of LLM-driven building. The five load-bearing patterns:

1. **Verification gates anchored in target-repo files** (in maps; per phase step) — exact targets so the agent can't generate plausible-looking work that misses reality
2. **Maps as single canonical plan** — single entry point so the agent (or fresh session) can't act on partial context
3. **Contracts as immutable truth** — fixed reference points that turn agent reasoning into citation rather than improvisation
4. **Hedge words as stop signal** — "likely", "presumably", "should be" indicate a verification step was skipped; replace with the grep/test/file-read result before the work ships
5. **Design alternatives before implementation** — Ousterhout's "design it twice"; for any non-trivial architectural choice, produce at least two fundamentally different designs, evaluate, then pick (or hybrid) before generating implementation. Agents satisfice on the first plausible idea; structured comparison catches blind spots before they reach code

These appear throughout the catalogue. The maps directory is where (1), (2), and (5) are concretely enforced. Pattern (3) is enforced by `docs/contracts/`. Pattern (4) is enforced by the operator's discipline + memory rules.

## How to adopt — the thirty-minute path

1. **Copy the tree** into your project's repo. Either paste these files directly into a fresh project root, or use this directory as a git template.

2. **Replace the placeholders.** Search-and-replace across the tree:
   - `{{PROJECT_NAME}}` — your project's name (e.g., "Acme")
   - `{{PROJECT_TAGLINE}}` — one-sentence description
   - `{{PROJECT_DOMAIN}}` — the domain you're working in (e.g., "education", "healthcare")
   - `{{PROJECT_ROLE}}` — `consumer` if you're building on top of NuOS; `standalone` if you're using the method without the trifecta
   - `{{TODAY}}` — today's date in `YYYY-MM-DD` format

3. **Commit the catalogue.** Single first commit. Use the message:
   ```
   Adopt the NuOS Build Method — catalogue scaffold in place
   ```

4. **Write your first decision.** Open `docs/build/decisions/D001-template.md`, rename it to match your first real architectural commitment (e.g., `D001-we-are-building-on-postgres.md`), fill it in. Update `docs/build/decisions/_index.md`.

5. **Write your first work unit.** Open `docs/build/work-units/001-template.md`, rename it (e.g., `001-postgres-schema-bootstrap.md`), fill it in. Update `docs/build/work-units/_index.md`.

6. **Update STATE.md.** Replace the placeholder content with your project's actual current state (Phase 0, no work units shipped, first decision in flight).

7. **Run the start-of-session protocol.** Tell your LLM teammate: *"Run start-of-session"*. It should read STATE.md, the most recent session log, and the active work unit. (At first start, there is no session log — the protocol notes that and prompts for the first one.)

8. **Do work, then run end-of-session.** When you stop, tell your LLM teammate: *"Run end-of-session"*. It will write a session log entry, update STATE.md, update the work-unit notes, and update the relevant `_index.md` files.

That is the loop. Every session opens with start-of-session. Every session closes with end-of-session. The catalogue accumulates. Nothing is lost.

## What you do not need to do

- **Do not write a `philosophy/` document on day one.** The philosophy emerges as you commit decisions. By decision 10, patterns are clear; that is when the philosophy doc becomes worth writing.
- **Do not write `contracts/` documents on day one.** Contracts are how stable surfaces communicate. Until you have stable surfaces, you have no contracts to write.
- **Do not write guides on day one.** Guides are the persuasion layer; you write them when you need to persuade somebody (an investor, a customer, a regulator). Until then, they're empty `_index.md` files.

The catalogue's strength is that it grows as you need it. Day one is just the scaffold and the first decision and the first work unit. That is enough.

## When to wire the harness

When the catalogue gets big enough that grep starts being slow, when manual maintenance of STATE.md drifts, when the project starts producing confidential material that needs role-aware redaction — that is the moment to wire the NuOS runtime harness. The thresholds are roughly:

- **NuVector** when the catalogue has more than 50 entries (decisions + WUs + session logs combined)
- **NuFlow** when the protocols are being run more than once a day (multiple operators or multiple sessions per day)
- **NuWiki** when STATE.md is being hand-edited and is drifting from reality
- **The deidentifier subsystem** from day one if your domain is regulated (clinical, legal, statutory)

The build pack `build-pack-nuos-method` (per WU 049 in the NuOS catalogue) automates the wiring when it ships. Until then, the markdown-only catalogue is fully functional — the method works without the harness; the harness just makes it scale.

## License

[choose a license — MIT or Apache-2.0 are typical]

## Pointers

- [The NuOS Build Method — durable strategic note](https://github.com/DarrenJCoxon/nuos/blob/main/docs/THE-NUOS-BUILD-METHOD.md) — what this kit operationalises
- [The Method Harness contract](https://github.com/DarrenJCoxon/nuos/blob/main/docs/contracts/method-harness.md) — how the catalogue plugs into NuOS
- [NuOS itself](https://github.com/DarrenJCoxon/nuos) — the worked example; every claim the method makes is demonstrated by NuOS's own catalogue
