# Contracts

> Type-stable surfaces — what each part of {{PROJECT_NAME}} promises to its consumers. Where decisions justify *why* and philosophy frames the spirit, contracts specify *what is true at the boundary*. A contract is what an integrator (human or LLM) reads to know how to interact with this part of the system.

## When to write a contract

Not on day one. Contracts come when stable surfaces emerge — when something has been built, tested, and is being depended on by other parts of the system or other projects.

Premature contracts ossify the wrong shape. Late contracts allow drift. The signal a contract is needed: a downstream consumer is asking *"what does X actually guarantee?"* and the answer is not in any single place.

## Index

| Contract | Surface | Status |
| --- | --- | --- |
| _none yet_ | | |

## Pattern

Each contract document:
- Names the surface
- Lists the type-stable promises (what shape inputs come in, what shape outputs go out, what side effects fire)
- Specifies the conformance gate (the test or check that proves a candidate implementation honours the contract)
- Lists what is *not* covered (so consumers don't depend on incidentals)
- Records the contract's version (semver if it's published)

Contracts are change-controlled. Breaking a contract requires a decision (D-NNN) and a downstream-impact note.
