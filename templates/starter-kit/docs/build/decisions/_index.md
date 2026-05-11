# Decisions

A **decision** is a choice that's been made and shouldn't drift. Once accepted, a decision isn't edited — if circumstances change, you file a new decision that supersedes the old one and link forward. Decisions are the project's load-bearing commitments: the things future work has to honour. See [the glossary](../GLOSSARY.md#decision) for the full definition.

## Index

| ID | Title | Status | Date |
| --- | --- | --- | --- |
| _none yet — file your first one with `/decision-new` or `nuos-catalogue decision create`_ | | | |

## When to file a decision

- You're choosing between two reasonable approaches and want the choice to stick
- You're adopting a constraint future work will need to honour (e.g. "all data stays on-device", "no third-party trackers")
- You're overriding something previously decided — file the supersede; don't silently shift
- You're committing to a technology, a deployment target, a major design principle

> Example: "D003 — All overnight processing happens on the school's own server, never in the cloud."

## When NOT to file a decision

- The choice is an implementation detail and easy to reverse
- It belongs inside a work unit's notes — local to that work unit, not a project-wide commitment
- The matter is still open and unresolved — file it as an **open question** ([Q-NNN](../open-questions/_index.md)) instead

## What never to do

**Never edit an accepted decision file.** The pre-commit hook will block it. If you need to change something material, file a new decision that supersedes the old one — `nuos-catalogue decision supersede D003 --by=D012 --reason="..."`. Typo or link fixes that don't change meaning are the only edits allowed.

## How to file one

Easiest way: run `/decision-new` (or `nuos-catalogue decision create`). The AI walks you through the prompts and files the result with a fresh D-NNN handle.

The file is short — a one-paragraph context, the decision itself in one sentence, why it was made, and what it commits future work to. It doesn't need to be long. It needs to be unambiguous.
