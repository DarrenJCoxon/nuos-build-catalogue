# wu-new

Create a new work unit (WU) for this NuOS Build Method project.

If arguments are provided (`$ARGUMENTS` for OpenCode/Claude Code, prompt-supplied for Codex), use them as the WU title; otherwise prompt the operator for the title.

The WU template carries the **six-field outcome shape** (per D046): persona link, trigger, walkthrough with failure paths, verification (= acceptance criteria), contracts produced, contracts consumed. For infrastructure WUs (build, publish, hardening, refactors) the persona/trigger/walkthrough fields are marked `N/A — infrastructure WU` and the rest is unchanged.

Steps:

1. **Determine the next available WU number.** Scan `docs/build/work-units/` and `docs/build/work-units/done/` for the maximum 3-digit prefix. The new number is max + 1.
2. **Slugify the title** — lowercase, dashes for spaces, no special characters, max 60 chars.
3. **Ask the operator: is this an outcome WU (a user-facing capability) or an infrastructure WU (build, publish, hardening, refactor)?** If outcome, walk the full six-field flow. If infrastructure, skip persona/trigger/walkthrough and ask for the technical artefacts directly.
4. **Generate the file** at `docs/build/work-units/<NNN>-<slug>.md` from the template at `starter-kit/docs/build/work-units/001-template.md`. Replace placeholders with operator-supplied values.
5. **Prompt the operator (outcome WU) for:**
   - **Persona** — which P-NNN persona does this outcome serve? If none exists yet, prompt to run `persona-new` first. For paired outcomes (a customer-side outcome paired with an organiser-side one), capture both persona links.
   - **Trigger** — the real-world event that makes this outcome necessary. Not a UI click; the event in the persona's life that created the need.
   - **Outcome** — one paragraph. Apply the single-sentence test: *"What will be true when this is done that is not true now?"* That sentence is the outcome.
   - **Walkthrough** — numbered steps from the persona's perspective. For each step, surface the **five failure-path injection points**: (1) what if the persona cannot complete this step in one sitting? (2) what if the information is incorrect or missing? (3) what if the system itself fails? (4) what if the persona makes a mistake? (5) what if they realise immediately afterwards they used the wrong information? Failure handling lives inline at each step, not as a separate section.
   - **Acceptance criteria (= verification)** — 5 to 10 criteria, each phrased as an inspection that passes or fails. Apply the auditor's-question test: *"Can a third-party reader confirm 'yes, this is shipped' by inspection alone?"* Each criterion must be evaluable by a person looking at the running system, not inferred from technical state.
   - **Contracts produced** — what this WU makes available to other WUs once it lands, in domain language. Not "a row in the bookings table"; "a confirmed booking record, linked to a specific customer and a specific event".
   - **Contracts consumed** — what must already exist before this WU can run. Each entry should map to another WU's `Contracts produced` field. If something this WU consumes is not produced by any WU in the plan, surface that gap immediately — file it as an open question or a new WU before this one starts.
   - **Dependencies** — existing WU numbers this depends on (drawn from the contracts-consumed mapping; blank if none).
   - **Decision implemented** — D-NNN if any (blank for none).
   - **Forward-compatibility commitments** — if this WU's shape decisions affect later WUs, name them (per Pattern C).
6. **Prompt the operator (infrastructure WU) for:**
   - **Outcome** — single-sentence test as above.
   - **Acceptance criteria** — same discipline.
   - **Dependencies, decision implemented, forward-compatibility commitments** — same as outcome WU.
   - **Persona / Trigger / Walkthrough** — auto-filled with `N/A — infrastructure WU.`
   - **Contracts produced** — list the technical artefacts (e.g., "`@nusoft/nuwiki@0.1.4` published privately on npm").
   - **Contracts consumed** — list the WUs whose output this WU builds on.
7. **Apply the four quality traps** to the outcome before saving (operator review, not enforced by tooling today):
   - **Vagueness:** could this outcome be implemented in more than one way that satisfies its wording but produces different user experiences?
   - **Technical language:** does any part describe implementation rather than behaviour?
   - **Happy path only:** does the walkthrough describe only what happens when everything goes right?
   - **Kitchen sink:** does this WU try to do more than one thing? Could it be split into two outcomes with separate triggers and separate verification?

   Surface any traps that fired and offer to rewrite the affected section before saving.
8. **Add a row to `docs/build/work-units/_index.md`** in the appropriate phase section, with status `🟢 ready` (or `🔵 proposed` if dependencies aren't met).
9. **If the WU cites a P-NNN, update that persona's `Used by WUs` list** to include the new WU.
10. **Surface to the operator:**
    - The new WU file path (clickable)
    - The row added to `_index.md`
    - Any inferred dependencies that should be confirmed
    - Any quality traps that fired and were addressed (or deferred to a later refinement)

**Discipline:** every acceptance criterion must be checkable by inspection, not described as a feature. *"The login page works"* is not an acceptance criterion. *"When a user submits a valid form, a row appears in `users` and an audit entry in `audit_events`"* is.

**On the six-field shape (per D046):** the planning depth is what makes the catalogue durable. Skipping persona/trigger/walkthrough for an outcome WU produces a feature wearing an outcome-shaped name. Skipping contracts produced/consumed produces an outcome that integrates with nothing. The fields are not bureaucracy; each one closes a category of silent assumption the LLM teammate would otherwise fill in invisibly.

If the operator pushes back on the auto-numbered slug or wants to adjust acceptance criteria, accommodate. The catalogue's strength is that the operator is in charge of the substance; the protocol just makes sure the substance is recorded properly.
