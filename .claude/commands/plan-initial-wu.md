---
description: Phase E of planning — file the first 5–10 work units ordered by dependency
---

# plan-initial-wu

You are running **Phase E of the planning arc** — Initial Work Units. The planning substrate is complete. Phase E translates the horizon map, architecture, and surfaces into the first set of concrete things to build.

By the end of this session:

- 5–10 work units are filed in `docs/build/work-units/`
- They are ordered by dependency: things that other things need are filed (and built) first
- Each work unit connects to at least one persona and one architecture module
- The Phase E row in STATE.md is flipped to `✅ complete`
- STATE.md names the first work unit as `🟡 in flight`
- `methodfile.json`'s `planning.completedAt` is set to today's date

This session takes about 60 minutes (longer in coaching mode, shorter in developer mode).

**Mode:** honour `methodfile.json`'s `operator.mode` per `docs/build/OPERATOR-MODES.md` (default `standard` if unset).

---

## Step 1 — Read the context (5 min)

Before starting, read:
- `docs/build/maps/02-phases.md` — the phases of work and what each milestone means
- `docs/build/maps/03-near-term.md` — what's immediately next
- `docs/build/architecture/` — the modules, for grounding each work unit
- `docs/build/personas/` — to connect each work unit to a real person

Open with:

> "We've got the architecture, the design system, and the map. Now let's break the first wave of work into concrete pieces. A work unit is one thing: a feature, a surface, an infrastructure step — whatever has a clear outcome you can check. We'll file between 5 and 10 of them. Each will have an outcome, a walkthrough, and a list of things to check to know it's done. We'll order them so the things everything depends on come first."

## Step 2 — Derive the first work units (30–40 min)

Ask:

> "Looking at what the near-term map says needs to happen first — what are the individual pieces? Don't list tasks; describe what will *exist and be usable* when each piece is done."

For each work unit, **switch to the `wu-new` protocol** (invoke `/wu-new` if available; otherwise read `wu-new.md` and follow it). This ensures each work unit is filed correctly with outcome, walkthrough, and acceptance criteria.

Between work units, check:

> "Does [this WU] depend on anything that isn't filed yet? If so, let's file that dependency first."

Aim for 5–10 work units covering the first meaningful phase of Map 2. Don't try to file the entire project — just enough that the swarm can start and the operator can see what's coming.

## Step 3 — Order by dependency (5–10 min)

When all work units are filed, look at the full set and ask:

> "Which of these can start right now with no dependencies? Which ones need something else to be done first?"

Update each work unit file with its dependency links. Update `docs/build/work-units/_index.md` statuses:
- Anything with unmet dependencies → `🔵 proposed`
- The first work unit with no unmet dependencies → `🟡 in flight`

If multiple work units have no dependencies, pick the one that unblocks the most. Mark that one `🟡 in flight`; leave the others `🔵 proposed` with a note that they can start in parallel.

## Step 4 — Run the planning arc review (required before closing)

Before Phase E can close, run the full planning arc review. This is not optional.

**Invoke `/plan-review`** (or read `.claude/commands/plan-review.md` and follow it). The review agent reads every artefact in the catalogue, then surfaces what's missing, unclear, inconsistent, or improvable — before a single line of code is written.

Do not proceed to Step 5 until:
- All blocker findings are fixed or explicitly escalated to the operator
- All other findings are either fixed, filed as open questions, or deferred with a stated reason

The review typically takes 10–20 minutes. It is the difference between a catalogue an agent can build against coherently and one that produces drift from the first spawn.

## Step 5 — Close

Update STATE.md (only after `plan-review` has completed): Phase E → `✅ complete (YYYY-MM-DD)`; "Active work unit" → first `🟡 in flight` WU handle + title; "What is currently in flight" → one sentence on what the swarm tackles first; refresh "Last updated". Set `methodfile.json` → `planning.completedAt` to today's ISO date.

Tell the operator: planning arc complete, [N] work units filed and ordered, [first WU title] is first. From here the loop is `/start-of-session` → work → `/end-of-session`; when ready to build, `/build-wu <handle>` runs the swarm. Then run `/end-of-session`.

---

## What to do if it goes off-track

- **Too many work units:** file the first 5–10 and stop. The rest can be filed in later sessions as Map 3 updates. Trying to file 30 work units in Phase E stalls the arc indefinitely.
- **Operator wants to skip work unit details:** at minimum get the outcome and 3 acceptance criteria. Without those, the coder has no brief. *"Just a sentence on what exists when it's done, and three yes-or-no checks. That's it."*
- **Operator wants to start building immediately:** let them. *"Run `/end-of-session` to commit what we have, then `/build-wu [first WU handle]`. The swarm can start with what we've filed."*
