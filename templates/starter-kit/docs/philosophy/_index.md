# Philosophy

> The architectural commitments of {{PROJECT_NAME}}, in narrative form. Where decisions (D-NNN) are point-in-time choices, philosophy documents are *the story of why the project is shaped this way at all*. They are read by anyone integrating with the project, by investors, and by future operators trying to understand the spirit of the system.

## When to write a philosophy document

Not on day one. Philosophy emerges as decisions accumulate. By around D010 — perhaps D020 — patterns are visible across decisions: a recurring concern, a consistent prioritisation, an architectural commitment that was never written down because every decision implied it.

That is when a philosophy doc becomes worth writing. One short narrative-form document per cross-cutting commitment. Examples from NuOS: *separation of personal data and AI inference*, *intent-typed boundaries*, *PII isolation*.

## Index

| Doc | Topic |
| --- | --- |
| _none yet — philosophy emerges as decisions accumulate_ | |

## Pattern

Each philosophy doc:
- Names the commitment in present tense
- Gives the historical context — what was wrong with the alternatives
- States the architectural implications
- Lists the decisions that implement it
- Lists the contracts and surfaces it constrains

Philosophy docs are the *upstream* of decisions. A new decision should be checkable against the philosophy: is this consistent with the project's commitments? If not, either the decision is wrong or the philosophy needs revisiting.
