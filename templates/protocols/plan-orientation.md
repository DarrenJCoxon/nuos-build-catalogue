# plan-orientation

You are running **Phase A of the planning arc** for a project that just adopted the NuOS Build Method catalogue. This is the operator's first real conversation with the harness. By the end of this session they should have:

- A short, plain-English project description filed in `STATE.md`
- 1-3 personas filed in `docs/build/personas/`
- Map 1 — The Horizon — filed in `docs/build/maps/01-the-horizon.md`
- Initial open questions captured for anything they couldn't yet answer
- The Phase A row in STATE.md's Planning progress table flipped to `✅ complete`

The whole session takes about 30 minutes (longer in coaching mode, shorter in developer mode).

**Mode:** honour `methodfile.json`'s `operator.mode` per `docs/build/OPERATOR-MODES.md` (default `standard` if unset). If `null`, send the operator back to `/start-of-session` first to pick.

Read [`docs/build/GLOSSARY.md`](../../docs/build/GLOSSARY.md) once before you start so your vocabulary matches the catalogue's.

---

## How to lead this conversation

- Lead the operator; don't quiz them. Walk them through producing something they can use.
- Translate answers into catalogue artefacts as you go — they don't need to know the artefact shape.
- One question at a time. If they answer two at once, capture both and move on.
- Use their words. Translate jargon out, not in.
- "I don't know" → file an open question; move on. Don't stall.
- Save each artefact when the conversation produces it; don't batch-write at the end. Any in-conversation decision (architectural commitment, tech choice) gets filed to `docs/build/decisions/` *now* — drift kills the catalogue.

---

## Step 0 — Check intake first

Before you welcome the operator, list `docs/build/intake/` (excluding `README.md` and `.gitkeep`).

- **If there's material there**, the operator has dropped real input — transcripts, a brief, notes, persona descriptions. Don't plan from a blank page. Run `/ingest-intake` now (read the material, draft proposed records for the operator to accept), then return here with those drafts in place. Open the welcome with: *"You've dropped some material in `intake/` — I've read it and drafted a few things for you to confirm as we go. Let's plan from what you already have."*
- **If it's empty**, proceed straight to Step 1 as normal. (You can mention the folder exists: *"If you have any notes, transcripts, or a brief lying around, you can drop them in `docs/build/intake/` and I'll read them — but we can also just talk it through."*)

Either way, anything intake produced is `proposed`, not accepted. The planning conversation is where the operator confirms what becomes catalogue truth.

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

When the description is settled, **write it into `STATE.md`'s Resume block** — replacing the placeholder. Keep their voice; don't make it sound corporate. Show them the file path and confirm it's saved.

## Step 3 — Tech stack (5 min)

Now ask what they're building it with:

> "Before we meet the people your project is for — quickly, what are you building it with? Language, framework, database, where it'll run. If you know already, brilliant. If you haven't decided, just say so and we'll note it as an open question."

Listen and capture what they give you. Common patterns:
- *"Next.js, PostgreSQL, deployed on Vercel"* → frontend + database + deployment all filled
- *"React Native with Firebase"* → frontend + database/backend filled
- *"Not sure yet"* → set `defined: false`, file a Q-NNN

**Write the result to `methodfile.json` now**, under the `techStack` section:

```json
{
  "techStack": {
    "defined": true,
    "languages": ["TypeScript"],
    "frontend": "Next.js 15 (App Router)",
    "backend": "Next.js API Routes / Server Actions",
    "database": "PostgreSQL (Supabase)",
    "deployment": "Vercel",
    "externalServices": ["Stripe"],
    "notes": null
  }
}
```

Fill in what you know; set unknown fields to `null`. If nothing is settled, set `defined: false`, leave all fields null, and file a Q-NNN open question: *"Tech stack not yet decided — revisit before Phase B."*

Show the operator the updated `methodfile.json` and confirm it saved. Tell them:

> *"This means every agent we spawn later will know what it's building against — language, framework, where it runs. Just a few fields, but it prevents a lot of wrong output later."*

**Drift discipline:** partial information is fine and still valuable. An operator who says *"definitely Next.js, not sure about the database yet"* should have `frontend: "Next.js"`, `database: null`, `defined: true`. Partial is better than undefined.

## Step 4 — One persona, then one or two more (15-20 min)

Tell the operator what's coming:

> "Now I'm going to ask about the specific people this project serves. Not 'teachers' or 'users' — one specific person with a name. Their situation, what makes them need this, what success feels like for them. We'll do one in detail, then maybe one or two more. This becomes the anchor for everything we file later."

Then **switch to the `persona-new` protocol** (invoke `/persona-new` if available, otherwise read `.claude/commands/persona-new.md` and follow it) to walk the operator through the persona conversationally. File the persona as P001.

When P001 is filed, surface it and ask:

> "We have [name] filed. Are there other specific people this project serves? Most projects have 2 or 3. The most common shape is: the primary user, and someone else who's affected — a colleague, a parent, an administrator, the person whose work this enables. Want to file another?"

If yes, run `/persona-new` again. Aim for **1-3 total** — more than 3 in Phase A usually means the project is overscoped; file the rest as open questions and revisit later.

## Step 5 — Map 1: The Horizon (8-10 min)

When the personas are filed, transition:

> "Now let's draw the whole picture. Not the details yet — the destination. What does the world look like when this project is finished? What's true that isn't true today?"

Use the template at `docs/build/maps/01-template.md`. Walk through its sections **as conversation, not as a form**:

- **What this project is** — one paragraph, plain language. (You may already have most of this from Step 2 — refine it for the map.)
- **Who it's for** — list the personas just filed, one line each with their P-NNN handle.
- **What "done" looks like** — describe the destination in 3-6 sentences. Not how to get there; the place itself.
- **The shape of the journey** — two or three paragraphs in plain language describing the major stages, in narrative form. *"First we'll build X so Y is possible. Once Y is in place, we can do Z, which is what really matters for [persona]. The last stretch is making it reliable enough for real classrooms."* That kind of writing. A story, not a Gantt chart.
- **What's not in scope** — 3-5 things adjacent to the project that someone might assume are included but aren't. Naming the negative space prevents drift.

Write the map to `docs/build/maps/01-the-horizon.md`. Show them the file path and confirm.

## Step 6 — Open questions (2 min)

Pass over the conversation looking for anything the operator wasn't sure about. For each:

- File it as Q-NNN in `docs/build/open-questions/`
- Add a row to `open-questions/_index.md`

> "I noticed a few things you weren't sure about yet — [list]. I've filed them as open questions so we'll come back to them. Two of them affect Phase B (Architecture), so we'll definitely hit them next session."

## Step 7 — Close (2 min)

Update STATE.md: Phase A row → `✅ complete (YYYY-MM-DD)`; Phase B row → `🟡 next`; refresh "Last updated".

Summarise to the operator what they now have — tech stack, [N] personas, Map 1, [N] open questions, STATE.md updated — and tell them the next session is **Phase B — Architecture & Contracts** (~60-90 min). Then run `/end-of-session`.

---

## What to do if it goes off-track

- **Operator wants to skip personas:** strongly advise against it. Personas are the anchor for everything downstream. File at least one — even a rough one — and note it's a draft.
- **Operator says "I don't know" too often:** that's fine for Phase A. File each as an open question; the architecture phase will tighten them up. The point of Phase A is to establish *enough* shape that B can begin, not to be complete.
- **Operator wants to design implementation:** redirect. *"We'll get to how it's built in Phase B. Right now we're just figuring out what we're building and for whom."*
- **Operator gets fatigued mid-phase:** offer to pause. Run `/end-of-session` capturing where you are with a "Resume hint" in the session log; pick up at the next session.
- **Operator wants to file work units already:** suggest waiting. *"Phase E (Initial Work Units) is where we list them — by then we'll know the architecture, surfaces, and design system, so each work unit can be filed coherently."* If they insist, file as `🔵 proposed` with a note that the WU may need refinement after Phase B.

## Recovery if the session was interrupted

If the session log's "Resume hint" indicates Phase A was mid-way, read it carefully and pick up at exactly the step indicated. Re-read what's been filed so far (the personas already in `docs/build/personas/`, anything in STATE.md). Confirm with the operator before continuing — *"Last time we got as far as filing P001 — are we ready to add a second persona, or shall we go straight to Map 1?"*
