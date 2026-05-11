# Patterns

Recurring page-level shapes that combine components in consistent ways. A **pattern** is a step up from a component — it's a layout, a flow, or a structural rule that multiple surfaces use. See [the design system index](../_index.md) for context.

## Index

| Pattern | Status |
| --- | --- |
| _none yet — patterns emerge as the project develops; sketch the first ones during Phase C of planning_ | |

## Typical patterns

Most projects develop a handful of patterns like these:

- **Form layout** — how labels, inputs, helper text, and errors arrange themselves on a form
- **List with actions** — how an item in a list shows primary content + secondary metadata + row-level actions
- **Empty state** — what every surface shows when there's no content yet
- **Loading state** — skeleton screens, spinners, progress; when to use which
- **Page template** — the standard header/main/footer arrangement, with breakpoint behaviour
- **Navigation** — how primary and secondary navigation arrange themselves; how the active state is shown

You don't define all of these upfront. Patterns get documented as the project produces them. The discipline is: **the second time a layout repeats, document it as a pattern** — before it diverges into two slightly-different one-off layouts.

## What goes in a pattern file

Each pattern documents:

- **What it is** — one sentence describing the recurring shape
- **When to use it** — the contexts it fits
- **Anatomy** — the components and their arrangement
- **Tokens consumed** — spacing, breakpoints, type
- **Behaviour** — at different breakpoints, with different content lengths, in different states (empty, loading, error)
- **Examples** — which surfaces in `ui-ux/` use this pattern

## How to add a pattern

Copy `_template.md` to `<pattern-name>.md`. Fill in. Add a row to the table above.
