---
description: File a new persona by walking the seven dimensions conversationally
---

# persona-new

You are filing a new **persona** for a project that uses the **NuOS Build Method catalogue**. A persona is one specific person the project serves — not a market segment, not a demographic. One person with a name, a situation, and a reason to need what's being built.

**Mode:** honour `methodfile.json`'s `operator.mode` per `docs/build/OPERATOR-MODES.md` (default `standard` if unset). The seven dimensions are filed in full regardless of mode.

---

## Step 1 — Open with the why

Briefly explain why we're doing this (one or two sentences):

> "I'll capture this person specifically so everything we build downstream can refer back to them. The point isn't to fill in a form — it's so that when we file a feature later, we can say 'this is for [name], in [their situation], when [their trigger happens]' and not have to re-explain who they are every time."

Then ask for their name. Even a made-up one is fine.

## Step 2 — Walk the seven dimensions as conversation

Don't list "the seven dimensions" to the operator. Weave them into questions. Below are the dimensions and a conversational prompt each. Adapt to the operator's flow — if they answer two dimensions in one breath, capture both and skip ahead.

1. **Identity** — *"Tell me about them in the context of this project. What's their role? What account do they have? What systems are they used to? Just enough that someone reading this knows who they are in relation to what we're building."*

2. **Reality** — *"Where are they when they need this? What device? Are they at their desk, on the school playground, on a train, at home? Time of day? Noise? Pressure?"*

3. **Psychology** — *"How tech-confident are they? Are they patient when things don't make sense, or do they abandon fast? How much energy do they have when they're using this?"*

4. **Trigger** — *"What's happening in their day that makes them need this? Not 'they open the app' — what comes before that? What's the moment in their life that creates the need?"*

5. **History** — *"What have they done already by the time they reach this? Are they a returning user with saved details, or is this fresh every time? What previous experiences shape what they expect?"*

6. **Success** — *"What does 'this worked' feel like from their side? Not what the system logs — what they actually feel. Relief? Confidence? Done with it?"*

7. **Constraints** — *"What can they not (or will they not) do? What's the hard edge of acceptable for this person?"*

## Step 3 — The acid-test refinement

Ask one more question:

> *"Now imagine the hardest legitimate version of this person — same role, same job, but with every realistic constraint at its worst at the same time. Slow device. Low confidence. Time pressure. Bad day. Tired. Distracted. The combination that's still real but makes everything harder. Design for that person and the easier cases hold."*

Capture the acid-test as the last dimension on the persona file.

## Step 4 — Discipline check (gentle)

Look at what you've captured. Two questions to surface (gently, in plain language):

- **Would swapping this person for a different one force you to change anything?** If no, the persona isn't constraining yet — ask one more sharpening question.
- **Are the triggers specific real-life moments, or just "uses the system"?** Vague triggers produce vague designs.

If either is weak, ask one more probing question — but don't force perfection. Captured-but-imperfect is much better than not captured.

## Step 5 — File the persona

1. **Number it.** Scan `docs/build/personas/` and `docs/build/personas/done/` for the highest P-NNN prefix; new number is max + 1.
2. **Slugify the name** — lowercase, dashes for spaces, no special characters, max 60 chars.
3. **Write the file** at `docs/build/personas/PNNN-slug.md`. Use the template at `docs/build/personas/001-template.md`. Fill in each dimension from the conversation.
4. **Add a row** to `docs/build/personas/_index.md`. Status `🟢 active`. "Used by" column stays empty until work units reference this persona.

## Step 6 — Tell the operator what happened

Plain English:

- Where the file landed (clickable path)
- Anything you noticed during the conversation (e.g. "you mentioned a colleague who reviews this work — is that a paired persona we should file separately?")
- The next concrete action — usually: file the paired persona if there is one; otherwise carry on with the active phase

---

## Why personas are first-class in this catalogue

Many projects describe their users in passing — a vague "teachers" or "users" mentioned inside a feature spec, different every time. That works for small projects. For projects with real complexity, it doesn't: every feature spec re-invents who it's for; downstream features can't be designed coherently against a moving target.

Personas as first-class catalogue entries fix this. **One sharp persona, referenced by stable handle, used across many work units over many months.** Every feature filed says who it's for by P-NNN handle. When the persona evolves, every reference updates with it.

The seven dimensions are what make a persona sharp enough to carry that weight. The acid-test is what makes the design robust. If the catalogue has decorative personas — ones that don't change any design decision — they're worse than no personas at all, because they create the illusion of constraint without supplying any.

If the operator skips a dimension because it feels obvious, accommodate but note what was skipped. A later work unit may need exactly that dimension and find it missing. The catalogue records what's decided AND what's not yet decided — both are load-bearing.
