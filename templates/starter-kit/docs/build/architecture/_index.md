# Architecture

The **architecture** register describes the major pieces of {{PROJECT_NAME}} and how they relate. Each major piece (module, service, surface, area of responsibility) gets its own file. The architecture is *what the pieces are*; the [contracts register](../contracts/_index.md) is *what they exchange*. See [the glossary](../GLOSSARY.md#architecture) for the full definition.

## Index

| Module | Purpose | Status |
| --- | --- | --- |
| _none yet — populated during the Architecture phase of planning (phase B)_ | | |

## What goes in this register

For each major piece of your project:

- **What it does** — a paragraph in plain language
- **Who's responsible for it** — which persona or role uses it most directly
- **What it depends on** — other modules, external services, hardware
- **What depends on it** — what would break if this module went away
- **Open questions about it** — anything unresolved about its shape
- **Links to relevant contracts** — what this module produces and consumes

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
