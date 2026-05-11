# Glossary

Every term this catalogue uses, defined once in plain English. If you see a term you don't recognise in any file, this is where to look.

## Acceptance Criteria

How you'll know a piece of work is done. A short list — usually 3 to 6 lines — where each line is something you can check by looking. Each should be either yes or no, not "better" or "worse". Often abbreviated **AC**.

> Example: "When a teacher opens the morning briefing, they see their three highest-need students at the top of the screen."

## Architecture

The big pieces of your project and how they fit together. Filed in `architecture/`. Different from contracts: architecture is about *what the pieces are*; contracts are about *what they exchange*.

## Catalogue

This whole folder — `docs/build/` — and everything in it. It's your project's memory: who it's for, what's built, what's been decided, what's still unknown. The catalogue is updated at the start and end of every session so future-you (or anyone joining) can pick up without needing to be told.

## Drift (and why we never let it happen)

Drift is when the project's reality diverges from what the catalogue says. Someone makes a decision in conversation and forgets to file it. Someone changes their mind about a persona but the persona file still says the old thing. Two weeks later a new contributor reads the catalogue, builds against what it says, and the work is wrong.

**The no-drift rule is the catalogue's load-bearing commitment.** Every decision made in conversation gets saved to the catalogue before the session ends. Every change to an existing artefact flows through the protocol that keeps the catalogue and its search index in sync. The pre-commit hook blocks modifications to accepted decisions (so you can't edit them silently — you have to file a superseding decision and link forward). The post-commit hook auto-refreshes the search index after every commit, so what the AI finds when you ask "what did we decide about X?" is always current.

If the AI is asked something and the answer would normally come from project memory but the memory hasn't captured something said in conversation, **the AI should pause the conversation and file the missing artefact first**, then resume. Drift isn't a small problem; it's the failure mode that makes the whole catalogue worthless.

## Contract

What a piece of your project guarantees it will provide to other pieces, and what it expects from them in return. Filed one per major piece, in `contracts/`. Written in everyday language — "facts about the world the system now knows" — not database tables or API endpoints.

> Example: "Overnight Consolidation contract — produces a per-student plan for tomorrow, ranked by need. Consumes today's record of every interaction with that student."

## Decision

A choice that's been made and shouldn't drift. Filed in `decisions/` as **D001**, **D002**, etc. Once a decision is accepted, it doesn't get edited — if circumstances change, file a new decision that supersedes the old one and link forward. Decisions are the project's load-bearing commitments.

> When to file one: when you're choosing between two reasonable approaches; when you're adopting a constraint future work must honour; when you're overriding something previously decided.

## Design System

The shared visual and interaction language every part of the user-facing project uses. Filed in `design-system/`. Includes:

- **Tokens** — colour, typography, spacing, radius, shadow, motion — the smallest atomic units
- **Components** — the buttons, inputs, cards, modals, navigation elements; each with its variants, states, and accessibility commitments
- **Patterns** — how components combine into recurring layouts (forms, lists, page templates)
- **Voice & tone** — how the project speaks in writing (microcopy, error messages, empty states)
- **Accessibility commitments** — what the project promises (e.g. AA contrast minimum, keyboard-navigable, screen-reader-tested)

The design system is end-to-end: every per-surface file in `ui-ux/` references it; every implementation in code consumes it. Changes to design tokens propagate everywhere automatically, so the system stays consistent as it grows.

## Handle

The short identifier for any catalogue item: **WU 001**, **D012**, **Q003**, **P002**, **R005**, **M003**. Letters identify the register (Work Unit, Decision, Open Question, Persona, Risk, Map). Numbers run sequentially as items are filed.

## Map

A picture of where the project is going. Three of them by default:

- **Map 1 — The Horizon**: the whole journey in plain language, written once and updated only when the destination changes
- **Map 2 — Phases in Detail**: what each phase delivers, with entry and exit conditions
- **Map 3 — The Near-Term Plan**: what's happening this week or this month

Filed in `maps/`.

## Open Question

Something the project hasn't decided yet but might need to. Filed in `open-questions/` as **Q001**, **Q002**, etc. When an open question gets resolved, it becomes a Decision (or it becomes obvious and gets closed). The open-questions register is where uncertainty lives until it's ready to settle.

## Outcome

What's true after a piece of work ships that wasn't true before. Written as one sentence. The single-sentence test: *can you say what changed in the world?*

> Example: "Teachers can see tomorrow's high-priority students before they go home tonight."

## Persona

One specific person the project serves. Not a market segment ("teachers"), not a demographic ("women aged 30-50") — one person with a name and a situation. Personas are first-class because everything downstream — work units, UI/UX surfaces, contracts — hangs off who specifically you're building for. Filed in `personas/` as **P001**, **P002**, etc.

The seven dimensions of a persona: identity, reality (where they are when they need this), psychology, trigger (what brought them here), history, success (what done looks like for them), constraints (what they cannot or will not do).

## Risk

Something that could go wrong and would matter if it did. Filed in `risks/_index.md`. Severity scale:

- **High** — blocks work or threatens a decision
- **Medium** — would slow things materially
- **Low** — worth tracking; not blocking

## Session

A period of focused work — could be an hour, could be an afternoon. Each session starts with `/start-of-session` (which shows you where the project is) and ends with `/end-of-session` (which writes down what just happened). Filed in `sessions/`, one entry per session.

## Surface

A piece of the user-facing experience. A page, a screen, a modal, a command-line prompt, an email the user receives — anything they see or interact with. Each surface gets its own file in `ui-ux/`. Different from a screen mockup: a surface file says *who uses it, what they see, what they do, what happens next, which contracts it touches.*

## Swarm

A set of specialised AI agents working in parallel on the same work unit, each playing a different role (architect, coder, tester, reviewer, debugger, researcher). The architect designs; the coder implements; the tester writes tests; the reviewer checks against the spec; the debugger traces failures when work breaks; the researcher looks things up. Each role uses the model best matched to its work — **Opus** for design + debugging (the reasoning-heavy ~20%), **Sonnet** for coding + tests + review (the 80%), **Haiku** for online research + lookups.

The cost win is real but moderate (~30% lower spend than running everything through Opus, with current pricing). The bigger win is that each agent stays narrow and focused — the coder isn't redesigning mid-flight, the reviewer isn't writing patches, the architect isn't getting buried in implementation detail.

Swarms are invoked via `/build-wu <handle>` — the coordinator reads the work unit, classifies it (design-only / implementation / full-feature / bug-fix / research-first), spawns the right agents in the right sequence, aggregates results, files an audit entry in `swarm/`, and reports back. Agent definitions live in `.claude/agents/` (installed by `init` and `install-protocols`). Default model routing lives in `methodfile.json` under `swarm.models` and can be overridden per-spawn.

## Swarm run

A single execution of `/build-wu` against one work unit. Filed in `swarm/` as `YYYY-MM-DD-wu-<handle>.md` with the audit detail: classification, decomposition, each agent spawned (role + model + input + output), final outcome, estimated cost, and any decisions/questions/risks that surfaced.

The swarm register is the cost-auditability layer. Sort by cost to see which work units have been expensive; read recent runs to see how the swarm is performing over time; find escalation patterns clustered around specific modules (they indicate contracts that need sharpening).

## Tier (model)

A swarm agent's compute budget. Three tiers:
- **Opus** — the most capable Claude model; reserved for design decisions, strategic choices, and debugging (where reasoning is load-bearing)
- **Sonnet** — the default for coding, tests, and review; capable enough for the 80% of build work; substantially cheaper than Opus
- **Haiku** — fastest and cheapest; suitable for lookups, research, summarisation — work where recall + scan matter, not deep reasoning

## Trigger

The real-world event that makes someone need an outcome. Not a UI interaction — the moment in the persona's day or week that creates the need.

> Example trigger for a teacher persona: "It's 4pm on a Tuesday. The teacher is finishing up. Tomorrow's class includes three students with high SEN needs and one new arrival." That's the trigger. "Clicking the planning button" is not.

## UI/UX

Short for "user interface and user experience". The catalogue treats UI/UX as a first-class register at `ui-ux/`. One file per surface (see above). Captures the user-facing shape of the project: what people see, what they do, what happens.

## Walkthrough

A story of what happens, told from the persona's perspective. Numbered steps describing what they do, what they see, what happens next. Walkthroughs include failure paths — what happens if information is missing, if they make a mistake, if the system fails, if they need to come back tomorrow. Walkthroughs are how outcomes get checked: if you can walk through the persona's day with this in place, you understand what you're building.

## Work Unit

One concrete thing the project will build. Filed in `work-units/` as **WU 001**, **WU 002**, etc. Each has a title, an outcome, a walkthrough, and acceptance criteria. Often abbreviated **WU**. Work units are the unit of progress — when one is done, something has changed in the world.

> When to file one: when you're about to start work that you'll want to track. The catalogue's value compounds with accumulated work-unit notes — every session adds to the record of *what was attempted, what worked, what didn't, what was learned.*
