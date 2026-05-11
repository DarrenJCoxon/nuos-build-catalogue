# Welcome — what this catalogue is, and how it works

You're looking at the **catalogue** for {{PROJECT_NAME}}. It's your project's memory. Read this once and you'll understand the whole shape. It takes five minutes.

## What the catalogue is for

A real project — one that handles real complexity — has more moving parts than anyone can hold in their head. Who's it for? What does each piece do? What did we decide last month? What are we still unsure about? What's at risk? Without a place to keep all of this, you end up rebuilding the same understanding over and over, every time you sit down to work, every time someone new joins, every time you open a fresh chat with an AI.

The catalogue solves that. Everything load-bearing about your project lives here in plain Markdown files, organised into ten **registers**. The catalogue stays current through two protocols — `/start-of-session` and `/end-of-session` — that run at the bookends of every period of work.

You don't have to remember any of it. The catalogue does.

## The principle that makes it work

**Project memory never drifts from project reality.** Every decision made in conversation gets saved before the session ends. Every change to an existing piece flows through a protocol that keeps the catalogue and its search index in sync. The pre-commit hook blocks silent edits to accepted decisions. The post-commit hook auto-refreshes the search index after every commit. The AI you're working with reads from the catalogue and writes back to it; what it finds when you ask "what did we decide about X?" is always current.

If anything ever feels out of date, that's a bug, not a feature. The repair is to file the missing piece before continuing.

## How the implementation work itself runs (the swarm)

Once planning is done and the first work units are filed, you don't sit through an Opus-priced conversation for every line of code. Each work unit becomes the input to a small **swarm** of specialised agents:

- An **architect** (Opus) designs the load-bearing structure
- One or more **coders** (Sonnet) implement
- A **tester** (Sonnet) writes tests against the acceptance criteria
- A **reviewer** (Sonnet) checks the output against the spec + the design system
- A **debugger** (Opus) traces failures if something breaks
- A **researcher** (Haiku) looks up library docs, API changes, error messages

Each role uses the model best matched to its work. Opus does the ~20% that needs deep reasoning (design and debugging); Sonnet handles the routine 80% (the coding + tests + review); Haiku handles fast lookups. Cost works out roughly 30% lower than running everything through Opus on real builds.

The agent definitions are installed automatically into `.claude/agents/` by `init`. Model routing lives in `methodfile.json` under `swarm.models` — overridable per project.

## How a project gets built

A project starts with a 5-phase **planning arc** the AI walks you through. Each phase is its own session. By the end of the arc, the catalogue has the substrate that makes everything downstream coherent. After that, work units feed into the swarm above.

1. **Orientation** (~30 min) — what is this project, who's it for. You'll describe the project in your own words and name 1-3 specific people it serves.

2. **Architecture & Contracts** (~60-90 min) — what are the major pieces, what does each one provide to the others. The shape of the system in everyday language.

3. **UI/UX + Design System** (~60-90 min) — every page, screen, modal, or command the user touches, plus the complete design system (colour, typography, spacing, components, patterns, voice, accessibility commitments) that every surface uses. End-to-end: a surface in `ui-ux/` references components in `design-system/`; a component carries tokens; tokens propagate everywhere. The system stays consistent as it grows because everything references one shared language.

4. **Maps** (~45 min) — the journey from now to done. Phases. What's happening this week, this month.

5. **Initial Work Units** (~60 min) — the first 5 to 10 concrete things to build, ordered by what depends on what.

After phase 5, you start building. Every session from then on follows the same shape: `/start-of-session` shows where you are, you work, `/end-of-session` writes down what just happened.

## The eleven registers

| Register | What lives here | Handle |
| --- | --- | --- |
| **personas/** | One file per specific person the project serves | P001, P002… |
| **maps/** | The horizon, the phases, the near-term plan | M001, M002, M003 |
| **architecture/** | What the major pieces are and how they relate | (per-module files) |
| **contracts/** | What each piece provides to the others | (per-contract files) |
| **ui-ux/** | Every user-facing surface (page, screen, command, email) | (per-surface files) |
| **design-system/** | The shared visual + interaction language every surface uses (tokens, components, patterns, voice) | (per-piece files) |
| **decisions/** | Choices made and not to be drifted from | D001, D002… |
| **open-questions/** | Things we haven't decided yet | Q001, Q002… |
| **work-units/** | Concrete things being built | WU 001, WU 002… |
| **risks/** | Things that could go wrong | R001, R002… |
| **sessions/** | A log of every period of work | one file per session |

The full vocabulary lives in [`GLOSSARY.md`](GLOSSARY.md). Read it once; come back when you need it.

## The three commands you need

Everything else is automatic.

```text
npx @nusoft/nuos-build-catalogue init   — once, when starting a new project
/start-of-session                       — every time you begin working
/end-of-session                         — every time you stop
```

`/start-of-session` reads where you are, what just happened, what's next, and surfaces any blockers. If this is the very first session on a fresh project, it routes you into the orientation phase of the planning arc.

`/end-of-session` writes down what was attempted, what worked, what didn't, what was learned. It commits. The catalogue's search index updates in the background.

That's it. The catalogue handles the rest.

## What never to do

- **Never close a session without `/end-of-session`.** Work that isn't written down is work that's lost.
- **Never edit an accepted decision file.** If something changes, file a new decision that supersedes the old one. The pre-commit hook will block silent edits.
- **Never make an architectural decision in conversation without filing it.** If the AI says "let's go with X" and you agree, file it as a decision *before moving on*. Drift is the failure mode that makes the catalogue worthless.

## Where to go from here

- **Brand new project?** Run `/start-of-session`. The AI will walk you through phase 1 of planning. By the end of today you'll have the project oriented.
- **Returning to existing work?** Same — `/start-of-session` reads STATE.md, the latest session log, and the active work unit. You'll be told where you are and what's next within a minute.
- **Want to look around first?** Open [`STATE.md`](STATE.md) for the current snapshot, [`maps/01-the-horizon.md`](maps/01-the-horizon.md) for the whole-project picture, or [`GLOSSARY.md`](GLOSSARY.md) for any term you don't recognise.
