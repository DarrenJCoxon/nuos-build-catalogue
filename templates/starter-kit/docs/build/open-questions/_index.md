# Open questions

An **open question** is something the project hasn't decided yet but might need to. When an open question gets resolved, it becomes a [decision](../decisions/_index.md) (or it becomes obvious and gets closed). The open-questions register is where uncertainty lives — visibly, with a handle — until it's ready to settle. See [the glossary](../GLOSSARY.md#open-question) for the full definition.

## Index

| ID | Question | Status | Blocks | Date opened |
| --- | --- | --- | --- | --- |
| _none yet — file your first one with `/question-new` or `nuos-catalogue question create`_ | | | | |

## When to file an open question

- You hit something during planning or work that needs a choice, but you can't make it yet
- You're not sure what the right approach is and want to come back to it
- A work unit can't start until something gets answered — surface that visibly rather than letting the work stall silently
- You feel uneasy about something but it's not yet a decision — naming it as a question gives it somewhere to live

> Example: "Q003 — Should the morning briefing run on-device or rely on the school's overnight server?" — both options have real trade-offs; we don't yet know which we'll pick.

## What status means

- 🟡 **open** — under deliberation
- 🟢 **resolved** — turned into a decision; the resolved row links forward to that D-NNN
- ⚫ **withdrawn** — no longer relevant (e.g. the work unit it was blocking got cut)

## When an open question becomes a decision

A question is ready to resolve when:

- The trade-offs are clear enough to choose between
- The information needed to choose is available (or you've decided you'll commit anyway)
- A work unit can't continue until you choose

Resolving too early produces a fragile decision someone has to revisit. Resolving too late produces a work unit that's blocked or built on guesswork. The honest signal that it's time is *something is now blocked or about to be blocked*.

## How to file one

Run `/question-new` (or `nuos-catalogue question create`). The AI walks you through the prompts and files the question with a fresh Q-NNN handle.

When a question is resolved, run `nuos-catalogue question resolve Q003 --became=D012 --reason="..."`. This marks the question resolved, links it to the new decision, and moves it to `resolved/`.
