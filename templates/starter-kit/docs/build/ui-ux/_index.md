# UI/UX

A **surface** is a piece of the user-facing experience — a page, a screen, a modal, a command, an email, a notification. Each surface lives here as its own file. The register captures *what people see, what they do, and what happens next.* Implementation lives in code; **the visual + interaction language each surface uses lives in [the design system register](../design-system/_index.md).**

See [the glossary](../GLOSSARY.md#surface) for the full definition of a surface.

## Index

| Surface | Persona | Status |
| --- | --- | --- |
| _none yet — populated during the UI/UX + Design System phase of planning (phase C)_ | | |

## What goes in a surface file

For each user-facing surface:

- **Who uses it** — link to the persona(s) in `personas/`
- **When they reach it** — the trigger; what's happening in their day that brings them here
- **What they see** — the content, the layout, the components from the design system that appear
- **What they do** — the actions available
- **What happens next** — where they go, what the system does
- **What contracts it touches** — link to the contracts in `contracts/` this surface reads from or writes to
- **What design-system pieces it uses** — the components, patterns, tokens, voice samples

A surface file is *what's true about the experience*. It's not a mockup or wireframe; it's a description detailed enough that a designer or developer reading it knows what to build.

## When the UI/UX register gets populated

During the **UI/UX + Design System** phase of planning (phase C), after architecture is in place. Phase C produces TWO things in parallel:

1. **The design system** — the shared vocabulary every surface uses
2. **The surface files** — one per page/screen/modal/command/email — each consuming the design system

This phase is end-to-end: it produces a complete design system AND the per-surface application of it.

## How UI/UX connects to everything else

- Every surface names ≥1 persona
- Every surface names ≥1 contract it touches
- Every surface references the design-system pieces it uses
- Work units that build surfaces name which surface(s) they build
- Surface changes that affect a persona's experience get filed as decisions

## How to add a surface

During planning: the AI does this for you via `nuos-catalogue ui-ux create`.

Outside planning: copy `surface-template.md` to `<short-surface-name>.md`, fill it in, and add a row to the table above.
