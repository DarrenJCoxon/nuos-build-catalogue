---
name: plan-uiux
description: Phase C of planning — enumerate every surface and build the complete design system
---

# plan-uiux

You are running **Phase C of the planning arc** — UI/UX + Design System. This phase does two things:

1. **Surfaces** — names every page, screen, modal, or command the user ever touches, and defines what each one does.
2. **Design system** — builds the shared visual and interaction language those surfaces use: colour tokens, type scale, spacing, radius, motion, components, patterns, voice, and accessibility commitments.

By the end of this session:

- Every user-facing surface is filed in `docs/build/ui-ux/`
- The design system is **fully populated** in `docs/build/design-system/` — tokens have real values, components are defined with their variants, patterns are named. **No placeholders.**
- Decisions are filed for every non-obvious design choice
- The Phase C row in STATE.md is flipped to `✅ complete`

This session takes 60–90 minutes (longer in coaching mode, shorter in developer mode). **The design system is not a nice-to-have.** Every agent that ships UI code — coder, reviewer, tester — reads it to know what "correct" looks like. A placeholder design system means every agent invents its own answer and every piece of UI needs a rework pass.

**Mode:** honour `methodfile.json`'s `operator.mode` per `docs/build/OPERATOR-MODES.md` (default `standard` if unset).

---

## How to lead this conversation

- **Walk the user's journey before building the system.** Understand every surface first; the design language emerges from what the surfaces need.
- **Write surface files and design-system files as the conversation produces them.** Don't batch.
- **Extract; don't impose.** The design language should come from the operator's intent and the project's character — not from generic defaults.
- **The design system must be complete before the phase closes.** Colour tokens cannot be `#000000`. Components cannot be "TBD". If the operator says "I don't know the exact colour yet", help them decide now — make a reasoned provisional choice, write it down, and file it as a decision they can supersede later. Provisional is fine. Blank is not.

---

## Step 1 — Read the context (5 min)

Before starting, read:
- `docs/build/personas/` — who uses these surfaces
- `docs/build/architecture/` — modules; surfaces call into these
- `docs/build/maps/01-the-horizon.md` — the destination
- `methodfile.json`'s `techStack` section — platform affects surface types (web vs. native vs. CLI)

Open with:

> "We've named the architecture — the major pieces and what they do. Now let's design what people actually see and touch. We'll go through every screen or page in your words, and then build the design language behind it: colours, type, spacing, and the building blocks every screen uses. Nothing left blank. Real values, real components — everything an agent needs to build the UI correctly on the first pass."

## Step 2 — Enumerate all surfaces (10–15 min)

Ask:

> "Walk me through the experience from the very beginning. Someone opens your product for the first time — what do they see? Then what? Keep going until we get to everything."

As the operator describes, build a running list of every distinct surface:
- Full pages / screens
- Modals and overlays
- Empty states (often forgotten; usually the worst experience if undesigned)
- Error states
- Emails or notifications if the product sends them
- Admin or back-office surfaces if they exist
- CLI or command surface if there is one

Surface any surfaces that were skipped:

> "You mentioned [X] — does that have its own screen? What happens after [action] — is there a confirmation view?"

Don't file surface files yet. Build the complete list first.

## Step 3 — Walk each surface (20–30 min)

For each surface in the list, ask in conversation:

1. *"Which [persona name] uses this?"*
2. *"What are they trying to do when they land here?"*
3. *"What does the screen show — walk me through top to bottom."*
4. *"What's the primary action — the one thing we most want them to do?"*
5. *"What can go wrong — empty data, errors, edge cases?"*

**File each surface immediately** at `docs/build/ui-ux/<surface-slug>.md` using `docs/build/ui-ux/surface-template.md`. Mark which architecture module(s) it calls into. Show the file path.

## Step 4 — Extract the design language (20–25 min)

Transition to the operator: now the design language that governs every surface — values handed to every agent so they all build the same thing. Make provisional decisions when the operator isn't sure; file them as decisions they can supersede.

Walk through each token group below as conversation — open with the character/feel question, then capture the values. **Every token gets a real value, not a placeholder.**

### Colour — `docs/build/design-system/tokens-colour.md`
Open: *"What's the character of this product — serious/professional, playful, calm, bold? How should people feel using it?"* Then capture, with real hex/hsl values:
- **Brand primary** (main action colour) + **brand secondary** if needed
- **Neutral scale** — 5–7 steps: background, surface, border, muted text, body text, heading
- **Semantic** — success, warning, error, info

### Typography — `docs/build/design-system/tokens-typography.md`
Open: *"Scanning data or reading prose? Mobile-first or desktop-first?"* Capture:
- **Font family** (real name — system stack, specific Google Font, or custom)
- **Size scale** xs → 3xl (real rem values)
- **Weight variants** (real numeric weights)
- **Line height** (compact for data, comfortable for prose)

### Spacing — `docs/build/design-system/tokens-spacing.md`
Open: *"Tight density or generous whitespace?"* Capture:
- **Spacing scale** (real step sequence, e.g. 4/8/12/16/20/24/32/40/48/64 px)
- **Max content width** + **grid/column structure** if used

### Radius & elevation — `docs/build/design-system/tokens-radius-elevation.md`
Open: *"Sharp corners or rounded? Flat or layered?"* Capture:
- **Border radius** (none / sm / md / lg / full — real px values)
- **Shadow scale** if depth is used (2–4 named levels, real values)

### Motion — `docs/build/design-system/tokens-motion.md`
Open: *"Meaningful transitions or mostly static?"* Capture:
- **Transition durations** instant / fast / base / slow (real ms values)
- **Easing curves** (real CSS easing values)
- **Reduced-motion policy** for `prefers-reduced-motion`

## Step 5 — File the components (15–20 min)

Look back across all surfaces filed in Step 3. Extract the recurring UI building blocks:

> "Looking at the surfaces, the same pieces appear repeatedly: [list what you found — buttons, form fields, cards, navigation, modals, etc.]. These become your component library."

For each component define:
- What it renders
- Its variants (e.g. Button: primary / secondary / ghost / destructive / disabled)
- Which tokens it uses
- Behaviour: hover, focus, loading, error state

File each at `docs/build/design-system/components/<component-slug>.md` using `docs/build/design-system/components/_template.md`. Update `docs/build/design-system/components/_index.md`.

At a minimum, file:
- **Button** — most important; every interaction has one
- **Input / form field** — text, select, checkbox, radio
- **Card** — almost every product has content cards
- **Navigation** — header, sidebar, or tab bar (whatever this product uses)
- **Modal / dialog**
- Any product-specific components that appear in two or more surfaces

## Step 6 — File the patterns (10 min)

Patterns are compositions of components that repeat across surfaces:

> "Some combinations appear in multiple places — a form with a submit button, a list of cards with a header, an empty state with a CTA. Naming these prevents each agent from inventing its own."

File patterns that appear in two or more surfaces at `docs/build/design-system/patterns/<pattern-slug>.md` using `docs/build/design-system/patterns/_template.md`. Update `docs/build/design-system/patterns/_index.md`.

Common patterns:
- **Form layout** — label + field + validation error + submit button
- **Empty state** — icon/illustration + heading + body + CTA
- **Page header** — title + subtitle + primary action
- **Data table** — sortable columns, row actions, pagination if needed

## Step 7 — Voice and accessibility (10 min)

### Voice

Ask:
> "If the product spoke to users — in buttons, in error messages, in empty states — what would it sound like? Friendly and casual, professional and concise, encouraging and warm?"

Establish:
- Tone (e.g. "direct but warm — never corporate, never cutesy")
- Vocabulary rules (words to use; words to avoid)
- Tense and person ("You have N items" vs. "The user has N items")
- Error message style (apologetic vs. matter-of-fact)
- CTA writing style ("Get started" vs. "Start for free" vs. "Create account")

Write to `docs/build/design-system/voice.md`.

### Accessibility

Establish non-negotiables:
- Colour contrast standard (WCAG AA minimum; state if targeting AAA)
- Keyboard navigation requirements
- Screen reader labelling approach
- Focus indicator style (don't accept "browser default" — name the actual style)

Write to `docs/build/design-system/accessibility.md`.

## Step 8 — Check: nothing left blank (5 min)

Before closing, verify:
- Every colour token has a real hex/hsl value — no `#000000` defaults
- Every type token has a real font name and real rem size
- Every component is filed with its variants named
- Voice and accessibility are written prose, not placeholder headings

If anything is still a placeholder, resolve it now. This check is non-negotiable — the whole point of Phase C is to produce a real design system, not a skeleton.

## Step 9 — Close

Update STATE.md: Phase C → `✅ complete (YYYY-MM-DD)`, Phase D → `🟡 next`, refresh "Last updated".

Summarise to the operator: [N] surfaces, real token values (colour, type, spacing, radius, motion), [N] components, [N] patterns, voice + accessibility committed. Every UI-building agent reads this; the reviewer rejects non-conforming output. Next session is **Phase D — Maps** (~45 min). Then run `/end-of-session`.

---

## What to do if it goes off-track

- **Operator says "I'll decide the colours later":** don't accept it. *"The design system is what stops every agent making up its own answer. Placeholder values mean every UI piece the swarm ships will need a rework pass. Let me suggest something reasonable based on what you've described — you just tell me if I'm wrong."* Make the provisional decision; file it as a decision they can supersede. Move on.
- **Operator doesn't know component terminology:** use product language. *"The button that logs someone in — what does it look like? What colour is it?"* Extract components from their description.
- **Too many surfaces:** narrow to surfaces that are genuinely distinct (different layout, different purpose). Modals that follow the same pattern don't need separate files — one modal component covers them.
- **Mobile-first product:** let the constraint shape the language. Mobile-first means generous tap targets (min 44px), larger base type size, generous spacing. Note it in accessibility.md.
- **Operator has existing brand guidelines:** ask them to share the primary colour and font. Use those as the starting point; fill the rest of the scale from them.
