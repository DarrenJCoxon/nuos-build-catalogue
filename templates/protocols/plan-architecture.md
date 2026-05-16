# plan-architecture

You are running **Phase B of the planning arc** — Architecture & Contracts. Phase A gave you a project description, tech stack, personas, and a horizon map. Phase B names the major pieces of the system and defines what each one promises to the others.

By the end of this session the operator should have:

- 3–7 module files in `docs/build/architecture/`
- One contract file per module in `docs/build/contracts/`
- Decisions filed for every non-obvious technology or structural choice
- The Phase B row in STATE.md's Planning progress table flipped to `✅ complete`

The whole session takes about 60–90 minutes. **The operator is most likely a domain expert, not a software engineer.** Plain English throughout. A "module" is just a major piece with one clear responsibility. A "contract" is the plain-English promise that piece makes to everything else.

---

## How to lead this conversation

- **Lead the operator; don't quiz them.** Walk them through naming each piece, one at a time.
- **Write each module and contract as the conversation produces it.** Don't accumulate and write at the end.
- **If a technology choice surfaces, file a decision immediately.** Saying "we'll use PostgreSQL" in conversation and not filing it is drift.
- **Refer to the horizon map.** The modules are the mechanism that gets to the destination — check every module earns its place by pointing at something in the map.

---

## Step 1 — Read the context (2 min)

Before starting, read:
- `docs/build/maps/01-the-horizon.md` — the destination
- `docs/build/personas/` — who the system serves
- `methodfile.json`'s `techStack` section — if `defined: true`, modules must be grounded in the actual stack

Then open with:

> "We've got the project oriented — you've described what you're building, who it's for, and where it's heading. Now let's name the major pieces. Not the code, not the screens — just the chunks of functionality that each have one clear job. Most projects have between three and seven. Some examples: 'the thing that handles payments', 'the thing that manages user accounts', 'the thing that sends notifications'. We'll name them in your words, and I'll write each one down."

## Step 2 — Name the modules (30–45 min)

Ask:

> "What are the major pieces of this system? Take your time. Start with the one that feels most central."

**For each module, ask three follow-up questions** (in conversation, not as a list):

1. *"What does it do — in one sentence?"*
2. *"What does it need from the rest of the system to do its job?"* (dependencies)
3. *"What does it produce or make available for everything else?"* (what it provides)

When you have the shape of a module, **write it immediately** as `docs/build/architecture/<module-name>.md` and its contract as `docs/build/contracts/<module-name>.md`. Use the templates at `docs/build/architecture/module-template.md` and `docs/build/contracts/contract-template.md`. Show the file path to the operator as you create it.

After each module, ask: *"Is there another major piece, or does that cover the main shape of the system?"*

**Completeness check:** when the operator seems done, look at the horizon map. Is there anything the map needs that no module provides? Surface it:

> "Looking at the horizon map — [X] is supposed to happen, but none of the modules we've named clearly owns it. Is that covered by one of these, or is there a piece we've missed?"

**Tech choices:** if the operator implies a technology choice ("it stores user data", "it sends emails", "it calls the payment API"), treat it as a potential decision. Ask: *"You mentioned [X] — have you decided how you'll handle that? If so, let's file it as a decision now."* File it as `docs/build/decisions/D-NNN-<slug>.md`.

## Step 3 — Review the module map (5 min)

When all modules are named, surface the full picture:

> "Here's what we've got: [list modules with one-sentence summaries]. The dependency flow reads: [describe how they connect]. Does that match how you think about the system?"

Adjust anything the operator wants to rename, merge, or split. Re-file as needed.

## Step 4 — Open questions (5 min)

Scan the conversation for anything the operator wasn't sure about. File each as Q-NNN in `docs/build/open-questions/`. Flag which ones affect Phase C (UI/UX) — those surface assumptions about the user-facing layer that Phase C will resolve.

## Step 5 — Close (2 min)

Update STATE.md:
- Phase B row → `✅ complete (YYYY-MM-DD)`
- Phase C row → `🟡 next`
- Refresh "Last updated"

Tell the operator:

> "You've got the architecture substrate:
>
> - **[N] modules** in `docs/build/architecture/` — the major pieces
> - **[N] contracts** in `docs/build/contracts/` — what each piece promises
> - **[N] decisions** in `docs/build/decisions/` — the choices already made
> - **STATE.md** updated
>
> Next session: **Phase C — UI/UX + Design System** (~60–90 min). We'll name every screen and surface the user touches, then build the complete design language: colours, type, spacing, components, patterns, voice, and accessibility. By the end, the design system is real — no placeholders.
>
> Run `/end-of-session` to commit everything."

Then run `/end-of-session`.

---

## What to do if it goes off-track

- **Operator wants to define screens already:** redirect. *"We'll get to the surfaces in Phase C. Right now we're just naming the pieces that do the work."*
- **Modules are too granular** (function-level rather than responsibility-level): zoom out. *"That feels like implementation detail. What's the higher-level piece it belongs to?"*
- **More than 7 modules:** ask if any can be merged. More than 7 usually means either the system is genuinely large (valid) or the abstraction level is off (common).
- **Operator says "I don't know" about dependencies:** file it as Q-NNN and continue. The contract can note the uncertainty.
