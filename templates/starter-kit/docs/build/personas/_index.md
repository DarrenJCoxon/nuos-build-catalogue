# Personas Index

> Master list of the personas this project's work units serve. Personas are P-NNN-numbered, written along the seven dimensions, and refined with the acid-test. Reusable across multiple WUs — a "paired outcome" (e.g., a customer-side outcome paired with an organiser-side one) cites two personas, both filed here.

## What a persona is

A persona is a **specification of who will use an outcome and what situation they will be in when they use it.** It is not a demographic snapshot; it is a design constraint. A persona that does not change a design decision is decoration — rewrite it until it does.

The seven dimensions every persona addresses:

1. **Identity** — who they are in the context of *this system*. Not their age or job title in the abstract — their relationship to this particular system.
2. **Reality** — physical environment when they use the outcome. Device, connection quality, noise level, time pressure.
3. **Psychology** — technical confidence, stress level, tolerance for confusion.
4. **Trigger** — what brought them to this outcome. A real-world event, not a UI click.
5. **History** — what they have done before arriving at this outcome.
6. **Success** — what "done" looks like from their perspective. Not what the system logs — what they feel.
7. **Constraints** — what they cannot or will not do. Defines the outer boundary of acceptable design.

Every persona is then refined into an **acid-test persona** — the hardest legitimate user, with the most demanding combination of real constraints. Design for the acid-test and the standard cases hold.

## How a persona is filed

```
personas/
├── _index.md          (this file)
├── 001-template.md    (the template; copy when filing a new persona)
├── P001-<slug>.md     (your first persona)
├── P002-<slug>.md     ...
└── done/              (when a persona retires — e.g., the user role no longer exists)
```

Personas are P-NNN-numbered. Numbers are stable: a retired persona moves to `done/` but keeps its number. Cross-WU references use the stable handle (`{repo}:P-NNN` for cross-catalogue references; `[P-NNN](../personas/P-NNN-slug.md)` within the same catalogue).

## Personas — active

| ID | Name | Used by WUs | Status |
| --- | --- | --- | --- |

[Add a row when you file a new persona. Status: `🟢 active`, `🟡 evolving` (the persona shape is being refined), `🟣 paired-with-PNNN` (this persona's outcomes are paired with another), `⚫ retired`.]

## Status legend

- 🟢 `active` — in use; cited by one or more current WUs
- 🟡 `evolving` — the seven dimensions are being refined as understanding deepens
- 🟣 `paired-with-PNNN` — this persona pairs with another (e.g., customer + organiser)
- ⚫ `retired` — no longer in use; moved to `done/`

## How to write a persona

Use the file format established in `001-template.md`. A persona document has:

- Identity dimension
- Reality dimension
- Psychology dimension
- Trigger dimension
- History dimension
- Success dimension
- Constraints dimension
- Acid-test refinement (the worst legitimate combination of constraints)
- Paired persona (if any) — the persona on the other side of any outcome this persona triggers
- WUs this persona is cited by

A persona should be small enough to read in two minutes and specific enough that swapping it for a different persona would force at least one design decision to change. If you can substitute the persona without changing anything in the WU, the persona is decorative — rewrite it until it constrains.

## How personas connect to WUs

A WU's `Persona` field links the P-NNN that the outcome serves. A WU's `Trigger` field draws from the persona's Trigger dimension but specifies the *moment* (not just the class of event). A WU's `Walkthrough` is written from the persona's perspective, using their reality, psychology, and history to constrain what they need to be told and what they already know.

If a WU has no clear persona, it is one of two things:
1. An infrastructure WU (build, publish, hardening) — mark the persona field `N/A — infrastructure WU`.
2. An unanchored feature — the WU describes a category of capability without a person doing a thing. Rewrite as an outcome with a real persona, or split into smaller outcomes.

## How personas evolve

Personas evolve as understanding deepens. The seven dimensions get sharper; the acid-test gets harder; new constraints surface. Update the persona file in place — but record the *date* of each refinement in the file itself, so a future reader can see how the understanding changed.

If a persona's role in the system changes substantially (e.g., "customer" splits into "registered customer" + "guest customer"), file two new personas with new P-NNN numbers and mark the original `⚫ retired` rather than amending it.
