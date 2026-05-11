# Design System

The **design system** is the shared visual and interaction language every part of {{PROJECT_NAME}}'s user-facing experience uses. End-to-end: design tokens (colour, type, spacing, motion) → components (buttons, cards, navigation) → patterns (form layouts, page templates) → voice (microcopy, error messages) → accessibility commitments. Every per-surface file in `ui-ux/` references this register. See [the glossary](../GLOSSARY.md#design-system) for the full definition.

## Why a design system from the start

Many projects sprout UI/UX surfaces first and add a design system later as a "consistency pass". By then the surfaces are inconsistent, components are duplicated, and harmonising them takes longer than building them in the first place. This catalogue requires a design system to exist before per-surface files are written. Phase C of planning produces both, in parallel.

If a change to a colour, a heading style, a button shape, or an error message tone needs to happen, it happens **here**, once. Every surface that references the design system picks up the change. That's the system's load-bearing job.

## Index

| File | What it captures |
| --- | --- |
| `tokens-colour.md` | Colour palette, semantic colour roles |
| `tokens-typography.md` | Type scale, font families, line heights, weights |
| `tokens-spacing.md` | Spacing scale, layout grid, breakpoints |
| `tokens-motion.md` | Easing curves, duration scale, motion principles |
| `tokens-radius-elevation.md` | Border radii, shadow scale, elevation tokens |
| `components/_index.md` | Index of components with status |
| `patterns/_index.md` | Index of recurring page-level patterns |
| `voice.md` | Voice, tone, microcopy principles |
| `accessibility.md` | Project-wide accessibility commitments |

Each section is filled in during the UI/UX + Design System phase of planning (phase C).

## What status means for design system pieces

- 🔵 **proposed** — drafted, not yet adopted across surfaces
- 🟡 **in flight** — being refined; surfaces may reference older + newer simultaneously
- 🟢 **active** — in use; the canonical version
- ⚫ **deprecated** — kept for reference but no new surfaces should use it; existing surfaces should migrate

## How design system pieces connect to everything else

- Every UI/UX surface in `ui-ux/` references design-system pieces by name
- Architecture modules that involve UI reference the surfaces (and thereby the design system)
- Decisions that materially change a token, component, or voice principle are filed in `decisions/`
- Work units that ship UI either consume the design system (most cases) or extend it (when a new component or pattern is needed)

## When the design system gets populated

During Phase C of planning (UI/UX + Design System). The AI walks you through:

1. **Voice and tone first** — how does {{PROJECT_NAME}} sound when it speaks?
2. **Tokens** — colour, type, spacing, motion. The atomic units.
3. **Components** — the buttons, cards, navigation, forms. Each with variants, states, and accessibility commitments.
4. **Patterns** — how components combine into recurring page-level layouts.
5. **Accessibility commitments** — what the project promises end-to-end.

You don't need to design every component upfront. The first pass establishes the language; components get added as work units need them. But the **language exists from the start** — every surface references it from day one.

## How to add a design system piece

During planning: the AI walks you through it.

Outside planning: each piece is a standalone file with its own template (see the relevant subdirectory). For a new component, copy `components/_template.md` to `components/<name>.md`. For a new pattern, copy `patterns/_template.md`. Tokens are edited directly in the `tokens-*.md` files.
