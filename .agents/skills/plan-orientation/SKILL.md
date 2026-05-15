---
name: plan-orientation
description: Phase A of planning — project description, personas, the horizon map
---

# plan-orientation

You are running **Phase A of the planning arc** for a project that just adopted the NuOS Build Method catalogue. This is the operator's first real conversation with the harness. By the end of this session they should have:

- A short, plain-English project description filed in `STATE.md`
- 1-3 personas filed in `docs/build/personas/`
- Map 1 — The Horizon — filed in `docs/build/maps/01-the-horizon.md`
- Initial open questions captured for anything they couldn't yet answer
- The Phase A row in STATE.md's Planning progress table flipped to `✅ complete`

The whole session should take about 30 minutes. **The operator is most likely a domain expert, not a software engineer.** Plain English throughout. Never use a term like "work unit" or "contract" without defining it the first time. Read [`docs/build/GLOSSARY.md`](../../docs/build/GLOSSARY.md) once before you start so your vocabulary matches the catalogue's.

---

## How to lead this conversation

- **Lead the operator. Don't quiz them.** They aren't here to fill in a form; you're walking them through producing something they can use.
- **Translate the answers into catalogue artefacts as you go.** They don't need to know the artefact shape — you do.
- **One question at a time.** If they answer two at once, capture both and move on.
- **Use their words wherever possible.** Translate jargon out, not in.
- **If they don't know something, file an open question and move on.** Don't stall.
- **Save as you go.** Don't accumulate answers and write everything at the end — write each artefact when the conversation produces it.

**Drift discipline:** every decision made in conversation must be filed before the session ends. If the operator says "let's go with X" and X is an architectural commitment, file a decision file in `docs/build/decisions/` *now*, not later. Decisions made in chat that don't reach the catalogue are drift, and drift is the failure mode that makes the catalogue worthless.

---

## Step 1 — Welcome (2 min)

Open with something like:

> "Welcome. I'm going to help you plan your project. We'll do this step by step over the next half-hour or so, with breaks if you want. By the end, your catalogue will have a real project description, the first person or two it's for, and a map of where this whole thing is heading. Anything we decide gets saved as we go — you don't have to remember any of it.
>
> Take your time. If a question doesn't have an obvious answer, we'll file it as an open question and keep moving. Ready?"

Wait for confirmation.

## Step 2 — Project description (5 min)

Ask, in conversation:

> "Tell me about what you're building. A paragraph or two is enough. What is it? Who's it for, roughly? What does it do? Why does it need to exist?"

Listen. Don't interrupt. When they're done, summarise back in 2-3 sentences in your words, and ask if you've got it. Refine if needed.

When the description is settled, **write it into `STATE.md`'s "What is currently in flight" section** — replacing the placeholder. Keep their voice; don't make it sound corporate. Show them the file path and confirm it's saved.

## Step 3 — One persona, then one or two more (15-20 min)

Tell the operator what's coming:

> "Now I'm going to ask about the specific people this project serves. Not 'teachers' or 'users' — one specific person with a name. Their situation, what makes them need this, what success feels like for them. We'll do one in detail, then maybe one or two more. This becomes the anchor for everything we file later."

Then **switch to the `persona-new` protocol** (invoke `/persona-new` if available, otherwise read `.claude/commands/persona-new.md` and follow it) to walk the operator through the persona conversationally. File the persona as P001.

When P001 is filed, surface it and ask:

> "We have [name] filed. Are there other specific people this project serves? Most projects have 2 or 3. The most common shape is: the primary user, and someone else who's affected — a colleague, a parent, an administrator, the person whose work this enables. Want to file another?"

If yes, run `/persona-new` again. Aim for **1-3 total** — more than 3 in Phase A usually means the project is overscoped; file the rest as open questions and revisit later.

## Step 4 — Map 1: The Horizon (8-10 min)

When the personas are filed, transition:

> "Now let's draw the whole picture. Not the details yet — the destination. What does the world look like when this project is finished? What's true that isn't true today?"

Use the template at `docs/build/maps/01-template.md`. Walk through its sections **as conversation, not as a form**:

- **What this project is** — one paragraph, plain language. (You may already have most of this from Step 2 — refine it for the map.)
- **Who it's for** — list the personas just filed, one line each with their P-NNN handle.
- **What "done" looks like** — describe the destination in 3-6 sentences. Not how to get there; the place itself.
- **The shape of the journey** — two or three paragraphs in plain language describing the major stages, in narrative form. *"First we'll build X so Y is possible. Once Y is in place, we can do Z, which is what really matters for [persona]. The last stretch is making it reliable enough for real classrooms."* That kind of writing. A story, not a Gantt chart.
- **What's not in scope** — 3-5 things adjacent to the project that someone might assume are included but aren't. Naming the negative space prevents drift.

Write the map to `docs/build/maps/01-the-horizon.md`. Show them the file path and confirm.

## Step 5 — Open questions (2 min)

Pass over the conversation looking for anything the operator wasn't sure about. For each:

- File it as Q-NNN in `docs/build/open-questions/`
- Add a row to `open-questions/_index.md`

> "I noticed a few things you weren't sure about yet — [list]. I've filed them as open questions so we'll come back to them. Two of them affect Phase B (Architecture), so we'll definitely hit them next session."

## Step 6 — Close (2 min)

Update STATE.md:

- Set the **Planning progress** Phase A row to `✅ complete (YYYY-MM-DD)`
- Set the Phase B row to `🟡 next` (so the next `/start-of-session` knows where to route)
- Refresh the "Last updated" date

Then tell the operator what they now have:

> "You've got your first catalogue substrate:
>
> - **[N] personas** in `docs/build/personas/` — these anchor every later decision
> - **Map 1** at `docs/build/maps/01-the-horizon.md` — the whole-project picture
> - **[N] open questions** in `docs/build/open-questions/` — these are what we'll resolve as planning continues
> - **STATE.md** updated to reflect Phase A is done
>
> Next session, we move to **Phase B — Architecture & Contracts** (about 60-90 minutes). We'll name the major pieces of your project and what each one provides to the others.
>
> For now, run `/end-of-session` to commit everything. The catalogue's search index will refresh in the background, and next session can pick up from here."

Then run `/end-of-session` to close out.

---

## What to do if it goes off-track

- **Operator wants to skip personas:** strongly advise against it. Personas are the anchor for everything downstream. File at least one — even a rough one — and note it's a draft.
- **Operator says "I don't know" too often:** that's fine for Phase A. File each as an open question; the architecture phase will tighten them up. The point of Phase A is to establish *enough* shape that B can begin, not to be complete.
- **Operator wants to design implementation:** redirect. *"We'll get to how it's built in Phase B. Right now we're just figuring out what we're building and for whom."*
- **Operator gets fatigued mid-phase:** offer to pause. Run `/end-of-session` capturing where you are with a "Resume hint" in the session log; pick up at the next session.
- **Operator wants to file work units already:** suggest waiting. *"Phase E (Initial Work Units) is where we list them — by then we'll know the architecture, surfaces, and design system, so each work unit can be filed coherently."* If they insist, file as `🔵 proposed` with a note that the WU may need refinement after Phase B.

## Recovery if the session was interrupted

If the session log's "Resume hint" indicates Phase A was mid-way, read it carefully and pick up at exactly the step indicated. Re-read what's been filed so far (the personas already in `docs/build/personas/`, anything in STATE.md). Confirm with the operator before continuing — *"Last time we got as far as filing P001 — are we ready to add a second persona, or shall we go straight to Map 1?"*
