# Architecture

The **architecture** register describes the major pieces of {{PROJECT_NAME}} and how they relate. Each major piece (module, service, surface, area of responsibility) gets its own file. The architecture is *what the pieces are*; the [contracts register](../contracts/_index.md) is *what they exchange*. See [the glossary](../GLOSSARY.md#architecture) for the full definition.

## Index

| Module | Purpose | Status |
| --- | --- | --- |
| _none yet — populated during the Architecture phase of planning (phase B)_ | | |

## What goes in this register

For each major piece of your project:

- **What it does** — a paragraph in plain language
- **Interface surface** — every public entry point, kept deliberately small
- **Hidden complexity** — what the module encapsulates that callers don't need to think about
- **Depth justification** — why this module's hidden body is genuinely large relative to its interface
- **Paths claimed** — source-tree paths this module owns (read by the `check-module-discipline.sh` hook)
- **Who's responsible for it** — which persona or role uses it most directly
- **What it depends on** — other modules, external services, hardware
- **What depends on it** — what would break if this module went away
- **Open questions about it** — anything unresolved about its shape
- **Links to relevant contracts** — what this module produces and consumes

Every module in this register is a **deep module** by commitment. Shallow modules — pass-through wrappers, util grab-bags, micro-modules, premature splits — are rejected at the intake gate. See [deep-modules.md](../../philosophy/deep-modules.md) for the doctrine; the rule is enforced by the `/wu-new` intake gate, the `/build-wu` architectural quality gate, and the `check-module-discipline.sh` PreToolUse hook.

Architecture files are *what's true about each piece*; they're not implementation specs. Implementation lives in code; this register lives in the catalogue.

## When the architecture register gets populated

During the **Architecture & Contracts** phase of planning (phase B), after the orientation phase. The AI walks you through identifying the major pieces of your project — usually 3-7 modules for a starting project — and helps you file one architecture entry per module.

## How architecture connects to everything else

- Every work unit names which module it lives in
- Every contract belongs to exactly one module (the one that owns it)
- Every UI/UX surface references which modules it talks to
- Architecture changes (a module splits, two modules merge, a new module enters scope) get filed as decisions

## How to add a module

During planning: the AI does this for you via `nuos-catalogue architecture create`.

Outside planning: copy `module-template.md` to `<short-module-name>.md`, fill it in, and add a row to the table above. Use `nuos-catalogue architecture create` if you want the interactive prompts.
