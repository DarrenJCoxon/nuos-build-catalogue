# Accessibility commitments

> *Filled in during the UI/UX + Design System phase of planning. These are the project-wide promises every surface honours.*

**Status:** 🔵 proposed
**Last updated:** {{TODAY}}

## Standards we meet

[Pick the standard the project commits to. WCAG 2.1 AA is the typical floor; AAA where appropriate.]

- **WCAG 2.1 Level AA** — minimum across all surfaces
- **WCAG 2.1 Level AAA** — for [specific contexts; e.g. "reading-focused screens"]

## Specific commitments

Each of these is a project-wide promise. They are not aspirational; every surface in `ui-ux/` must honour them.

### Colour and contrast

- All body text meets AA contrast (4.5:1) against its background
- All text 18px+ and bold 14px+ meets AA Large (3:1)
- Critical UI (focus rings, error states) is never communicated by colour alone

### Keyboard

- Every interactive element is reachable via keyboard alone
- Focus order matches visual order
- Focus rings are visible, distinct, and never suppressed
- No keyboard traps anywhere

### Screen reader

- Every interactive element has an accessible name (label, aria-label, or visible text)
- Landmarks are used correctly (header, nav, main, aside, footer)
- Heading hierarchy is correct (h1 → h2 → h3, no skipping)
- Form labels are always present and programmatically associated

### Motion

- All non-essential motion respects `prefers-reduced-motion`
- No auto-playing video or audio
- No flashing content above 3 Hz

### Touch and pointer

- Touch targets are at least 44 × 44 px
- Multiple input methods supported (touch, mouse, keyboard, switch)
- No actions require hover (which doesn't exist on touch)

### Forms

- Errors are described in text, not just colour
- Errors appear inline next to the affected field
- Submit buttons remain enabled until submitted; loading state replaces "submit" text
- Required fields are marked in text ("required"), not just by an asterisk

### Language and reading

- Page language is declared (`lang="en"` etc.)
- Reading level appropriate for the persona (most adult-facing surfaces target ~Grade 8-10)
- Long content has summaries; short content avoids unnecessary text

## How we test

- **Automated**: axe-core (or equivalent) on every page in CI
- **Keyboard-only walkthrough** as part of pre-merge for any new surface
- **Screen reader spot-check** (VoiceOver or NVDA) on changes to forms and primary flows
- **Real user testing** with one or more users who rely on assistive technology, before each major release

## When to file an accessibility-related decision

- A trade-off between accessibility and another goal arises (rare; document the resolution)
- A new accessibility commitment is added or an existing one is loosened
- A pattern is adopted that requires special accessibility care (drag-and-drop, complex grids, charts)

Accessibility is not a phase; it's a baseline. Every work unit that ships a surface checks against these commitments before completing.
