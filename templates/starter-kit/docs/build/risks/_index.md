# Risks

A **risk** is something that could go wrong and would matter if it did. Filed here so it's visible — both to you and to anyone else looking at the project. Zero risks on a real project usually means underthinking, not zero risk. See [the glossary](../GLOSSARY.md#risk) for the full definition.

## Index

| ID | Risk | Severity | Status | Date opened |
| --- | --- | --- | --- | --- |
| _none yet — add a row when you spot something to watch_ | | | | |

## Severity

- **High** — would block work or invalidate a major decision if it happens
- **Medium** — would slow things down materially
- **Low** — worth knowing about; not blocking

## Status

- **open** — being watched
- **mitigated** — something's been done to reduce it
- **materialised** — it happened; see the linked work unit or session for what we did
- **closed** — no longer relevant

## When to file a risk

- You can imagine something going wrong and want it surfaced rather than forgotten
- You're about to commit to a path and there's a known downside
- An open question has implications if it resolves the wrong way — file the risk separately so the project tracks it even before the question resolves
- A dependency (a person, a service, a piece of hardware) might not be available when you need it

> Example: "R002 — School wifi is unreliable on Mondays after maintenance; the morning briefing must degrade gracefully when offline."

## How to file one

Add a row to the table above with the next R-NNN number. If the risk is large enough to warrant detail (options for mitigation, escalation plan), write a `RNNN-short-title.md` file beside this index too. Reference the risk from any work unit it affects.
