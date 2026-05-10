# Work Units

> Concrete, buildable pieces of work. Each work unit has an outcome, acceptance criteria, dependencies, and a status. Work units are the unit of progress; the catalogue's compounding value comes from accumulated WU notes.

## Index

| WU | Title | Status | Depends on | Notes |
| --- | --- | --- | --- | --- |
| 001 | [first WU title] | 🟡 in flight | — | First work unit |

## Status legend

- 🔵 **proposed** — written down, not yet started
- 🟡 **in flight** — actively being worked on
- 🟣 **built / awaiting review** — implementation done, review pending
- ✅ **merged / shipped** — complete and integrated
- 🔴 **blocked** — cannot proceed; see notes for blocker

## Deferred / proposed-with-trigger work units

A work unit can be `🔵 proposed` in three flavours:

- **proposed-ready** — eligible to activate at next priority review
- **proposed-deferred-with-trigger** — committed, awaiting a checkable condition (state the condition in the WU itself)
- **proposed-blocked-on-question** — cannot activate until an open question resolves; link to the Q-NNN

The quarterly catalogue review walks each deferred WU and re-evaluates its trigger.

## How to add a work unit

1. Copy `001-template.md` to `NNN-short-title-with-dashes.md` (next available number)
2. Fill in the template
3. Add a row to the table above
4. If the WU resolves an open question, link it; if the WU was created in response to a decision, link the decision
