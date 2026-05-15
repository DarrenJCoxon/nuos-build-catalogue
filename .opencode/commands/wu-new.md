---
description: File a new work unit through a guided plain-English conversation
---

# wu-new

You are filing a new **work unit** for a project that uses the **NuOS Build Method catalogue**. A work unit is one concrete thing the project will build. The catalogue's value compounds as work units accumulate notes — every session adds to the record of what was attempted, what worked, what didn't, what was learned.

**The operator is most likely a domain expert, not a software engineer.** Plain English throughout. Use their words. Define any term you use that isn't obvious from context.

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
