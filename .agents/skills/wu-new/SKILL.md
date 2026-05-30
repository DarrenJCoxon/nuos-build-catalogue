---
name: wu-new
description: File a new work unit through a guided plain-English conversation
---

# wu-new

You are filing a new **work unit** for a project that uses the **NuOS Build Method catalogue**. A work unit is one concrete thing the project will build. The catalogue's value compounds as work units accumulate notes — every session adds to the record of what was attempted, what worked, what didn't, what was learned.

**Mode:** honour `methodfile.json`'s `operator.mode` per `docs/build/OPERATOR-MODES.md` (default `standard` if unset).

---

## Step 1 — Ask what kind of work unit this is

By default, walk the **simple shape** — four conversational questions. Use it for everyday product work. The full shape (13 fields, infrastructure language, contracts produced/consumed) is opt-in via `--full`; suggest it only if the operator is filing infrastructure work (build pipelines, publishing flow, refactors).

> "Quick check before we file this: is this one piece of user-facing work — a feature, a screen, an outcome someone will use — or is it infrastructure (a build pipeline, a refactor, a publish flow)?"

If user-facing → simple shape. If infrastructure → full shape.

## Step 2 — Walk the four-field simple shape (the default)

Ask in conversation; don't read out the four fields as a list. Weave them.

1. **Title** — *"In five words or so, what's this work unit about?"*
2. **Outcome** — *"What's true after this ships that isn't true now? Just a sentence."*
3. **Walkthrough** — *"Tell me a story. Walk me through what [persona name] does when this is in place. What do they see? What do they do? And what could go wrong — what if information's missing, or the system fails, or they make a mistake?"*
4. **How we'll know it's done** — *"List 3 to 6 things we could check to know this is done. Each one should be either yes or no — not 'better' or 'worse'."*

Also ask:

- **Which persona is this for?** Show them the list from `docs/build/personas/`. If none yet, file a persona first via `/persona-new`.

## Step 2.5 — Deep-module intake gate (mandatory, non-negotiable)

> **This gate is the most important step in `/wu-new`. It is the single mechanism that prevents shallow-module sprawl as a long-running build progresses. Do not skip it. Do not abbreviate it. See [docs/philosophy/deep-modules.md](../../starter-kit/docs/philosophy/deep-modules.md) for the doctrine.**

Before filing the work unit, the operator must declare which module owns it. List every entry in `docs/build/architecture/` (read the `_index.md` table) and ask:

> *"Which existing module does this work unit live inside? Here's what we've got: [list each module + one-line `What this module does` summary]. Or — does this need a new module?"*

**Three possible answers:**

1. **"It belongs to existing module X."** Read `docs/build/architecture/X.md`. Check that the WU's responsibility actually fits inside X's `Hidden complexity` — not just that file paths overlap. If yes, set `Module: X` in the WU. If the WU adds new source paths, also add them to X's `## Paths claimed` section in the same conversation.

2. **"It needs a new module Y."** STOP. Do not file the WU yet. Tell the operator: *"A new module needs an architect pass before this WU can be filed. Want me to walk through proposing module Y now — its interface surface, hidden complexity, depth justification — and file the architecture entry first? Then we file the WU against the new module."* On confirmation, run the architect through the new-module flow: produce `docs/build/architecture/Y.md` from `module-template.md`, populate every field including `Paths claimed`, then return here and file the WU with `Module: Y`.

3. **"I'm not sure — it could go in X or be its own thing Y."** This is the most dangerous case. Default to **fits inside X** and tell the operator why: *"Splitting too early creates a shallow module that's permanent; folding into X is reversible later. Let's put it in X. If three more WUs land there and a coherent sub-responsibility emerges, the architect can split it then."* Only override this default if the architect has explicitly justified the split in the conversation.

**Forbidden answers:**

- *"It's just a small utility / helper / shared bit."* — Util grab-bags are shallow modules by definition. Tell the operator: *"There's no `utils` module in this project by design — small bits live inside the module whose hidden complexity needs them. Which module's hidden complexity does this work serve?"*
- *"Let's figure it out during the build."* — The whole point of this gate is to decide upfront. Push back: *"The build agents need to know which module they're working inside before they start. Let's pick now — if it's wrong we can correct it before the coder spawns."*
- *"Skip this for now, we'll come back to it."* — There is no skipping. The WU does not get a number, does not get filed, until `Module:` is set.

**Set `Module:` in the WU file.** Both `001-template-simple.md` and `001-template-full.md` carry a `Module:` field in the header. The value is the architecture file slug (e.g., `auth`, `consolidation`, `morning-briefing`).

## Step 3 — Walk the full shape (only when --full or for infrastructure work)

The full shape has the four fields above plus:

- **Trigger** — the real-world event in someone's day that makes them need this
- **Contracts produced** — what this work unit makes available to other work units once it lands; in everyday language
- **Contracts consumed** — what must already be in place for this work unit to start
- **Dependencies** — other work units this depends on
- **Decision implemented** — D-NNN if this work unit realises a specific decision
- **Forward-compatibility commitments** — any choices made here that affect later work units

For infrastructure work, persona / trigger / walkthrough are marked `N/A — infrastructure work`.

## Step 4 — File the work unit

Before writing the file, check `methodfile.json`'s `techStack.defined`. If it's `false` or the field is absent, tell the operator: *"I notice the tech stack isn't defined yet — that normally happens during Phase A planning. Want to define it now, or shall I file an open question?"* Either way, continue filing the work unit. If `defined` is `true`, the acceptance criteria may reference the stack where relevant (e.g. *"renders correctly with Next.js App Router SSR"*).

1. **Number it.** Scan `docs/build/work-units/` and `docs/build/work-units/done/` for the highest existing 3-digit prefix; new number is max + 1.
2. **Slugify the title.** Lowercase; dashes for spaces; no special characters; cap at 60 chars.
3. **Write the file** at `docs/build/work-units/NNN-slug.md`. Use `001-template-simple.md` for the simple shape, `001-template-full.md` for the full shape.
4. **Add a row** to `docs/build/work-units/_index.md`. Status `🔵 proposed` if dependencies aren't met yet, otherwise `🟡 in flight` (if work is starting now) or leave `🔵 proposed` if it's queued.
5. **If a persona is cited**, update that persona's "Used by" list to include this work unit.

## Step 5 — Surface to the operator

Tell them in plain English:

- Where the file landed (clickable path)
- That the index was updated
- Anything you noticed during the conversation that's worth flagging (e.g. "this work unit and WU 007 both touch the morning briefing — they might depend on each other; do you want to link them?")
- The next concrete action

## What to watch for

Four quality issues come up during a work-unit conversation. Surface them gently, don't lecture:

- **Vagueness** — *"Could this be built in two different ways and both satisfy what you've said? Worth tightening?"*
- **Technical language slipping in** — *"You said 'an API endpoint that returns a JSON response' — what does the teacher actually see or do?"*
- **Only the happy path** — *"What happens if the data isn't ready, or they hit save twice?"*
- **Too big** — *"This feels like two work units to me. Want to split it?"*

The catalogue's strength is that the operator is in charge of the substance; the protocol just makes sure the substance gets captured properly.

---

## Why this matters

Work units are how the project's work compounds. A work unit filed today is a hook for a future session to add notes against, a contract for other work units to plug into, an entry in the project's audit trail. Sloppy work units rot. Sharp work units accumulate value.

If the operator wants to skip a question because the answer feels obvious, ask one more time gently — and then let them skip. The catalogue doesn't enforce content quality; it enforces *capture*. Captured-but-thin is better than not captured at all.
