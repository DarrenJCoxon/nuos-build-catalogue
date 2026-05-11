# Contracts

A **contract** is what one piece of the project guarantees it will provide to other pieces — and what it expects from them in return. Written in everyday language: "facts about the world the system now knows", not database tables or API endpoints. The contracts register is where the project commits to what each piece is responsible for. See [the glossary](../GLOSSARY.md#contract) for the full definition.

## Index

| Contract | Owner module | Status |
| --- | --- | --- |
| _none yet — populated during the Architecture phase of planning (phase B)_ | | |

## What a contract captures

For each major module, one contract describes:

- **What this module produces** — the facts, capabilities, or guarantees other modules can rely on. *"After Overnight Consolidation runs, every active student has a tomorrow-plan ranked by need."*
- **What this module consumes** — what must already be in place for this module to do its job. *"Overnight Consolidation needs today's interaction records for every active student."*
- **What it does not provide** — things adjacent that someone might assume are included but aren't. Naming the negative space prevents drift.
- **How it fails** — what happens if its inputs are missing, late, or wrong; what downstream modules can rely on as the failure behaviour.

Contracts are **load-bearing commitments**. They're the boundaries between modules — and they don't drift silently. If a contract changes, that's an architectural decision that gets filed.

## When the contracts register gets populated

During the **Architecture & Contracts** phase of planning (phase B). The AI walks you through one contract per module. Each contract gets filed as you go.

After planning, contracts evolve. Adding a new produced fact, or relaxing a consumed precondition, is usually a decision — file it in the decisions register and update the contract to match.

## How contracts connect to everything else

- Every contract belongs to exactly one module (the architecture file in `architecture/`)
- Every work unit names which contract(s) it produces or consumes
- Every UI/UX surface references the contracts it talks to
- Contract changes get filed as decisions

## How to add a contract

During planning: the AI does this for you via `nuos-catalogue contract create`.

Outside planning: copy `contract-template.md` to `<short-name>.md`, fill it in, and add a row to the table above. Or use `nuos-catalogue contract create` for the interactive prompts.
