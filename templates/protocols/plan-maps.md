# plan-maps

You are running **Phase D of the planning arc** — Maps. The catalogue now has architecture, contracts, surfaces, and a complete design system. Phase D maps the journey from here to done: the major phases of work, what the world looks like at each milestone, and what is actually happening in the near term.

By the end of this session:

- Map 2 ("Phases of work") is filed at `docs/build/maps/02-phases.md`
- Map 3 ("Near-term plan") is filed at `docs/build/maps/03-near-term.md`
- Each phase in Map 2 has a clear acceptance criterion and a verification gate
- The Phase D row in STATE.md is flipped to `✅ complete`

This session takes about 45 minutes. **The operator is most likely a domain expert, not a software engineer.** Plain English throughout.

---

## Step 1 — Read the context (5 min)

Before starting, read:
- `docs/build/maps/01-the-horizon.md` — the destination
- `docs/build/work-units/` — any work units already filed (unlikely at this stage, but check)
- `docs/build/open-questions/_index.md` — any blockers that might affect the timeline

Open with:

> "We've got the destination, the architecture, and the full design language. Now let's draw the path. Not hour-by-hour detail — the major stages from here to there, what's done at each milestone, and what we're actually working on this week or next. Two maps: one for the whole journey, one for right now."

## Step 2 — Map 2: Phases of work (20–25 min)

Ask:

> "If you look at the project from start to shipped — what are the major stages? Most projects have three to six. Think about it in terms of what becomes *possible* at each stage, not the tasks inside each stage."

For each stage the operator names, ask:

1. *"What's true when this stage ends that wasn't true when it started? What can you demonstrate?"* (→ acceptance criterion)
2. *"How would you verify that? Is there something you can run, click, or show?"* (→ verification gate — a specific test, URL, command, or file that proves the stage is done)

**Write each phase as a row before moving to the next one.** The map should read as a narrative — a story of progress — not a task list. Use the template at `docs/build/maps/02-template.md`.

After all phases are named, ask:

> "Does every phase lead naturally to the next? Are there hidden dependencies — places where Phase [N] actually needs something from a later phase?"

Write the final map to `docs/build/maps/02-phases.md`. Show the operator.

## Step 3 — Map 3: Near-term plan (10–15 min)

Ask:

> "Zooming in — what's actually happening right now, or what will be once we file the first work units in Phase E? What's the first concrete thing that needs to exist?"

Write Map 3 to `docs/build/maps/03-near-term.md` using `docs/build/maps/03-template.md`. This map is intentionally short-horizon and will be updated frequently. It should name:

- What is actively being built (or will be, once Phase E files work units)
- What is immediately next
- Any blocker standing between now and the first shipped thing

## Step 4 — Close (5 min)

Update STATE.md:
- Phase D row → `✅ complete (YYYY-MM-DD)`
- Phase E row → `🟡 next`
- Refresh "Last updated"

Tell the operator:

> "The maps are in:
>
> - **Map 2** — the full journey from here to done, with acceptance criteria and verification gates per stage
> - **Map 3** — what's happening right now and what's immediately next
>
> Next session: **Phase E — Initial Work Units** (~60 min). We'll file the first 5–10 concrete things to build, ordered by dependency. After that, the planning arc is done and the swarm can start.
>
> Run `/end-of-session` to commit everything."

Then run `/end-of-session`.

---

## What to do if it goes off-track

- **Operator wants to list individual tasks inside phases:** redirect to the outcome shape. *"Let's keep each phase as a destination — what's true, not what's done. The tasks inside each phase become work units in Phase E."*
- **Operator can't name an acceptance criterion:** help them think from the outside in. *"Imagine showing this stage to someone who's been away for a month. What do you show them? What can they do that they couldn't before?"*
- **No verification gate comes to mind:** that's a signal the phase boundaries are fuzzy. Tighten the acceptance criterion until a gate becomes obvious.
- **Operator wants to skip Phase E and start building:** suggest Phase E first. *"Phase E is short — 60 minutes to file the first work units. After that, we know exactly which work unit is first and the swarm can start with a precise brief rather than 'build the project'."*
