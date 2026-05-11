# Personas

A **persona** is one specific person the project serves. Not a market segment, not a demographic — one person with a name, a situation, and a reason to need what you're building. Personas are first-class in this catalogue because everything downstream — work units, UI/UX surfaces, contracts, decisions — hangs off who specifically you're building for. See [the glossary](../GLOSSARY.md#persona) for the full definition.

## Index

| ID | Name | Status | Used by |
| --- | --- | --- | --- |
| _none yet — file your first one with `/persona-new` or `nuos-catalogue persona create`_ | | | |

## What status means

- 🟢 **active** — currently in use; referenced by one or more work units or surfaces
- 🟡 **evolving** — the persona's shape is still being refined as you learn
- ⚫ **retired** — no longer in use; lives in `done/` but keeps its handle

## The seven dimensions

When you file a persona, you describe seven things about this specific person:

1. **Identity** — who they are *in the context of this project*. Their role, their relationship to what you're building. Not their age in the abstract — their relationship to your project.
2. **Reality** — where they are when they need this. Their device, their environment, their time pressure.
3. **Psychology** — how confident they are, how stressed, how patient with confusion.
4. **Trigger** — what's happening in their day or week that makes them need this. Not a click — a real-world moment.
5. **History** — what they've already done, tried, or experienced before reaching this point.
6. **Success** — what "done" looks like *from their perspective*. Not what your system logs; what they feel.
7. **Constraints** — what they cannot or will not do. The outer edge of what's acceptable for them.

A persona is sharp when **swapping them for a different person would force at least one design decision to change**. If you can substitute the persona without changing anything, the persona is decorative — refine it until it constrains.

## When to file a persona

You file the first 1-3 personas during the **Orientation** phase of planning. Most projects need 2-3 personas — primary user, secondary user, and sometimes an "operator" or "administrator" persona. More than 5-6 active personas usually means the project is overreaching; consider phasing.

Add new personas later if a new kind of user enters scope. Retire old ones (move to `done/`) when a role no longer exists.

## How to file one

Run `/persona-new` (or `nuos-catalogue persona create`). The AI walks you through each of the seven dimensions as conversation — give them a name, describe their situation, what makes them need this — and files the result with a fresh P-NNN handle.

## How personas connect to everything else

Every work unit names a persona. Every UI/UX surface names a persona. Every contract is justified by what a persona needs. When you change a persona's reality or constraints, downstream artefacts referencing that persona may need updates — file open questions for any you're not sure about.
