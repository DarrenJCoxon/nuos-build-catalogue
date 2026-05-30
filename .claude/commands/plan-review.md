---
description: End-to-end planning review — surfaces gaps, inconsistencies, and optimisations before building starts
---

# plan-review

You are running the **planning arc review** — a full end-to-end audit of everything the planning arc produced before a single line of code is written.

This runs automatically at the end of Phase E. It can also be invoked at any point mid-project (e.g. after a significant pivot, after adding a new persona, or when something feels off) with `/plan-review`.

**Mode:** honour `methodfile.json`'s `operator.mode` per `docs/build/OPERATOR-MODES.md` (default `standard` if unset). The audit is exhaustive regardless of mode; only how findings are reported back changes.

By the end of this protocol:

- Every gap, ambiguity, inconsistency, and optimisation opportunity in the planning catalogue has been surfaced
- Each finding is either fixed immediately, filed as a Q-NNN open question, or explicitly deferred with a reason
- The operator has confirmed the catalogue is complete enough to build against
- Nothing unclear is hiding in the planning artefacts where an agent will silently make a wrong assumption

---

## Step 1 — Read the entire catalogue (do not skip anything)

Before spawning the review agent, read every artefact produced by the planning arc:

- `methodfile.json` — project metadata, tech stack, planning state
- `docs/build/STATE.md` — current snapshot
- All files in `docs/build/personas/` (not just `_index.md` — every persona file)
- All files in `docs/build/architecture/`
- All files in `docs/build/contracts/`
- All files in `docs/build/ui-ux/`
- All files in `docs/build/design-system/` (tokens, components, patterns, voice, accessibility)
- All files in `docs/build/maps/`
- All files in `docs/build/work-units/`
- All files in `docs/build/decisions/`
- `docs/build/open-questions/_index.md`
- `docs/build/risks/_index.md`

Also run the cross-agent memory search for any prior findings about this project:

```bash
nuos-catalogue memory search --query="planning gaps"
nuos-catalogue memory search --query="open questions"
```

## Step 2 — Spawn the review agent

Spawn an **architect** agent (Opus) with this exact brief:

> You are reviewing the complete planning catalogue for **[project name]** before any implementation begins. Your job is to find what's missing, unclear, inconsistent, or improvable — so the agents that build this project have a complete, coherent brief to work from.
>
> Read every artefact provided below (personas, architecture, contracts, UI/UX surfaces, design system, maps, work units, decisions, open questions).
>
> Then run end to end through the entire project planning. Consider:
> - **User journeys**: does the catalogue trace every complete path a user takes through the product? Are any paths incomplete, ambiguous, or contradictory?
> - **Expectations and pain points**: do the personas clearly describe what users expect and what frustrates them? Would an agent reading these personas build something the real user would recognise?
> - **Expected outcomes**: for each work unit, is the outcome unambiguous? Could two different agents read the same work unit and produce different things?
> - **User experience**: does the design system actually govern the surfaces? Do the surfaces reference components that exist? Are there surfaces with no clear design language?
> - **Every route**: are there user paths implied by the architecture that have no corresponding surface? Are there surfaces with no clear entry point?
> - **Every journey**: does every persona have at least one complete journey through the product — from entry to outcome?
> - **Every reason this tool will be used**: have all use cases been captured? Are there obvious use cases implied by the personas that have no work units?
> - **Cross-artefact consistency**: do contracts match what modules claim to provide? Do work units reference personas and modules that exist? Do surfaces reference design-system components that are filed?
>
> Return your findings structured as four lists:
>
> **MISSING** — things the catalogue should contain but doesn't (e.g. a surface with no empty state, a persona with no journey, a module with no contract)
>
> **UNCLEAR** — things that are present but need more definition before an agent can act on them (e.g. an acceptance criterion that isn't binary, a design token with no stated value, a contract that says "appropriate response" without defining what appropriate means)
>
> **GAPS** — inconsistencies between artefacts (e.g. a work unit that consumes a contract that doesn't exist, a surface that uses a colour token not in the design system, an architecture module that nothing depends on and nothing depends on it)
>
> **OPTIMISE** — things that are present and correct but could be improved to produce better agent output (e.g. a persona that has seven dimensions but no acid-test scenario, a work unit with three acceptance criteria where five would give the tester better coverage, a map phase with no verification gate)
>
> For each finding: state what it is, which artefact it's in, and what specifically needs to change or be added. Be precise — vague findings produce vague fixes.

Pass the full contents of every artefact as context. Do not summarise the artefacts — pass the full text.

## Step 3 — Triage the findings with the operator

When the review agent returns, surface the findings in plain English grouped by list. For each finding:

1. Read it to the operator in plain language
2. Ask: *"Fix it now, file it as an open question to address before we build, or defer it with a reason?"*
3. Execute immediately:
   - **Fix now**: make the change to the relevant artefact, show the operator
   - **Open question**: file as Q-NNN in `docs/build/open-questions/`, add to `_index.md`
   - **Defer**: note the reason in the relevant artefact's file (so the next agent to read it knows the gap was seen and deliberately left)

Do not let findings disappear into conversation. Every finding must land somewhere in the catalogue before the review closes.

If the review agent surfaces more than 10 findings, group them by severity before presenting:
- **Blockers** (MISSING or GAPS that would cause an agent to build the wrong thing) — address these before any building starts, no exceptions
- **Non-blockers** (UNCLEAR or OPTIMISE items that would improve quality but don't break the brief) — can be filed as Q-NNN and addressed in the first building sessions

## Step 4 — Store the review

After all findings are triaged, store a summary in cross-agent memory:

```bash
nuos-catalogue memory store \
  --value="Planning review complete: [N] findings — [N] fixed, [N] filed as open questions, [N] deferred. Key issues: [one sentence summary of the most significant findings]" \
  --agent=coordinator \
  --key="planning-review"
```

Write a brief review entry to the current session log (it will be captured by `/end-of-session`).

## Step 5 — Surface the result to the operator

> "Planning review done. Here's what we found:
>
> - **[N] blockers** — [summary / "none"] 
> - **[N] clarifications** — [summary / "none"]
> - **[N] optimisations** — [summary / "none"]
>
> [If blockers were fixed]: Fixed [N] things in the catalogue directly.
> [If open questions were filed]: Filed [N] open questions — these will surface in `/start-of-session` when we start building.
> [If deferred]: Deferred [N] items — noted in the relevant artefacts.
>
> The catalogue is [complete and clear to build against / has [N] open questions that should be resolved in the first session before the swarm starts]."

Return control to whatever invoked this protocol (typically `plan-initial-wu`, which will then proceed to close Phase E).

---

## If invoked standalone (mid-project)

When `/plan-review` is called outside of the planning arc close — e.g. after a significant pivot, after a new persona is added, or when something feels off — run Steps 1–5 above, then:

- Do not update planning progress in STATE.md (Phase E may already be complete)
- Do update STATE.md's "What is currently in flight" and "Last updated"
- Run `/end-of-session` to commit the findings and any fixes

---

## What never to do

- **Never skip the full catalogue read.** A review based on summaries misses cross-artefact inconsistencies — which are the most damaging class of gap.
- **Never let a finding sit in conversation.** If it's not filed or fixed before the review closes, it's lost.
- **Never block building on OPTIMISE findings.** These are improvements, not prerequisites. File them, continue.
