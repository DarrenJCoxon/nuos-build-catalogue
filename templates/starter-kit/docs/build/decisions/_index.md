# Decisions

> Architectural commitments made by this project. Each decision lives in its own D-NNN file. Decisions are dated, justified, and have a status (`accepted`, `superseded`, `withdrawn`).

## Index

| ID | Title | Status | Date |
| --- | --- | --- | --- |
| _none yet — see the template_ | | | |

## How to add a decision

1. Copy `D001-template.md` to `DNNN-short-title-with-dashes.md` (next available number)
2. Fill in the template
3. Add a row to the table above
4. If the decision affects a work unit's acceptance criteria, link it from the WU
5. If the decision supersedes a prior one, mark the prior one's status as `superseded` and link forward

## When to write a decision

- An architectural commitment is being made
- Two reasonable approaches are being chosen between
- A constraint is being adopted that future work will need to honour
- A prior decision is being overridden (write the supersede; don't silently shift)

## When NOT to write a decision

- The choice is implementation-detail and easy to reverse
- The work unit's notes are sufficient to capture the rationale
- The matter is open and unresolved — file it as an open question (Q-NNN), not a decision
