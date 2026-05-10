# Work Unit 001 — [Outcome-bounded title, e.g., "Bookshop event booking flow" or "Bootstrap the Postgres schema"]

| Field | Value |
| --- | --- |
| Status | 🟡 in flight |
| Depends on | none |
| Blocks | [WUs that cannot start until this lands] |
| Implements | [the decision or pattern this realises] |
| Owner | [name or "—"] |
| Estimated effort | [days or "small/medium/large"] |
| Repo | [where the implementation lands] |

## Persona

[Link to the P-NNN persona this outcome serves — e.g., `[P001 — Returning bookshop customer](../personas/P001-returning-customer.md)`. For paired outcomes, link both personas. For infrastructure WUs (build, publish, hardening), write `N/A — infrastructure WU.`]

## Trigger

[The real-world event that makes this outcome necessary. Not "the user clicks the booking button" — that is a UI interaction. The trigger is what happened *before* they opened the platform: "the customer saw an event announcement on social media and wants to reserve a place", "the SENCo received an email that a child has been placed on the SEN register". For infrastructure WUs, write `N/A — infrastructure WU.`]

## Outcome

[One paragraph. The single sentence test: *what will be true when this is done that is not true now?* That sentence is the outcome.]

## Walkthrough

[Numbered steps from the persona's perspective — what they do and what they see. Include failure paths via the five injection points: (1) what if the persona cannot complete this step in one sitting? (2) what if the information they need is incorrect or missing? (3) what if the system itself fails? (4) what if the persona makes a mistake? (5) what if they realise immediately afterwards they used the wrong information?

For infrastructure WUs, write `N/A — infrastructure WU.`]

1. [Persona action; system response; including any failure handling that lives at this step]
2. ...

## Acceptance criteria

When this WU is `✅ merged / shipped`:

1. [Concrete, observable, checkable criterion — phrased as an inspection that passes or fails. Each criterion must be evaluable by a person looking at the running system, not inferred from technical state.]
2. ...

The auditor's-question test applies: *can a third-party reader read these and confirm "yes, this is shipped" by inspection alone?*

The four quality traps apply when reviewing acceptance criteria: vagueness (could this be implemented in more than one way that satisfies the wording?); technical language (does this describe implementation rather than behaviour?); happy-path-only (have failure paths been covered?); kitchen-sink (does this WU try to do more than one thing?).

## Contracts produced

[What this WU makes available to other WUs once it lands, in domain language. Not database schemas, not API endpoints — facts about the world that the system now knows. Examples:

- "A confirmed booking record, linked to a specific customer and a specific event"
- "A verified customer account: name, email, login credentials, saved payment method"
- "A published event with capacity, price, and date"

For infrastructure WUs, list the technical artefacts: "A `@nusoft/nuwiki@0.1.4` published privately on npm with caret-range trifecta deps".]

## Contracts consumed

[What must already exist before this WU can run. Each entry should map to another WU's `Contracts produced` field. If something this WU consumes is not produced by any WU in the plan, that is a planning gap — file it as an open question or a new WU before this one starts.]

## Approach

[Two or three short paragraphs. Not a design doc; just enough that an LLM teammate or a fresh operator can see how the work breaks down. If "design twice" applies (any non-trivial architectural choice), produce two fundamentally different designs in the Notes section before generating implementation.]

## What this WU does NOT do

- [Things deliberately deferred to later WUs]
- [Things that look in-scope but are not]

## Forward-compatibility commitments

[If this WU's shape decisions affect later WUs, name them here. Future WUs depend on these surviving.]

## Notes / log

### {{TODAY}} — session 1
[What was attempted, what worked, what did not, what was learned, what is next.]

## Pointers

- [Link to the decision this implements, if any]
- [Link to the persona(s) this serves]
- [Links to dependent WUs (those this consumes from, those this blocks)]
- [Links to relevant module-level contracts in `docs/contracts/`]
