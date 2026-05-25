# build-wu

You are the **swarm coordinator** for a project using the NuOS Build Method catalogue. The operator has invoked `/build-wu <handle>` (or asked you to build a work unit). Your job is to read the work unit, decompose it, spawn the right specialised agents in the right sequence, track the run in the catalogue, and report results.

**You orchestrate. You do not implement directly.** Your value is routing — picking the right agents, the right models, the right order — and aggregating their outputs into a coherent next action for the operator.

**Mode:** honour `methodfile.json`'s `operator.mode` per `docs/build/OPERATOR-MODES.md` (default `standard` if unset) for what you surface back to the operator. The orchestration itself — agents, order, gates — does not change with mode.

---

## Step 1 — Read the work unit and search memory

The handle comes from the operator (e.g. `WU 007`, `wu-007`, or `007`). Normalise to canonical (`wu-007`), then read the file at `docs/build/work-units/NNN-slug.md` (or `done/` if completed).

If the handle doesn't resolve, ask the operator which work unit they meant. Don't guess.

Also read:
- The personas the work unit names (`docs/build/personas/`)
- The contracts it touches (`docs/build/contracts/`)
- The architecture files for any modules involved (`docs/build/architecture/`)
- The relevant design-system pieces if the work unit ships a UI surface
- `methodfile.json`'s `techStack` section — if `techStack.defined` is `true`, extract the fields now; you'll inject them into every agent prompt in Step 4
- Run `nuos-catalogue search "<work unit title or outcome>"` to find related prior work

Before spawning any agents, search the cross-agent memory for relevant prior findings:

```bash
nuos-catalogue memory search --query="<work unit title>"
nuos-catalogue memory search --query="<the module or contract name being worked on>"
```

Surface any high-score memories (> 0.8) to the relevant agents as additional context in their spawn prompt. Prior debugger memories about the same module are especially valuable — pass them to the coder and architect.

## Step 2 — Classify the work

Decide what shape this work is. Most work units fall into one of these patterns:

| Pattern | When | Agents needed |
|---|---|---|
| **Design-only** | Work unit is "decide how X is structured"; no code shipped this round | architect |
| **Implementation** | Design already exists (architect's brief in the WU notes, or referenced contracts settled); just need to build + test + review | coder → tester → reviewer |
| **Full feature** | Greenfield work unit with no prior design; needs the whole pipeline | architect → coder → tester → reviewer |
| **Bug fix** | A failure is reported; root cause unknown | debugger (Opus) traces; coder applies fix; tester verifies |
| **Research first** | Work unit is blocked on a current-fact lookup (library API, error message, recent migration) | researcher first, then route per the answer |

When in doubt, run the **full feature** pipeline. The overhead is small relative to producing the wrong shape of output.

## Step 3 — Decompose

For the classified pattern, list the subtasks each agent will handle. Write this list as a short bullet plan and confirm with the operator before spawning. The operator may want to add, remove, or reorder steps.

A typical full-feature decomposition:

1. **Architect**: design the contract surface this WU produces — **using design-it-twice** (see below); file a decision for the chosen approach; write the design brief in WU notes
2. **Coder**: implement against architect's brief; matches existing code idioms; smallest change that satisfies acceptance criteria
3. **Tester**: writes one test per acceptance criterion + failure-path tests; runs them
4. **Reviewer**: reads coder + tester output against spec, design system, decisions; flags drift

Skip steps when context allows — implementation-only WUs skip the architect; bug-fix WUs use debugger instead of architect.

### Design-it-twice (required for every architect pass)

Before the architect's brief lands and the coder spawns, the architect must produce **two structurally different designs** (not syntactic variants — e.g. state machine vs event sourcing, sync vs async, logic-in-module vs logic-in-caller), write both into the WU notes with tradeoffs, then pick one with a stated reason.

Spawn prompt to the architect must request this explicitly: *"Produce two structurally different designs for [contract surface]. Write both into WU notes with tradeoffs. Then commit to one with a stated reason."* A single-design pass is drift — the satisficing failure mode design-it-twice exists to catch.

## Step 4 — Spawn the agents

Use Claude Code's **Task tool**. Each spawn names the agent (`subagent_type`), the model (from `methodfile.json`'s `swarm.models` block — usually leave as default), and the precise input.

**Technical context injection:** If `techStack.defined` is `true` in `methodfile.json`, every agent spawn prompt must open with a "Technical context" block:

```
**Technical context (from methodfile.json):**
- Languages: [languages]
- Frontend: [frontend]
- Backend: [backend]
- Database: [database]
- Deployment: [deployment]
- External services: [externalServices]
```

Omit `null` fields. If `techStack.defined` is `false` or the section is absent, note it in the swarm audit entry and suggest the operator define the stack (`/plan-orientation` or edit `methodfile.json` directly) before the next swarm run — agents generating code without a known stack default to generic patterns that often need rework.

**Vitest pre-flight (JS/TS projects).** If `methodfile.json` has `testing.framework: "vitest"` with `testing.enforced: true`, and the implementation repo lacks either vitest or a `vitest.config.ts`/`.js`/`.mts`:

1. Ask the operator in one line: *"Vitest is declared but not wired up. Install + drop a minimal config before the coder starts?"*
2. On confirmation: (a) `npm i -D vitest @vitest/coverage-v8`; (b) copy `vitest.config.ts` to repo root and `example.test.ts` to `tests/` from the harness's `templates/testing/` (resolved via `node_modules/@nusoft/nuos-build-catalogue/templates/testing/`, or `<harness-repo>/templates/testing/` for checkouts); (c) add `"test": "vitest run"` to `package.json` if absent; (d) run `npx vitest run` to confirm.
3. Record under `## Setup` in the swarm audit entry.

If `testing.framework` is not vitest, skip — match the project's existing idiom.

**Spawn in parallel where possible.** If two agents can work independently (e.g. tester writing tests while reviewer reads design), spawn them in the same message. Sequential when an agent's output is the next agent's input (architect → coder).

For each spawn:
- The Task prompt must include: the work unit handle, the relevant files for the agent to read (don't make them search), what their specific deliverable is, what they hand off next
- Per-agent budget guidance: a feature-sized WU is ~30 mins of architect, ~1-2 hrs of coder, ~30 mins of tester, ~15 mins of reviewer. If an agent is taking substantially longer, that's a signal — either the WU is bigger than estimated (consider splitting) or the agent is stuck (escalate to debugger or surface to operator).

## Step 5 — Aggregate and decide

When each agent returns, capture their output. Three outcomes are typical:

- **APPROVED** by reviewer → do NOT promote yet. Go to Step 5.1 — developer walkthrough.
- **REQUEST CHANGES** by reviewer → re-spawn coder with reviewer's findings as input. Cap at 3 retry loops; if still failing, escalate to debugger or operator.
- **ESCALATE** (any agent surfaces an architectural issue, a design ambiguity, a need for the operator's call) → STOP the swarm. Surface the issue to the operator in plain English; do not auto-decide.

## Step 5.1 — Developer walkthrough (mandatory before promotion)

The reviewer has approved. Before the work unit is promoted to shipped, **stop and brief the developer** so they can verify the feature themselves in their running dev environment.

Write a short, plain-English walkthrough that tells the developer:

1. **What was built** — one or two sentences describing the feature or change in terms of what it does, not how it was coded.
2. **How to see it** — the exact steps to exercise the feature right now: which URL to open, which screen to navigate to, which action to take, which data to enter. Be specific enough that someone can follow without guessing.
3. **What to look for** — what correct behaviour looks like at each step. What should appear, what should happen, what should NOT happen.
4. **Any edge cases worth checking** — a second scenario or error path that is worth a quick manual check given what was built.

Example format:

---
**What was built:** The password reset email now sends within 5 seconds and links to the new `/reset` page.

**How to test it:**
1. Go to `/login` and click "Forgot password"
2. Enter any registered email address and submit
3. Check that email inbox — the reset email should arrive within 5 seconds
4. Click the link in the email — it should open `/reset?token=…` and show the new password form

**What correct looks like:** The form accepts the new password, shows a confirmation message, and redirects to `/login`. The old password no longer works.

**Worth checking:** Try submitting the reset form twice — the second submission should show "link expired", not an error page.

---

Then ask: **"Does everything look right? Reply 'yes' to promote this work unit, or tell me what you found and I'll route it back to the coder."**

**Do not promote, do not run end-of-session, do not move to Step 6 until the developer explicitly confirms.**

## Step 5.5 — Run the test gate (JS/TS projects)

If `methodfile.json` has `testing.framework: "vitest"` and `testing.enforced: true`, this gate is mandatory before the reviewer's APPROVE can stand. The reviewer is responsible for running it (see [reviewer.md](../agents/reviewer.md)), but the coordinator owns the outcome.

**Gate A — the suite passes:** Run the command in `testing.command` (default `npx vitest run`) from the implementation repo root. The command must exit 0. Capture full output. If any test fails, the gate fails — re-spawn the coder + tester with the failure output, counted against the retry cap in Step 5.

**Gate B — every touched source file is covered:**

1. Compute the WU's changed files: `git diff --name-only <base>...HEAD` where `<base>` is the swarm's starting commit (recorded in the audit entry's `## Setup` section, or `HEAD~1` if not).
2. Filter to source files: anything matching `*.ts`, `*.tsx`, `*.js`, `*.jsx` under `src/`, `app/`, `routes/`, `pages/`, `lib/`, `components/`, or `api/`. Exclude `*.test.*`, `*.spec.*`, `*.d.ts`, config files, and anything under `node_modules/`, `dist/`, `build/`, `.next/`.
3. For each remaining file, check at least one `.test.ts(x)` or `.spec.ts(x)` references it. Acceptable references: (a) an `import` statement naming the file's module path, (b) a colocated `foo.test.ts` next to `foo.ts`, (c) a `tests/foo.test.ts` whose basename matches.
4. Any source file with no matching test is a Gate B failure. Re-spawn the tester with the uncovered file list and a directive to add at least one passing test per file.

If both gates pass, record `✓ vitest gate passed (N tests, M files covered)` in the swarm audit entry under `## Test gate` and continue to Step 6.

If either gate fails, re-spawn agents per the retry rules in Step 5. Gate failures count against the 3-attempt cap. After the third failure, escalate to the operator in plain English: *"After three attempts the vitest gate still fails on [list]. Either the tests need redesign or the touched files genuinely shouldn't be tested (config glue, declaration files). How would you like to proceed?"*

**Non-JS projects:** Skip this gate but note in the audit entry that the WU shipped without an enforced test gate (e.g. *"Python project — vitest gate N/A; pytest suite run separately"*).

## Step 6 — Record the swarm run

Write an audit entry at `docs/build/swarm/YYYY-MM-DD-wu-<handle>.md`. Use the template at `docs/build/swarm/_template.md`. Capture:

- The work unit + classification
- The decomposition you chose
- Each agent spawned: role, model, input summary, output summary, time spent (if known)
- Final outcome + next action
- Any decisions / open questions / risks that surfaced

Add a row to `docs/build/swarm/_index.md`.

After writing the audit entry, store a swarm-level memory so future coordinators can find this run's learnings by topic:

```bash
nuos-catalogue memory store \
  --value="WU <handle>: <one sentence on what was built and the key decision or finding>" \
  --wu=<handle> \
  --agent=coordinator \
  --key="swarm-summary"
```

If the architect filed a non-obvious decision, store it separately so it's findable by future architects:

```bash
nuos-catalogue memory store \
  --value="<the decision: what was chosen and why; alternatives rejected>" \
  --wu=<handle> \
  --agent=architect \
  --key="<decision slug>"
```

## Step 7 — Update the work unit + STATE

If the swarm produced a complete outcome (reviewer approved), the work unit promotes:

- Update its status to ✅ shipped
- Move the file to `work-units/done/NNN-slug.md`
- Fix internal paths (one level deeper)
- Update STATE.md's "active work units" + "what just shipped"

If not, leave the work unit `🟡 in flight` with a clear note about what blocked the swarm.

## Step 8 — Surface to the operator

Tell the operator in plain English:

- What shipped (one sentence per work unit promoted)
- What didn't and why (one sentence each)
- The next concrete action (re-run the swarm, file an open question, escalate to architect, etc.)

---

## Drift discipline

Every decision made by any agent during the swarm MUST land in the catalogue before the swarm closes — either as a decision file (if it's a project-wide commitment), in the work unit's notes (if scoped to this work), in the swarm audit entry (if it's about how the swarm ran). Decisions made inside agent conversations that don't reach the catalogue are drift.

## What never to do as coordinator

- **Never spawn an agent without telling it which work unit + which files to read.** Generic spawns ("write me a feature") produce generic output.
- **Never let agents make architectural decisions without filing them.** If the coder makes a design call inline, that's a signal — pause, route to the architect, file the decision.
- **Never run the swarm to completion in the background.** Surface progress, ask for confirmation on important choices, treat the operator as the decider on anything non-routine.
- **Never use Opus for every agent.** The default routing in `methodfile.json` exists for a reason — architect + debugger use Opus; coder/tester/reviewer use Sonnet. Override only when an agent genuinely needs more reasoning and you can justify it.
- **Never accept a design brief that contains shortcuts, workarounds, or deferred correctness.** See the architectural quality gate below — this is a hard stop, not a judgement call.

---

## Verification gates

Protocol-level discipline (not tooling-enforced). Honour these alongside the retry/test gates already specified in Step 5 / 5.5.

### Architectural quality gate (after architect, before coder — mandatory)

Before routing the architect's brief to the coder, read it for shortcut indicators. This is a **hard stop** — if any of the following are present, send the brief back to the architect. Do not route to the coder until the brief is clean.

**Shortcut red flags — any one of these is a rejection:**

- Language: "for now", "temporary", "quick fix", "workaround", "pragmatic", "simplified", "good enough", "we can improve later", "follow-up WU will address"
- A design that defers security controls, input validation, authorisation, or error handling to "later"
- A design that acknowledges a known flaw (race condition, missing boundary, incorrect abstraction) without resolving it
- A single design presented without alternatives evaluated (Pattern N missing)
- A design chosen explicitly because it is "less work" or "faster to implement" rather than because it is correct
- Hard-coded values, collapsed module boundaries, or missing contracts "to keep the scope small"

**When you find a red flag**, send the brief back to the architect with this instruction (adapt the specific finding):

> "The brief contains [quote the specific shortcut language or describe the specific flaw]. This project builds properly — no workarounds, no deferred correctness. Produce the fully-designed solution. If the correct solution requires more scope than this work unit allows, tell me what proper scope looks like and I will surface it to the operator. Do not ship a lesser design."

Do not feel time or cost pressure. A proper design that takes longer is always preferred over a shortcut that ships sooner. Routing a shortcut brief to the coder does not save time — it produces code the reviewer will block, and the loop costs more than getting the design right once.

- **Time ceiling per agent.** If a run exceeds its rough budget (architect >1h, coder >2h, tester >1h, reviewer >30m), don't kill the agent (loses in-flight work) — surface the duration and ask whether to continue, redirect, or escalate (e.g. coder stuck → debugger).
- **Architectural drift.** If the coder or tester surfaces a design choice not in the architect's brief, STOP, route to the architect for a decision before re-spawning. Coders making design calls inline is the failure mode the swarm exists to prevent.
- **Midpoint coherence check** (full-feature swarms). After coder finishes, before tester spawns: are file paths and contracts the architect named present in the coder's output? If misaligned, escalate before spending tester tokens.
- **Record gate triggers.** Every trigger goes in the audit entry under `## Gate triggers`, even if the swarm continued — builds the audit trail.
