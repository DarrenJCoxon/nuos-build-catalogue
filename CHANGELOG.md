# Changelog — `@nusoft/nuos-build-catalogue`

## 0.33.0 — 2026-05-31 — end-of-session CLI command (WU 112 / D130)

Adds the `nuos-catalogue end-of-session` command, wiring the pack's `end_of_session` workflow (nine steps, verify-and-gate, D130) to the CLI. The command is resumable: re-running on the same session date picks up where a previous run left off. Step state is persisted in the MIS store via `commitEndOfSessionRecord`.

**New command:**
```
nuos-catalogue end-of-session [--session-date=YYYY-MM-DD] [--active-wu=wu-NNN] [--yes]
```

**What changed:**
- `src/commands/end-of-session.ts` — nine-step end-of-session command with the `confirm_no_loss` gate, register-parity checks, and code-quality gate
- `src/runtime/mis-adapter.ts` — `commitEndOfSessionRecord` handler (persists step state for resumability); dead `stepStateJson` block removed
- `src/cli.ts` — `end-of-session` subcommand wired in

**Tests:** 274/274 (was 255/255 at 0.32.1; +19 new tests in `tests/end-of-session.test.ts`).

**Related:** WU 112, D130; pack bumped to `@nusoft/nuflow-pack-nuos-build-catalogue@0.2.0`.

---

## 0.32.1 — 2026-05-31 — store-coherence fix: disk is the edit base for all write commands (D129)

**Bug fixed:** Every CLI write command (`wu tick`, `wu advance`, `decision supersede`, `open-question resolve`) was silently overwriting newer on-disk hand-edits with a stale workflow-store snapshot. The write-path read `record.rawMarkdown` from the store (frozen at the last CLI write or migration), applied its edit to that stale string, then wrote it verbatim over the current on-disk file — clobbering any hand-edits made since. In the live incident, `wu tick wu-111 --index=14` deleted ~27 lines of notes content (the Day-2 soak section added by hand three weeks after the last CLI write).

**Fix (per D129):** All four mutation `commit*` handlers (`commitTickAC`, `commitAdvanceStatus`, `commitSupersede`, `commitResolveQuestion`) now read the current on-disk file as their edit base via a new `readDiskBase` helper. The store's `rawMarkdown` cache is updated from the freshly-written content afterward (read-through cache, per D129). If the on-disk file no longer exists when a mutation command runs, the command refuses with a clear error message telling the operator to re-sync via `migrate`, rather than silently proceeding with the stale snapshot. Create paths are unaffected (the file is written for the first time in the same operation).

**Tests:** The debugger's regression test `wu tick preserves on-disk hand-edits made after the store snapshot (WU 214 root cause)` in `tests/wu-111-soak-findings.test.ts` now passes. Per-command preservation tests added for `advance_status`, `supersede`, and `resolve`, plus a divergence-guard test (deleted on-disk file → store-coherence error). The `appendChangeLog/tick preserve content...` fixture test continues to pass. A fragile `ac-parse.test.ts` §6 test that read a live catalogue file at a hardcoded path (broken when WU 111 moved to `done/`) was rewritten to a self-contained inline fixture. Full suite: **255/255 pass**.

**Related:** WU 214, D129.

---

## 0.32.0 — 2026-05-28 — code-quality gates (lite during build, full at end-of-session)

Test gates catch broken behaviour; the deep-module gate catches shallow boundaries; nothing in the protocol catches structural code-quality drift — files sprawling past 1k lines, ad-hoc conditionals bolted into unrelated flows, bespoke helpers duplicating canonical ones, thin wrappers adding indirection. Over a multi-month build these compound silently. This release adds a two-layer gate inspired by Cursor's [thermo-nuclear code-quality review](https://github.com/cursor/plugins/tree/main/thermos), shaped to keep token cost negligible on doc-only sessions.

### Layer 1 — inline lite gate (`build-wu` Step 5.7)

After the test gates pass, before promotion, the coordinator scans the coder's staged diff for the three highest-yield structural smells: 1k-line cross, spaghetti growth (new conditionals in unrelated flows), and canonical-helper duplication. Skipped entirely for design-only WUs and doc-only changes. Findings either go back to the coder or surface to the operator — never auto-promoted. Recorded under `## Gate triggers` in the swarm audit entry.

### Layer 2 — full gate at end-of-session (`end-of-session` Step 10)

Before the commit step, if the staged diff includes source, run the full 7-point pass (code-judo, 1k-line, spaghetti, boundaries, types, atomicity, wrappers). On structural findings, escalate to `/thermo-nuclear-code-quality-review` for the harsh full rubric. Markdown-only commits skip the gate entirely — zero cost on doc-heavy sessions.

### Token economics

Both gates are conditional on staged source changes. Most catalogue sessions are doc-heavy (decisions, work units, STATE.md) and pay zero gate cost. The full ~190-line thermo-nuclear rubric only loads when explicitly escalated. The protocol additions are ~30 lines total across both files.

### Why this matters

Tests and the deep-module hook catch what they were built to catch. Code-quality drift — implementation that *works* but makes the codebase harder to reason about — slips through both. It's the silent cost: every shipped WU layers another bit of incidental complexity, and by the time anyone reviews the whole, the right fixes are no longer cheap. The lite gate catches it early; the full gate at end-of-session catches what slipped past; escalation is opt-in for when a finding smells structural. Cheap-early-warning + final-guard, scoped tightly enough that doc-only work pays nothing.

### Protocol single-source-of-truth + drift guard

`templates/protocols/` is the canonical body for every protocol. `init` and `install-protocols` fan each body out to all three tool paths (`.claude/commands/`, `.opencode/commands/`, `.agents/skills/`). Previously the dogfood copies in this repo had drifted from their canonical templates (6 of 11 protocols missing from tool dirs; remaining 6 stale). This release:

- Regenerates all 11 × 3 tool copies from canonical, bringing them fully in sync
- Exports `PROTOCOL_FILES` and `TOOLS` from `init.ts` and adds a `protocols-in-sync` test (33 assertions) that fails fast with a "run `install-protocols`" message if any copy goes stale again

---

## 0.31.0 — 2026-05-27 — deep-module discipline gates (intake, build-wu, hook)

The single most load-bearing architectural commitment in a long-running build is that the project stays built from **deep modules** — small interface, large hidden complexity — and never from shallow ones. The catalogue protocols mention design-it-twice but had no enforcement for module depth itself; over a multi-month build, agents drift into shallow patterns (util grab-bags, pass-through wrappers, micro-modules, premature splits) and once those land they are effectively permanent. This release closes the gap with a three-layer defence.

### Doctrine layer — new philosophy doc

`templates/starter-kit/docs/philosophy/deep-modules.md` is the single source of truth. It names the rule in one sentence — *"every new feature added during the build either lives inside an existing deep module, or constitutes a new deep module with a stated interface, stated hidden complexity, and a stated depth justification; there is no third option"* — lists the shallow patterns explicitly, and points to where the rule is enforced. Every gate below references this doc.

### Conversational gate layer — `/wu-new` and `/build-wu`

- `/wu-new` gains **Step 2.5 — Deep-module intake gate**. Mandatory, non-negotiable. The operator must declare which module the WU lives in before filing. Three legitimate answers (existing module, new module via architect, default-to-existing if uncertain) and three forbidden answers (util grab-bag, "figure it out later", "skip for now") are spelled out so the AI cannot route around the gate.
- Both WU templates (`001-template-simple.md`, `001-template-full.md`) now carry a required `Module:` field in the header.
- `/build-wu` gains **Step 1.5 — Load the owning module**: coordinator reads the WU's `Module:` field, loads the architecture file, and passes it to every spawned agent. If `Module:` is missing, the swarm stops and routes back through the intake gate.
- `/build-wu` gains a **Deep-module gate** alongside the existing architectural quality gate. Hard stop. Rejects new modules without a filed architecture file, modules whose interface ≈ body, banned-name grab-bags, pass-through wrappers, premature splits, and briefs that touch unclaimed source paths.

### Agent layer — architect

`templates/agents/architect.md` gains a **Module discipline — deep, not shallow** section. The architect now reads the WU's owning module before designing, fills every field of the module template when proposing a new module (interface surface, hidden complexity, depth justification, paths claimed), and treats *fold into existing module* as the default when the call is close. Module-depth shape is required as one of the design-it-twice axes for any work with module-boundary implications.

### Mechanical gate layer — new PreToolUse hook

`templates/claude-hooks/check-module-discipline.sh` reads `docs/build/architecture/*.md`, extracts every module's `## Paths claimed` block, and blocks `Write` / `Edit` / `MultiEdit` / `NotebookEdit` to source files not claimed by any module. The hook is degrade-safe: it exits 0 (allows) when the architecture register doesn't exist, when it's still bootstrapping (only template files present), when no claims are populated yet, when the file is a test/config/doc/script, or when the JSON tool input can't be parsed. It works both in-repo and against sibling implementation repos (resolves the sibling's git root, computes the relative path against that). Override is `NUOS_SKIP_MODULE_DISCIPLINE=1` for one call (logged to `.nuos-enforcement.log`).

### Architecture register changes

- `module-template.md` now carries four required new sections: **Interface surface**, **Hidden complexity**, **Depth justification**, **Paths claimed**. These are what the conversational gates inspect and what the PreToolUse hook reads.
- `architecture/_index.md` documents the new fields and explicitly names the project's commitment that every module is deep by construction.

### Install plumbing

`nuos-catalogue install-hooks` now discovers and installs every `*.sh` file under `templates/claude-hooks/` rather than the single `check-implementation-write.sh` from WU 136. All three shipped hooks (implementation-write, design-system, module-discipline) land in `.claude/hooks/`, get individually registered as commands under a single shared PreToolUse matcher in `.claude/settings.json`, and the install remains idempotent. Adding a fourth hook is now zero-code: drop the script into `templates/claude-hooks/` and the next consumer upgrade picks it up.

### Why this matters

Module depth cannot be re-evaluated later the way most architectural commitments can. A shallow module ships interface contracts, file paths, imports, and tests that callers build against; un-splitting it later means rewriting all of them, so it never happens. The discipline has to be **enforced at intake**, not at cleanup — and it has to be enforced both conversationally (the doctrine + the gates) and mechanically (the hook), because either alone is bypassable. The hook is the safety net that catches what the conversation missed; the conversation is what makes the hook's blocks actionable.

## 0.27.0 — 2026-05-18 — HTML companion views for visual registers

Markdown is the catalogue's source of truth — every agent reads it, the index walks it, the pre-commit hook gates it. But four registers are *inherently visual* and reading them as prose is harder than reading them as renders: `ui-ux/` (surfaces + sitemap), `design-system/` (colour swatches, type scale, spacing, components), `maps/` (horizon, phases, near-term), and `architecture/` (modules + dependencies). This release ships a small render pipeline that generates a companion `_view.html` for each of those four registers from the canonical markdown.

### Principle

**Companion, never canonical.** The HTML is a generated artefact, like a built site. The markdown stays authoritative. Every agent still reads `.md`; the operator opens `_view.html` when they want to *see* what they have. Regenerable any time via `nuos-catalogue render`, so the operator never has to worry about drift between markdown and HTML — re-render and they match.

### What changed

**New CLI command — `nuos-catalogue render [<register>]`.**

```bash
nuos-catalogue render                  # regenerate all four views
nuos-catalogue render surfaces         # just ui-ux/_view.html
nuos-catalogue render design-system    # just design-system/_view.html
nuos-catalogue render maps             # just maps/_view.html
nuos-catalogue render architecture     # just architecture/_view.html
```

Outputs:
- `docs/build/ui-ux/_view.html` — sitemap grouped by persona + per-surface card with the surface's "What they see", primary actions, contracts touched, and design-system pieces consumed. A skeletal wireframe hint sits above each card.
- `docs/build/design-system/_view.html` — colour swatches with real hex chips, type scale rendered at its declared px/line-height/weight (so the operator sees the actual shape, not a description), spacing scale as horizontal bars, radius examples, motion durations, plus listings of components and patterns. Voice + accessibility summaries underneath.
- `docs/build/maps/_view.html` — vertical timeline of all map files (horizon → phases → near-term), each as a card.
- `docs/build/architecture/_view.html` — module index + per-module card with responsibility, dependencies, and contracts owned.

**New `src/render/` module.** A small parser (sections, GFM tables, hex extraction, placeholder detection) plus per-register renderers and a shared HTML wrapper. Pure static HTML output — no JS, no framework, no external CSS or fonts. Self-contained files the operator can open in a browser without a build step.

**`/end-of-session` Step 8 — regenerate companion views.** When the protocol runs, if anything in `ui-ux/`, `design-system/`, `maps/`, or `architecture/` was edited, run `nuos-catalogue render` and stage the refreshed `_view.html` files alongside the markdown for the commit. If none of those registers changed, the step is skipped.

### Why

The Build Method's framing — *"the operator is most likely a domain expert, not a software engineer"* — means an operator reviewing 20 surface files or a fully populated design-system folder is reading prose descriptions of things that *should* be visual. Wireframes belong as wireframes; colour swatches belong as swatches; timelines belong as timelines. The catalogue compounds in value when those artefacts can be reviewed in their natural medium without giving up the markdown legibility that the agent swarm depends on.

This is also a deliberate reply to the *"HTML is the new Markdown"* observation that long AI-generated plans defeat human review when they're walls of text. The reply here isn't "replace markdown with HTML" — that would silently break the index, agent legibility, diff-discipline, and the pre-commit gate. The reply is *both* — markdown for machines, HTML for humans, generated from one source.

### Scope and non-goals

In: surfaces, design system, maps, architecture. Out (intentionally, for now): personas (small, text-driven; a card view adds little), decisions / open questions / risks / work units (text-first, agent-consumed; HTML adds friction), and the speculative "throwaway micro-software" / "comment on the canvas" patterns from the source proposal — held until the four base companions prove themselves.

The visual language is deliberately neutral — restrained cards, system fonts, no brand opinion. Consumer projects with strong design opinions can post-process the output or skip companion rendering entirely; the default isn't trying to be a brand.

### Backwards compatibility

Existing projects pick up the render command after upgrading the CLI; no migration needed. Re-running `/end-of-session` after the upgrade generates `_view.html` files in any registers that have content. The `_view.html` files are committed alongside the markdown — they're tracked artefacts, not gitignored, so reviewers see them in pull requests.

## 0.26.0 — 2026-05-18 — Operator modes (coaching / standard / developer)

Every operator-facing protocol now adapts its tone, explanation depth, and assumed background to one of three modes. The first `/start-of-session` walks the operator through picking a mode; the choice persists in `methodfile.json` and applies to every later session.

### What changed

**`methodfile.json` schema — new `operator` block.**

```json
"operator": {
  "mode": null,
  "modeSelectedAt": null
}
```

`mode` is `null` on a fresh scaffold and is set to `"coaching"`, `"standard"`, or `"developer"` the first time the operator runs `/start-of-session`.

**New `docs/build/OPERATOR-MODES.md`** — canonical reference for what each mode means. Every operator-facing protocol points at this file:

- **Coaching** — no-dev-experience audience. Every step is explained before it runs, every technical term is defined inline with an analogy, optional-depth offers throughout, pacing roughly 1.5× standard. For domain experts using the catalogue to learn the build process while producing real artefacts.
- **Standard** (default) — domain-expert audience, plain English throughout, brief rationale where helpful. The catalogue's original voice; unchanged.
- **Developer** — experienced-engineer audience. Technical vocabulary used directly without preamble, no hand-holding, terse prose, diff-friendly framing. Discipline (drift, design-it-twice, verification gates) still applies; only the *explanation* is trimmed.

**`/start-of-session` — new Step 0.** When `operator.mode` is `null`, the protocol opens with a one-time mode picker before reading STATE.md. The operator's choice is written into `methodfile.json` and confirmed back. Picker can be re-run by setting the field back to `null` or running `nuos-catalogue mode <name>`.

**Mode-aware preamble in every operator-facing protocol.** `plan-orientation`, `plan-architecture`, `plan-uiux`, `plan-maps`, `plan-initial-wu`, `plan-review`, `start-of-session`, `end-of-session`, `wu-new`, `persona-new`, `build-wu` each open by reading `operator.mode` and adopting the matching tone from `OPERATOR-MODES.md`. The structural steps and artefacts produced are identical across modes — only the conversation changes.

**New `nuos-catalogue mode` CLI command.**

```bash
nuos-catalogue mode                  # print the current mode (or "(unset)")
nuos-catalogue mode coaching         # switch to coaching mode
nuos-catalogue mode standard
nuos-catalogue mode developer
```

Sets `operator.mode` and stamps `operator.modeSelectedAt` with today's date. Validates against the three known values; rejects anything else without writing.

### Why

The planning arc was written assuming "domain expert, not a software engineer" throughout. That voice is right for the catalogue's centre-of-mass audience, but two flanks fell outside it: people with no software background at all (who needed every term defined and every step explained), and experienced developers (who wanted the protocols out of their way). Modes let the same protocols serve all three audiences without forking the catalogue or duplicating the artefacts.

The picker is one-time at first `/start-of-session` rather than at `init` time deliberately: the operator should see what the arc looks like before being asked to pitch its voice, and `init` stays zero-prompt so `npx ... init` just works.

### Backwards compatibility

Projects that initialised before 0.26.0 will not have an `operator` block in their `methodfile.json`. The `mode` CLI command and every protocol handle the missing block as if `mode === null` — the next `/start-of-session` will run the picker. No migration is required.

## 0.25.0 — 2026-05-17 — Vitest as a built-in build requirement

The harness now treats **vitest** as the default test runner for JS/TS implementation repos, and the swarm enforces a two-part test gate before any work unit can promote. The operator never has to set this up — the coordinator wires vitest into the implementation repo on first run and runs the gate on every WU thereafter.

### What changed

**`methodfile.json` schema — new `testing` block.** Starter-kit `methodfile.json` now ships with:

```json
"testing": {
  "framework": "vitest",
  "command": "npx vitest run",
  "configPath": "vitest.config.ts",
  "enforced": true,
  "policy": "every-touched-source-file-must-be-covered-by-a-passing-test",
  "appliesTo": ["typescript", "javascript", "tsx", "jsx"]
}
```

For non-JS projects, `framework` should be set to whatever the project uses (or `null` to opt out — the coordinator warns but doesn't block).

**`build-wu.md` protocol — two new steps.**

- *Step 4 vitest pre-flight* (JS/TS only). Before spawning the coder, the coordinator checks the implementation repo has vitest installed and a `vitest.config.ts` present. If not, it installs vitest, copies `templates/testing/vitest.config.ts` and `templates/testing/example.test.ts` from the harness, adds a `"test": "vitest run"` script to the repo's `package.json`, and runs `vitest run` once to confirm the wiring.
- *Step 5.5 test gate*. After the coder + tester finish and before the reviewer approves, the reviewer runs two sub-gates: (A) `npx vitest run` exits 0; (B) every source file in `git diff --name-only` of the WU's changes is referenced by at least one `.test.ts(x)` or `.spec.ts(x)`. Gate failures count against the 3-attempt retry cap and escalate to the operator on the third.

**Agent templates updated.**

- `tester.md` — vitest is the default for JS/TS; per-touched-file coverage is mandatory.
- `coder.md` — write testable code (export units the tester needs, keep side effects at the edges).
- `reviewer.md` — runs both vitest sub-gates; uncovered touched files are BLOCKER findings.

**New `templates/testing/` scaffolding.** Ships `vitest.config.ts`, a smoke-test `example.test.ts`, and a README. These are runtime-copied into the implementation repo by the swarm — not by `nuos-catalogue init`.

### Why

Up to 0.24.x the harness was deliberately test-framework-agnostic: the tester template said "match whatever the project uses." That flexibility cost discipline. JS/TS WUs sometimes shipped without any tests at all because no enforcement existed. Vitest is now the standard for JS/TS work; non-JS projects keep the existing flexibility by setting `testing.framework` to their own runner or `null`.

### Upgrade notes

- Existing catalogues: re-run `nuos-catalogue install-protocols` to pick up the new build-wu.md and agent templates. Add the `testing` block to your `methodfile.json` manually (the schema lives in the starter-kit template).
- The first swarm run after upgrade on a JS/TS project will prompt the operator before installing vitest into the implementation repo.

## 0.21.0 — 2026-05-13 — Harness implementation-write gate (WU 136)

Closes the protocol gap surfaced in Session 80: an agent can file a decision in the catalogue and then ship hours of substantive implementation work in a sibling repo (sensight/, nuvector/, …) before any catalogue trace gets written. The pre-commit hook only watches the catalogue repo itself; the existing Claude PreToolUse hook (WU 128) watches catalogue file writes only. So sibling-repo writes had no gate at all. This release ships one.

### New CLI commands

`nuos-catalogue install-hooks`

Idempotently installs the Claude PreToolUse hook into `.claude/hooks/check-implementation-write.sh` of the current project, merges the matcher into `.claude/settings.json` (preserves any existing PreToolUse entries), and adds `.nuos-catalogue/active-wu` to `.gitignore`. Re-run after package upgrades; the hook script is overwritten, the settings entry is added only if missing.

`nuos-catalogue wu start <handle>`

Writes the handle to `.nuos-catalogue/active-wu`. The PreToolUse hook reads this marker to decide whether to allow a write outside the catalogue project root.

`nuos-catalogue wu end`

Removes the marker. Idempotent — succeeds silently when no marker exists.

`nuos-catalogue wu current`

Prints the current active WU handle, or `(none)` when no marker. Always exits 0.

### The gate behaviour

The shipped `check-implementation-write.sh` hook fires on every `Write` / `Edit` / `MultiEdit` / `NotebookEdit` tool call. It classifies the target file:

- **Inside the catalogue project root** — always allowed. Editing the catalogue itself (work units, decisions, indexes, hooks, scripts) is the catalogue trace; no WU declaration required.
- **Outside the catalogue project root** — requires an active WU declared via `wu start`. Without it, the call is blocked (exit code 2) with a clear stderr message naming the blocked path, the missing marker, and the two recovery commands.

Touches are logged to `.nuos-enforcement.log` with the declared WU handle (or `blocked` / `bypassed`) so the audit trail names the work.

### Escape hatch

`NUOS_SKIP_IMPLEMENTATION_GATE=1` bypasses the block for a single call, with a strong warning emitted to stderr and a `implementation-gate-bypassed` line in the enforcement log. Intended for genuinely catalogue-orthogonal writes only; CLAUDE.md continues to prohibit bypass for substantive build work.

### Dogfooding

The nuos catalogue itself installs this hook (via `nuos-catalogue install-hooks` run in the catalogue repo). The break it closes was found in the catalogue's own session work; the same mechanism now guards future sessions.

### Internals

- `templates/claude-hooks/check-implementation-write.sh` — the hook source, shipped in the package.
- `src/commands/wu-active.ts` — pure file operations for the marker (no workflow-store interaction; safe to invoke before the catalogue is fully migrated).
- `src/commands/install-claude-hooks.ts` — idempotent installer with settings.json + .gitignore merge helpers.

20 new tests across `tests/wu-active.test.ts` and `tests/install-claude-hooks.test.ts`.

References: [WU 136](https://github.com/DarrenJCoxon/nuos/blob/main/docs/build/work-units/136-harness-implementation-write-gate.md).

## 0.18.0 — 2026-05-12 — Cross-agent memory via NuVector

Closes the most significant gap between the harness and odd-flow: agents can now read from and write to a shared semantic memory store that persists across all swarm runs. A coder working on WU 031 can retrieve what the debugger learned on WU 007. A future architect can ask "how did we handle RLS before?" and get the answer without reading every session log.

### Two new CLI commands

`nuos-catalogue memory store --value="..." [--wu=wu-007] [--agent=architect] [--key="label"]`

Embeds the value text and writes it to the NuVector store with `kind: agent_memory`, tagged with the agent role, work unit handle, and optional key label. Any agent at any future point can retrieve it by semantic query.

`nuos-catalogue memory search --query="..." [--limit=N] [--wu=wu-007] [--agent=architect]`

Embeds the query and retrieves semantically similar memories. Returns ranked results with score, context (agent + WU + date), and the stored text. Optional `--wu` and `--agent` flags filter results post-retrieval. Minimum score threshold 0.3; anything below that is noise.

Both commands use the same NuVector store as the catalogue's search index (`.nuos-catalogue/index.nv`), distinguished by `kind: agent_memory`. No new infrastructure — if `nuos-catalogue search` works, `nuos-catalogue memory` works.

### Memory wired into every agent and the coordinator

All six agent definitions now include a **Cross-agent memory** section:
- `architect` — search before designing; store key decisions and rejected alternatives
- `coder` — search for prior implementation patterns; store anything surprising
- `tester` — search for known flaky areas; store testability findings
- `reviewer` — search for recurring patterns; store cross-WU review trends
- `debugger` — search first (root causes recur most of all); store symptom → root cause → fix
- `researcher` — search before fetching; store findings with source URLs

The `build-wu` coordinator protocol gains memory instructions at two points:
1. **Before spawning** (Step 1): search for relevant prior memories and pass high-score hits to agents as additional context in their spawn prompt
2. **After filing the audit** (Step 6): store a coordinator-level swarm summary memory + any non-obvious architect decisions

### `methodfile.json` harness wired

`harness.wired` flips from `false` to `true`. `harness.runtime.nuvector` is now `".nuos-catalogue/index.nv"` — the same path the index and search commands use. Projects that bootstrapped via `init` already have this store; running `nuos-catalogue index` populates it; `memory store` and `memory search` work immediately after.

### Migration from 0.17.1

No breaking changes. The memory commands are additive. The agent definitions and build-wu protocol are templates — existing projects that customised them won't see the changes until they re-run `install-protocols`. `methodfile.json` changes only affect new projects bootstrapped via `init`; existing projects should update their `harness` block manually if they want the `wired: true` signal.

## 0.17.1 — 2026-05-12 — publishConfig access fix

Flipped `publishConfig.access` to `"public"` so `npm publish` correctly publishes to the public registry. No code changes; package behaviour is identical to 0.17.0.

## 0.17.0 — 2026-05-12 — Swarm CLI commands + verification gates

Closes the swarm feature loop. 0.15.0 added agents; 0.16.0 added the coordinator and audit register; this release adds CLI introspection and safety gates.

### New CLI commands

`nuos-catalogue swarm status [--limit=N]` lists recent `/build-wu` runs in reverse chronological order, reading audit files from `docs/build/swarm/`. Shows date, work unit handle, and outcome (APPROVED / REQUEST CHANGES / ESCALATED). Default limit 10.

`nuos-catalogue swarm cost` aggregates estimated cost lines from each audit file. Honest framing: these are best-effort estimates; real spend lives on the Anthropic billing dashboard. The CLI's value is showing per-WU cost trajectory at a glance. Both commands use lenient parsers — a mid-write or hand-edited swarm file surfaces what it can rather than failing.

### Verification gates in the coordinator

Six gates baked into `templates/protocols/build-wu.md`:

- **Retry cap** — after 3 reviewer REQUEST CHANGES loops, stop and escalate. The spec or design needs clarifying, not a fourth code pass.
- **Cost ceiling** — when a single WU's swarm cost crosses £10, surface to operator before continuing. Soft ceiling; operator can authorise more.
- **Agent time ceiling** — if an agent runs substantially over budget (architect >1 hr, coder >2 hrs, etc.), surface duration before continuing.
- **Architectural drift detection** — if coder or tester surfaces a design choice not in the architect's brief, stop and route to architect first. This is the load-bearing gate: preventing coders from making design calls inline is the swarm pattern's whole value.
- **Midpoint coherence check** — after coder finishes, before tester spawns, verify the coder's output is visibly consistent with the architect's brief. Catch drift before more tokens get spent.
- **Gate trigger recording** — every gate trigger gets logged in the swarm audit entry, even when the swarm continues.

Tests: 144/145 (one pre-existing AC-parse real-fixture failure unrelated). `tests/swarm.test.ts` adds 5 new tests covering both subcommands.

## 0.16.0 — 2026-05-12 — `/build-wu` coordinator protocol + swarm register

Wires up the swarm pattern end-to-end. The six agent definitions shipped in 0.15.0; this release adds the coordinator that orchestrates them against a work unit, and the audit trail for each swarm run.

### `/build-wu` coordinator protocol (`templates/protocols/build-wu.md`)

The coordinator reads a work unit by handle; classifies it (design-only / implementation / full-feature / bug-fix / research-first); decomposes; spawns the appropriate agents in the right order via Claude Code's Task tool; aggregates results; files the swarm audit entry; updates the work unit and STATE; reports back to the operator in plain English.

Spawning semantics: parallel where agents can work independently (e.g. tester writing tests while reviewer reads the design); sequential when an agent's output is the next agent's input (architect → coder). Each spawn receives the work unit handle, the relevant files to read, its specific deliverable, and what it hands off.

### Swarm register (`docs/build/swarm/`)

A new first-class register for swarm run audit entries. Every `/build-wu` invocation files `YYYY-MM-DD-wu-<handle>.md` capturing: classification, decomposition chosen, each agent spawned (role + model + input summary + output summary + time), final outcome, decisions/questions/risks that surfaced, estimated cost. The register is sortable and searchable so the operator can review cost over time and spot escalation patterns.

`init` and `install-protocols` extended to fan `build-wu.md` out to `.claude/commands/`, `.opencode/commands/`, and `.agents/skills/build-wu/SKILL.md`. `methodfile.json` registers list includes `"swarm": "swarm/"` so the migration runner and summary recognise the new register.

Tests: 139/140 (one pre-existing AC-parse real-fixture failure unrelated). Assertions added for build-wu fan-out and swarm register presence after init.

## 0.15.0 — 2026-05-12 — Swarm agent definitions

Adds six specialised AI agent definitions to the harness. `init` installs them automatically into `.claude/agents/`; `install-protocols` refreshes them alongside the protocol bodies. Each agent has Claude Code-compatible frontmatter (name, description, model, tools).

| Agent | Model | Role |
|---|---|---|
| architect | opus | Design, contracts, module boundaries |
| debugger | opus | Trace failures when work breaks |
| coder | sonnet | Implementation — the 80% of build work |
| tester | sonnet | Tests against acceptance criteria |
| reviewer | sonnet | Review against spec and design system |
| researcher | haiku | Online lookups, doc reading, summaries |

Opus handles reasoning-heavy work (design choices, debugging). Sonnet covers the coding/test/review 80%. Haiku handles fast lookup work where recall and scan matter more than deep reasoning. On a real build the 80/20 Sonnet/Opus split translates to roughly 30% lower spend vs running everything through Opus.

Model routing defaults live in `methodfile.json` under `swarm.models`. Each entry is overridable per-spawn by passing `model: '...'` to the Task tool.

`GLOSSARY.md` gains Swarm and Tier entries. `WELCOME.md` gains a "How the implementation work itself runs" section.

Tests: 139/140. `init.test.ts` asserts agent presence, correct model frontmatter per role, and methodfile swarm block.

## 0.14.2 — 2026-05-12 — Crawler includes whole docs tree

The search crawler previously hardcoded a four-subdir allowlist (`build/`, `contracts/`, `philosophy/`, `guides/`) and silently skipped everything else under `docs/`. On the nuos catalogue this meant 10 top-level docs files and 4 subdirs — including strategically important files like `THE-NUOS-BUILD-METHOD.md`, `MVP-NEXT-STEPS.md`, and `PHASE-4-SIGNOFF.md` — were invisible to `nuos-catalogue search`.

New behaviour: recursive crawl of the whole `docs/` tree from the catalogue root, using the same skip rules as before for archived dirs and tooling dirs, plus two new skip rules:
- `*-template.md` files (added in 0.14.0; these are scaffolding, not content)
- Slash-command directories (`.opencode/`, `.claude/`, `.agents/`) which contain derived protocol copies, not source content

Verified on nuos's own catalogue: 162 files / 1936 chunks before → 176 files / 2223 chunks after.

## 0.14.1 — 2026-05-12 — Init is zero-prompt by default

The 0.14.0 init flow asked four pre-install questions and printed a 20-line closing message. Both were the wrong shape for the target audience — a non-developer types `npx ... init` expecting the package to install and tell them one thing to do next.

Init is now zero-prompt by default. Defaults fill in everything (name from directory basename; tagline and domain empty; role `"consumer"`). Users who want the prompted flow pass `--interactive`. The `--yes` flag is removed (no longer needed).

Closing output is three lines: `✅ Done.` followed by a single instruction to run `/start-of-session` in Claude Code. The 5-phase content is in `WELCOME.md` for when the user wants it.

## 0.14.0 — 2026-05-12 — Outcomes-driven AI-guided planning

Reshapes the first-run experience to mirror the outcomes-driven approach used in odd-flow. A domain expert who is not a software engineer previously encountered a catalogue full of undefined method terms with no scaffolding for the act of planning a project. This release wires up a 5-phase planning arc — each phase its own session, each producing real catalogue artefacts — until the catalogue has the substrate that makes everything downstream coherent.

The five phases:

| Phase | What it produces |
|---|---|
| A — Orientation | Project description, personas, the horizon |
| B — Architecture & Contracts | Major pieces and what they exchange |
| C — UI/UX + Design System | Every surface, plus shared design language |
| D — Maps | Phases of work and near-term plan |
| E — Initial Work Units | First 5–10 things to build, dependency-ordered |

Phase A ships end-to-end in this release (`plan-orientation.md` protocol). Phases B–E ship in 0.15.0–0.17.0; each register and protocol is already scaffolded so the structure is stable.

### New content

Five first-class registers inside `docs/build/`: `maps/`, `architecture/`, `contracts/`, `ui-ux/`, `design-system/` (with token files for colour, typography, spacing, motion, radius/elevation, plus `components/`, `patterns/`, `voice`, `accessibility`). `WELCOME.md` gives a 5-minute plain-English orientation; `GLOSSARY.md` defines every term once.

### New protocol and CLI command

`templates/protocols/plan-orientation.md` is a Phase A conversational script the AI follows when the operator types `/plan-orientation`. `src/commands/plan.ts` adds `nuos-catalogue plan status` which prints the current planning phase and whether each phase is complete. `methodfile.json` gains a `planning` block tracking each phase's state.

### Templates and plain-English rewrites

Two work unit templates: `001-template-simple.md` (4-field shape for everyday work) and `001-template-full.md` (the prior 13-field shape, opt-in via `--full`). All six existing register `_index.md` files, `STATE.md`, and all four protocol bodies rewritten in plain English with jargon defined on first use.

## 0.13.0 — 2026-05-11 — WU 111 soak findings + bundled git hooks

The 0.12.0 → 0.13.0 release closes four real-use issues surfaced when running the CLI against the live nuos catalogue via `npx` (WU 111 Day-1 soak) plus extends `init` to bundle the project's git hooks. 135/135 tests pass.

### Defaults walk up from cwd (Day-1 soak finding 1)

Pre-0.13, the CLI resolved `--build-root`, `--workflows`, `--catalogue`, etc. relative to the **package install location** (e.g. `/Users/me/.npm/_npx/abc/node_modules/@nusoft/nuos-build-catalogue/..`). That made every `npx`-style invocation point at the wrong directory. Workaround was setting `NUOS_CATALOGUE_*` env vars for every run.

0.13 walks up from `process.cwd()` looking for the nearest directory that contains `docs/build/`, the same way `git` finds its repo root. Invoke `nuos-catalogue migrate` from anywhere inside the project — it finds the right root. `--build-root` and the matching env vars still take precedence when set; the walk-up only kicks in when no explicit value is supplied. If no `docs/build/` exists from cwd up to the filesystem root, write commands now throw with a clear hint instead of silently using the package install location.

Path-resolution helpers moved to a new `src/path-resolution.ts` module so they're directly unit-testable (see `tests/wu-111-soak-findings.test.ts`).

### Gitignore note from `migrate` (Day-1 soak finding 2)

After `migrate` creates `.nuos-catalogue/workflows.json`, the CLI checks whether the project's `.gitignore` excludes the directory. If a `.gitignore` exists and is missing the entry, `migrate` now prints a short `note:` at the end of the run telling the operator to add `.nuos-catalogue/`. Silent when `.gitignore` is absent (the project may not be a git repo) or already correct. This complements the existing behaviour of `init`, which adds the entry automatically when bootstrapping a fresh project — the note covers the corner case of an existing repo adopting the catalogue without running `init`.

### `--index` is 1-based at the CLI boundary (Day-1 soak finding 3)

`nuos-catalogue wu tick <handle> --index=N --evidence="..."` previously accepted `--index=0` to tick the first AC, but the audit-log entry used a mix of 0-based ("Acceptance criterion at index 0 ticked") and 1-based ("Acceptance criterion 1 ticked: ..."). The flag is now 1-based end-to-end: `--index=1` ticks the first AC, the audit-log entries use 1-based numbering in both the structural-tick and audit-log-only paths. `--index=0` is rejected with a message naming the 1-based convention.

`parseHistoryEvidence` still reads legacy 0-based "at index N" entries for backward compatibility, so audit trails written by older versions remain valid.

### Anchored `## Build catalogue history` heading lookup (Day-1 soak finding 4)

`appendChangeLog` and `parseHistoryEvidence` previously located the history section via `rawMarkdown.indexOf('## Build catalogue history')`, which matched **any** mention of that string — including prose references inside code spans and paragraphs. WU 111's own notes log discusses the section by name when explaining the audit-trail design; the false match meant the first tick on WU 111 wrote its changelog entry into the wrong location (after the prose mention) instead of creating a new section at the end of the file.

Both functions now use an anchored regex (`/^## Build catalogue history\s*$/m`). Prose mentions are ignored. Real headings — at start-of-line, with optional trailing whitespace — match.

### `init` now bundles git hooks (carried over from 0.13 mid-flight work)

`nuos-catalogue init` writes `.git/hooks/pre-commit` and `.git/hooks/post-commit` from the bundled canonical bodies, plus a `scripts/install-hooks.sh` for the project to re-run after a clone. Consumers no longer need to copy hooks across by hand from the nuos repo.

### Migration from 0.12.0

No breaking changes for anyone using the documented env-var path. The flag-boundary change for `--index` is breaking for anyone calling `cmdWuTick({index: 0, ...})` directly from TypeScript; update to `index: 1`. The 121 pre-existing tests required two callsite updates in `tests/commands-write.test.ts` and `tests/ac-parse.test.ts` to switch from 0-based to 1-based.

## 0.12.0 — 2026-05-11 — Ollama embedder default

Switches the local-Ollama embedder default model from `qwen3-embedding:8b` (4096 dims) to `qwen3-embedding:0.6b` (1024 dims). The smaller model is the right default for fast iteration on local hardware; the larger model is still selectable via the embedder factory and works unchanged. Closes a soak-mode usability cut on user-owned AMD Ryzen rigs.

## 0.11.0 — 2026-05-11 — Init fans protocols across coding tools

`nuos-catalogue init` now writes the four NuOS Build Method protocols into all three locations the cross-tool harness expects (`.claude/commands/`, `.opencode/commands/`, `.agents/skills/<protocol>/SKILL.md`) so a fresh project works in Claude Code, OpenCode, and Codex CLI out of the box.

## 0.10.0 — 2026-05-10 — `init` and `install-protocols` commands

Closes the gap that the manual Sensight scaffold made obvious: there was no single command for adopting the build catalogue on a new project. Two new operator-facing commands ship together; the CLI package now bundles the protocol bodies and starter-kit content as data files so consumers don't need a sibling nuos repo.

### `nuos-catalogue init`

Single-command bootstrap of a new project's catalogue. Replaces the previous six-step manual scaffold (mkdir + copy starter-kit + customise STATE.md + customise methodfile + copy protocols + .gitignore overrides + first migrate).

```bash
cd /path/to/your-new-project

# Interactive (prompts for project name, tagline, domain, role)
nuos-catalogue init

# Or non-interactive
nuos-catalogue init --name=foo --tagline="..." --domain=foo.com --role=consumer --yes
```

What it does:

1. Refuses if `docs/build/` already exists (one-shot bootstrap).
2. Creates `docs/build/` from the bundled starter-kit (substituting `{{PROJECT_NAME}}`, `{{PROJECT_TAGLINE}}`, `{{PROJECT_DOMAIN}}`, `{{PROJECT_ROLE}}`, `{{TODAY}}`).
3. Writes `methodfile.json` at the repo root with the same substitutions.
4. Copies the four NuOS Build Method protocols (start-of-session, end-of-session, wu-new, persona-new) into `.claude/commands/`. Creates the directory if missing; preserves any existing slash commands the project has.
5. Appends a "Build catalogue (NuOS Build Method)" section to `CLAUDE.md` (creates `CLAUDE.md` if missing; preserves existing content; idempotent — re-running won't double-append).
6. Updates `.gitignore`:
   - **Adds `!docs/build/` + `!docs/build/**` override IF an unanchored `build/` rule is present** (this is the gotcha that bit nuos at Session 53 and Sensight in this session — Next.js / Cargo projects routinely have a generic `build/` rule that silently ignores the catalogue without the negation).
   - **Adds `.nuos-catalogue/` ignore** per nuos D047 (the JSON workflow store is local state in Mode 1).
7. Surfaces the env-var commands the operator should add to their shell profile.

### `nuos-catalogue install-protocols`

Refreshes the four protocol bodies in `.claude/commands/` from the canonical bodies bundled with this CLI package. Use after upgrading the CLI to a new version that ships updated protocols.

```bash
cd /path/to/project-with-stale-protocols
nuos-catalogue install-protocols
```

Reports `created`, `updated`, or `unchanged` per protocol. Idempotent — running on an already-current `.claude/commands/` is a no-op that prints four `unchanged` lines.

### Bundled templates

The CLI package now ships two new directories:

- `templates/protocols/` — the four protocol bodies (canonical copies of `nuos/scripts/protocols/*.md`)
- `templates/starter-kit/` — the full starter-kit content (canonical copy of `nuos/starter-kit/`)

`package.json` `files` array updated to include `templates`. Both `init` and `install-protocols` resolve from `dist/src/cli.js` upward to find the bundled templates.

### Test totals

121/121 across 38 suites (was 113/113 in 0.9.0; +8 new tests across init's full bootstrap, gitignore handling, CLAUDE.md preservation, install-protocols created/unchanged/updated states).

### What this enables

The Sensight scaffold I just did manually for the maintainer is now a single command. The next consumer-product adoption (NuTutor, floe-studio, eventually third-party adopters per WU 132's `@nusoft/nuos-build`) takes one command instead of seven. Sensight stays clean: re-running `install-protocols` against Sensight is a no-op (the protocols I copied manually match the bundled canonical bit-for-bit).

## 0.9.0 — 2026-05-10 — Env-var support for multi-project use

Adds env-var defaults so the CLI works ergonomically against any catalogue, not just the nuos sibling. **Use case:** Sensight (the first consumer-product adoption of the build-catalogue tooling) has its catalogue at `current-projects/sensight/docs/build/` — passing `--build-root=...` to every command was friction. Now the maintainer sets the env vars in their shell profile (or per-project via direnv / .envrc) and every CLI command picks them up.

**New env vars:**

| Variable | What it controls | Maps to flag |
| --- | --- | --- |
| `NUOS_CATALOGUE_BUILD_ROOT` | Path to the catalogue's `docs/build/` dir | `--build-root` |
| `NUOS_CATALOGUE_WORKFLOWS` | Path to the JSON workflow store file | `--workflows` |
| `NUOS_CATALOGUE_ROOT` | Path to the catalogue's `docs/` dir (semantic-search index source) | `--catalogue` |
| `NUOS_CATALOGUE_INDEX_DIR` | Default parent dir for `index.nv` + `workflows.json` | (no flag; controls computed defaults) |

Resolution order is unchanged from before: explicit flag (highest precedence) → env var → package-relative fallback (works only against the nuos catalogue as a sibling). The fallback path is preserved for backward compatibility with the original WU 110 use case; new consumers should use env vars or flags.

Help text in `nuos-catalogue help` now documents all five env vars.

**Tests:** 113/113 (unchanged; the env-var support is additive).

**Smoke verified against Sensight:**

```bash
export NUOS_CATALOGUE_BUILD_ROOT="/path/to/sensight/docs/build"
export NUOS_CATALOGUE_WORKFLOWS="/path/to/sensight/.nuos-catalogue/workflows.json"
nuos-catalogue summary
# → reads Sensight's catalogue, no flags needed
```

## 0.8.1 — 2026-05-10 — Dep-range fix for pack at 0.1.0

Patch follow-up to 0.8.0. The pack repo bumped 0.0.6 → 0.1.0 in this
session's commit `c85f607`, but the CLI's `dependencies` range for
`@nusoft/nuflow-pack-nuos-build-catalogue` was still `^0.0.6` —
which (per semver caret rules on `0.0.x`) does not match `0.1.0`.
Caught before publish; range bumped to `^0.1.0` per D045 (caret
ranges, never exact pins).

## 0.8.0 — 2026-05-10 — Phase J: WU 111 ship readiness

Marks the CLI as ready for the WU 111 cutover. No new commands or behaviour changes since 0.7.0 — this is the version-and-documentation release that ships alongside `@nusoft/nuflow-pack-nuos-build-catalogue@0.1.0`.

**Added**
- `docs/INTEGRATION-RUNBOOK.md` — operator-facing runbook covering install on a new machine, four-step smoke verification, day-to-day use, build catalogue history convention, and troubleshooting. The canonical reference for "how to use this CLI from clean install to first commit".
- `.gitignore` for `.nuos-catalogue/` — the JSON workflow store is local state in Mode 1 (markdown canonical). Re-running `migrate` is deterministic; the file does not need to live in git. Mode 2 (post-WU-113) may revisit if JSON becomes canonical.

**Test totals:** 113/113 across 33 suites (unchanged from 0.7.0).

**What's not in this release**
- The actual `npm publish` of either this CLI or the pack (the maintainer's guardrail).
- The live one-shot migration commit (the maintainer chooses when to commit `.nuos-catalogue/workflows.json` if at all — per the gitignore, today's default is "don't commit").
- The 5-day soak begins after publish.

## 0.7.0 — 2026-05-10 — Phase H part 3 interactive create commands (WU 111)

Closes WU 111's last substantive surface before Phase J. Four interactive `create` commands ship: `wu create`, `decision create`, `question create`, `persona create`. Each walks the operator through the relevant register's protocol body (per `scripts/protocols/wu-new.md`, `persona-new.md`, etc.) and drives the workflow lifecycle to commit.

**New CLI subcommands:**

```
nuos-catalogue wu       create   (interactive — multi-step prompts)
nuos-catalogue decision create   (interactive)
nuos-catalogue question create   (interactive)
nuos-catalogue persona  create   (interactive — seven dimensions + acid-test per D046)
```

**Architecture.** Three new modules:

- `src/runtime/markdown-render.ts` — pure renderers per register. `renderWorkUnit` produces the D046 six-field shape (with N/A markers for infrastructure WUs); `renderDecision` produces the Context / Decision / Consequences / Alternatives shape; `renderOpenQuestion` produces Why-it-matters / Options / Evidence-needed; `renderPersona` walks the seven dimensions + acid-test.
- `src/commands/prompt.ts` — readline-based prompt helpers using `node:readline/promises` (no new deps). Exports `Prompt` interface (so tests can mock), `openPrompt()` factory, and `askUntilValid` validation loop helper.
- `src/commands/create.ts` — four interactive handlers + four pure capture-builders. Each interactive command takes an injected `Prompt` so tests can substitute a `MockPrompt`.

**MIS adapter extended for `*.create` intents.** New `commitCreateRecord` handler: renders the workflow's typed payload via the appropriate renderer, writes the new markdown file at `<register-dir>/<handle>-<slug>.md` (creating the register dir if needed — e.g. `personas/` is empty in the live catalogue and the persona create operation auto-creates it), adds a new `MigratedRecord` to the JSON store with the appropriate initial status. The `canCommit` check skips the subjects-must-exist guard for create intents (the placeholder `wu-pending` / `d-pending` etc. doesn't yet exist).

**Test approach.** Three layers:

1. **Renderers** — pure-function tests confirming output matches the expected catalogue style (5 tests).
2. **Capture-builders** — pure-function tests confirming the typed payload shape (3 tests).
3. **End-to-end via mock Prompt** — `MockPrompt` scripts answers in order; the test runs the interactive shell, drives the workflow lifecycle, then asserts the resulting markdown file on disk + the JSON store record (4 tests, one per command).

**`wu create` UX details.**
- `kind` choice via `askChoice` over `[feature, infrastructure, spike, remediation]`.
- For infrastructure WUs, persona/trigger/walkthrough are auto-marked `N/A — infrastructure WU` and the prompts are skipped.
- For outcome WUs, all three are required (validated non-empty).
- AC entered one-per-line with a blank line to finish; same pattern for contracts produced + contracts consumed.
- Approach paragraph is optional (defaults to no).

**`persona create` UX details.**
- Seven dimensions each prompted as multi-line input (sentinel `.`).
- Acid-test refinement is the eighth multi-line prompt.
- Validation: every dimension non-empty after trim. The pack's workflow rejects with a clear error if any dimension is empty.

**`decision create` and `question create` UX details.**
- Decision: title, then context/decision/consequences as multi-line. Optional alternatives-considered.
- Question: title, why-it-matters, optional options sketch, optional evidence-needed, optional CSV of WUs blocked.

**Test totals:** 113/113 across 33 suites (was 101/101 in 0.6.0; +12 new tests).

**What's not in this release**
- Phase J — conformance suite + 0.1.0 publish + live cutover migration + WU 128 enforcement-flag flip + 5-day soak.
- Quality-trap surfacing in `wu create` — the four traps (vagueness, technical language, happy-path-only, kitchen-sink) per the `wu-new` protocol body are not yet surfaced as active prompts at review time. Deferred to a refinement pass; for now the operator self-applies the traps before saving (the prompt body suggests this).
- Decision file's `Rationale` field — `renderDecision` produces Context/Decision/Consequences/Alternatives but not Rationale (which the live catalogue uses inconsistently — sometimes folded into Decision, sometimes a separate section). The renderer follows the more conservative subset.

## 0.6.0 — 2026-05-10 — AC parser closes the wu tick + wu advance --to=completed gaps (WU 111)

Closes the two scope cuts from 0.5.0 by adding an acceptance-criteria parser.

**`wu tick` now flips the actual checkbox.** Before 0.6.0 it appended an audit-log entry only. Now it parses the AC list out of the markdown, finds the AC at the supplied index, and replaces the unticked line with the ticked equivalent in the same style:

- `- [ ] text` → `- [x] text`
- `1. text` → `1. ✅ text`

The audit-log entry is still appended for the workflow record. If the AC section can't be parsed (atypical shape — only WU 073 in the live catalogue), the tick falls back to audit-log-only and labels the entry `(audit-log-only — AC list not recognised)`.

**`wu advance --to=completed` now works via CLI when all AC are ticked.** The CLI extracts the AC list from the markdown using `extractForCompletion`, attaches it to the workflow capture as `metadata.acceptanceCriteria`, and the pack's completion gate (Phase C) verifies every entry. Evidence inference:
- Ticked AC with a matching `## Build catalogue history` entry → the evidence string from that entry (e.g., commit ref).
- Ticked AC with no matching history entry → `"Ticked in source markdown."` (the maintainer hand-ticked).
- Unticked AC → no evidence; the gate rejects naming the AC.

**Two AC shapes recognised** (matching what the live catalogue uses across 130+ files):
1. **Checkbox:** `- [ ] text` / `- [x] text` — the newer convention; used by WU 111 itself.
2. **Numbered + emoji:** `1. ✅ text` (ticked) / `1. text` (unticked) — the older convention; common in `done/` files.

**Live verification.** The §6 real-fixture test parses WU 111's actual AC list: 14 unticked checkbox entries; every entry round-trips through `tickAcceptanceCriterion` → checked equivalent → `parseAcceptanceCriteria` again with met=true.

**Added**
- `src/runtime/ac-parse.ts` — `parseAcceptanceCriteria(rawMarkdown)`, `tickAcceptanceCriterion(rawMarkdown, index)`, `extractForCompletion(rawMarkdown)`. Plus a `parseHistoryEvidence` helper that bridges the audit log into the completion gate.
- `tests/ac-parse.test.ts` — 21 acceptance tests across 6 sections (checkbox parsing, numbered+emoji parsing, tick-with-style-preservation, evidence inference, end-to-end through the CLI on a synthetic corpus, and the WU 111 real-fixture test).

**Bug-fixes during testing**
1. The first cut of `parseHistoryEvidence` used a multiline-flag regex with `$` for end-of-input, which actually matched end-of-line and cut entry blocks short before the Evidence sub-bullet. Fixed by switching to a section-bounded split-by-bullet approach.
2. The `commands-write.test.ts` test for "advance to completed without AC" was asserting the old workflow rejection message. With the AC parser in place, an empty AC section now produces a different (clearer) error: `"at least one acceptance criterion"`. Test matcher updated.

**Test totals:** 101/101 across 30 suites (was 82/82 in 0.5.0; +19 new tests).

**What's not in this release**
- Interactive `create` commands (Phase H part 3 — `wu create`, `decision create`, `persona create`)
- Phase J cutover

## 0.5.0 — 2026-05-10 — Phase H part 2 flag-driven write commands (WU 111)

Adds the four flag-driven write commands and wires the build-catalogue NuFlow runtime end-to-end. Markdown files and the JSON workflow store now stay in sync atomically — every write operation updates both.

**New CLI subcommands:**

```
nuos-catalogue wu       advance   <handle> --to=<status> [--reason="..."]
nuos-catalogue wu       tick      <handle> --index=N --evidence="..."
nuos-catalogue decision supersede <target> --by=<superseding> [--reason="..."]
nuos-catalogue question resolve   <q-handle> --by=<d-handle> [--reason="..."]
```

**Architecture.** Three new modules:

- `src/runtime/markdown-edit.ts` — pure helpers: `replaceStatusLine` (handles both bold and pipe-table forms); `insertStatusLine` (inserts after H1 if no status line exists); `appendChangeLog` (adds structured entries to a `## Build catalogue history` section, idempotent across calls).
- `src/runtime/mis-adapter.ts` — `BuildCatalogueMisAdapter` implementing NuFlow's `MisWriteAdapter`. Per-intent commit handlers for the four supported workflow types. Both the markdown file on disk AND the JSON store record are updated in `persist()`; the `status` field on the record is updated alongside `rawMarkdown` so the next workflow invocation reads the current state, not the stale migrated value.
- `src/runtime/runtime.ts` — `createBuildCatalogueRuntime({ store, catalogueRoot })` wires NuFlow runtime + stub memory adapters + the build-catalogue MIS adapter + registers the `@nusoft/nuflow-pack-nuos-build-catalogue` pack.

**New deps:** `@nusoft/nuflow ^0.4.1` (+ devDep `file:../nuflow`); `@nusoft/nuflow-pack-nuos-build-catalogue ^0.0.6` (+ devDep `file:../nuflow-pack-nuos-build-catalogue`). Both load via the CLI when a write command is invoked; they are not loaded for read commands or the migration runner.

**Honest scope cut: AC-list parser deferred.** `wu tick` does not parse the AC list out of the markdown. Instead, it appends a structured entry to the `## Build catalogue history` section naming the criterion index and evidence. The AC list itself stays as the maintainer wrote it; the workflow record + audit chain are the canonical statements. The full AC parser is its own project (different files use different AC shapes — checkbox lists, numbered lists, prose bullets, sub-headings); deferred until a future phase if the audit-log-only approach proves insufficient.

**Honest scope cut: `wu advance --to=completed` requires AC list.** The pack's completion gate (Phase C) requires every AC to have `met: true` with non-empty evidence. The CLI doesn't extract the AC list from markdown, so `--to=completed` fails at the gate with the workflow's own clear error message. This is intentional — completion through the CLI requires the AC parser, which is the same deferred work as `wu tick`. For now, the maintainer flips status to `completed` by hand-editing the markdown directly (and the existing `regenerate` command will surface the resulting drift). When the AC parser lands, the CLI path becomes available.

**Bug-fix surfaced and fixed during testing.** First version of the MIS adapter updated `rawMarkdown` and `fileModifiedAt` on the store record but not the `status` field. The next workflow invocation read the stale `status`, normalised it to the migrated value (e.g., `ready`), and the transition validity check rejected what should have been a legal sequence (e.g., advancing `in_progress → in_review` after just advancing `ready → in_progress`). Fixed by passing the new status through the `persist()` helper as a field update alongside `rawMarkdown`.

**Test totals:** 82/82 across 24 suites (was 63/63 across 18 in Phase I; +19 new tests for write commands + markdown editors).

**Coverage:**
- Markdown editors: replace bold + pipe-table forms; insert after H1; append to history (creates section, appends idempotently).
- `wu advance`: legal transitions update status + history; `→ completed` without AC fails with the gate's error; unknown handle rejected; missing `--to` rejected.
- `wu tick`: appends history entry; rejects empty evidence; rejects negative index.
- `decision supersede`: updates target's status + appends history; appends history to superseding (without changing its status); rejects unknown target; rejects missing `--by`.
- `question resolve`: updates Q's status + appends history; appends history to resolving D; rejects unknown question.
- `regenerate-check` reports zero drift after any write command (store-disk sync verified).

**What's not in this release**
- Interactive `create` commands (Phase H part 3 — `wu create`, `decision create`, `persona create`); these need real prompt UX mirroring the markdown protocol bodies; deferred.
- AC-list parser (deferred; `wu tick` and `wu advance --to=completed` use the audit-log-only approach for now).
- Conformance suite + 0.1.0 publish + live cutover migration + WU 128 enforcement-flag flip (Phase J).

## 0.4.0 — 2026-05-10 — Phase I regenerate + drift report (WU 111)

Adds the `regenerate` subcommand: walks the JSON workflow store, compares each record's stored `rawMarkdown` to its source file, reports drift. Three operating modes: `--check` (default; reports drift), `--diff` (same as check; future enhancement will add unified-diff output), `--write` (overwrite source files with the stored canonical form — Mode 2 cutover; not normally used in Mode 1).

**Scope: Mode 1 verification gate, not Mode 2 field-by-field rendering.** Phase G's migration runner stopped at count parity — the `MigratedRecord` shape preserves `rawMarkdown` verbatim but doesn't extract field-level data (no AC list, no decision body parsed out of markdown). So "regeneration" in Mode 1 is byte-identical reproduction from `rawMarkdown` + drift detection. The richer field-by-field rendering only matters at Mode 2 (post-WU-113), when workflow state mutates through the lifecycle and markdown is generated from richer fields. Phase I therefore ships as the verification-gate version: proves the roundtrip works (trivially, since it's a cache), and detects when a markdown file diverges from the migrated record.

**Live validation against the real catalogue (post-Q019 resolution):**

```
$ nuos-catalogue migrate --workflows=$TMP/wf.json
scanned: 166, migrated: 166, skipped: 0 (zero conflicts)

$ nuos-catalogue regenerate --workflows=$TMP/wf.json
scanned: 166, identical: 166, differs: 0, missing: 0, unreadable: 0
by register: work_unit=114, decision=38, open_question=14, persona=0
```

The roundtrip is verified end-to-end. After the live cutover at Phase J, drift detection becomes the catalogue-discipline gate that surfaces hand-edits-without-workflow-update.

**Why the workflow body in the pack stays a stub.** The pack defines `regenerate_markdown_catalogue` as a workflow handle, but its body remains a stub. The CLI's `regenerate` subcommand does the work directly (reads JSON store, runs drift check). Wiring the workflow body to invoke this code path through NuFlow's lifecycle would be theatre at this stage (no real reason to round-trip through `startWorkflow → confirm → commit` for a read-only verification). Future WU 113 (markdown-as-generated-output cutover) may revisit this if there's a clear need.

**Added**
- `src/regenerate/types.ts` — `DriftEntry`, `DriftReport`, `RegenerateConfig`
- `src/regenerate/diff.ts` — `countLineDiff(before, after)` LCS-based line-counting helper
- `src/regenerate/check.ts` — `runRegenerate({ catalogueRoot, store, registerFilter?, write? })`
- `src/cli.ts` — new `regenerate` subcommand with `--register`, `--diff`, `--write`, `--build-root`, `--workflows`, plus updated help text
- `tests/regenerate.test.ts` — 11 acceptance tests across line-diff math, zero-drift roundtrip, drift detection on edit, register filter, missing-source detection, --write overwrite

**Test totals:** 63/63 across 18 suites.

**What's not in this release**
- Field-by-field renderers (Mode 2 cutover; deferred until WU 113)
- Unified-diff output beyond line-counts (deferred; small enhancement)
- The pack's `regenerate_markdown_catalogue` workflow body (stays a stub; see above)

## 0.3.0 — 2026-05-10 — Phase H read commands + Phase G conflict reporting (WU 111)

**Phase H read commands.** Eight new CLI subcommands for inspecting the migrated workflow store: `summary`, `wu list/show`, `decision list/show`, `question list/show`, `persona list/show`. All accept `--json` for machine consumption. List commands accept `--status=<text>` (substring match, case-insensitive) and `--limit=N`. The `show` subcommands accept canonical handles (`wu-111`, `D046`, `Q009`, `P001`) AND friendly variants (`WU 111`, `111`, `D45`, `Q9`) — the latter normalised before lookup.

**Phase G conflict reporting (small refinement).** The migrator now distinguishes idempotent skips (same source path, re-run) from genuine handle conflicts (different source files claiming the same handle). Conflicts are reported in the migration output with a warning section that names every dropped file and points the maintainer at the fix.

**Real-world finding from live dry-run.** The current live catalogue has 3 WUs sharing the prefix `072b-` in `work-units/done/`:
- `072b-phase-2-step-6-design.md`
- `072b-production-wiring-spec.md`
- `072b-sensight-per-student-propose-mode.md`

Without conflict reporting, the migrator would silently keep one and drop two. With the conflict report, the maintainer sees the issue immediately. This kind of catalogue-discipline feedback is exactly what the migrator needs to surface before the live cutover at Phase J.

**Live end-to-end smoke (no commit; temp-dir):**
```
$ nuos-catalogue migrate --workflows=$TMP/wf.json
scanned: 165, migrated: 163, skipped: 2 (with 2 handle conflicts on wu-072b reported)

$ nuos-catalogue summary --workflows=$TMP/wf.json
total: 163 (work_unit 114, decision 36, open_question 13, persona 0)

$ nuos-catalogue wu list --status=ready --workflows=$TMP/wf.json
6 records: wu-048, wu-072b, wu-083, wu-094, wu-111, wu-125
```

**Added (Phase H)**
- `src/commands/format.ts` — shared list/show formatters (human + JSON; width-aware tabular output)
- `src/commands/handlers.ts` — `listRegister()`, `showRecord()`, `normaliseHandle()`, `listAcrossRegisters()`, `commandToRegister()`
- `src/cli.ts` — new subcommand dispatch for `summary`, `wu`, `decision`, `question`, `persona` plus updated help text
- `tests/commands-read.test.ts` — 23 acceptance tests across normaliseHandle, list (sort, filter, limit, JSON, empty), show (canonical, friendly, integer, JSON, missing, wrong-register), summary, command→register dispatch

**Added (Phase G refinement)**
- `MigrationReport.conflicts: HandleConflict[]` — per-conflict winner/loser source paths
- Migrator distinguishes idempotent re-run skips from genuine conflicts
- CLI surfaces conflicts with a prominent ⚠ warning section
- One new test in `tests/migrate.test.ts` (§3b) verifying conflict detection on a synthetic two-file collision

**Test totals:** 52/52 across 13 suites.

**What's not in this release**
- Write commands (`wu advance`, `wu tick`, `decision supersede`, `open_question.resolve`) — flag-driven; deferred to a follow-up alongside the workflow-pack runtime wiring
- Interactive `create` commands (`wu create`, `decision create`, `persona create`) — these need real prompt UX mirroring the `wu-new` / `persona-new` markdown protocol bodies; substantial UX scope, deferred

## 0.2.0 — 2026-05-10 — Phase G migration runner (WU 111)

Adds the `migrate` subcommand: lifts every artefact in the live catalogue (work units, decisions, open questions, personas) into a JSON-backed workflow record store. Idempotent; tolerant of pre-D046 markdown shapes; subdirectory-aware (`work-units/done/`, `decisions/superseded/`).

**Storage decision: JSON, not NuVector (yet).** A flat `.nuos-catalogue/workflows.json` keyed by handle. Inspectable, simple, sets up Phase I (markdown regeneration) cleanly. NuVector cutover is a deliberate follow-up; the store interface is narrow (`has`, `get`, `put`, `list`, `flush`) so a NuVector adapter can be substituted later without changing call sites.

**Scope: count parity, not field-level fidelity.** Pre-D046 WUs and decisions don't have the new D046 six-field shape in their markdown — the parser preserves handle, number, title, status, slug, source path, raw markdown, and file mtime. Field-level fidelity comes when the catalogue is *authored* via the workflow lifecycle (post-cutover). Migration is back-fill, not transcription.

**Live validation against the real catalogue (dry-run):** 165 artefacts scanned cleanly — 116 WUs, 36 decisions, 13 open questions, 0 personas (the personas register is empty pre-WU-111). Zero parser errors. The actual one-shot live migration runs at Phase J per the WU 111 spec.

**Tolerance for real-world shapes:**
- WU sub-numbers (`030g-...`, `072a-...`, `072b-...`) — the integer part is the number; the suffix flows through into the handle (e.g. `wu-030g`)
- Status extraction handles both `**Status:** ...` (bold) and `| Status | ... |` (pipe-table) forms
- Subdirectories `done/` and `superseded/` are walked one level deep and assigned to the parent register
- `_index.md` files and templates (filenames containing `template`) are skipped
- Empty registers (e.g. `personas/` pre-author) report 0/0 cleanly without error

**Added**
- `src/migrate/types.ts` — `MigratedRecord`, `MigrationReport`, `Register`
- `src/migrate/parsers.ts` — `parseFile()` per-register parser; `registerForRelativePath()` directory→register dispatcher
- `src/migrate/store.ts` — `WorkflowStore` interface backed by `.nuos-catalogue/workflows.json` (schemaVersion 1)
- `src/migrate/run.ts` — `runMigrate()` walker + orchestration + idempotence
- `src/cli.ts` — `migrate` subcommand with `--build-root`, `--workflows`, `--dry-run` flags
- `tests/migrate.test.ts` — 14 acceptance tests across pure parser, register dispatch, full-corpus migration (synthetic 5-artefact fixture), idempotence, subdirectory recursion, dry-run

**Test totals:** 28/28 across 7 suites.

## 0.1.0 — 2026-05-09

First release. Implements [WU 110](../nuos/docs/build/work-units/done/110-index-catalogue-into-nuvector.md) per [D040](../nuos/docs/build/decisions/D040-nuos-led-build-is-foundation-not-parallel-track.md).

**Added**
- Markdown-aware chunker that splits on H1/H2/H3 boundaries, preserves code fences, and merges near-empty headings into substantive siblings to eliminate noise hits in semantic search
- Per-kind metadata extractor — work units, decisions, sessions, open questions, risks, contracts, philosophy, guides, maps, state, build_order, reference
- Hash-based incremental indexer — only re-embeds files whose content has changed since the last run
- Four embedder implementations:
  - `ollama` (default, per [D042](../nuos/docs/build/decisions/D042-nuos-local-inference-posture.md)) — `qwen3-embedding:8b` (4096 dims) by default; `4b` and `0.6b` variants supported
  - `vertex` — Google Vertex `text-embedding-005` (768 dims)
  - `openai` — OpenAI `text-embedding-3-small` (1536 dims)
  - `stub` — deterministic SHA-256 hash for tests
- Embedder `dispose()` discipline per D042 — local-inference models are unloaded after use; CLI calls dispose() in `finally` blocks
- `nuos-catalogue` CLI with `index`, `search`, and `help` subcommands
- Index → search round-trip verified end-to-end against the live NuOS catalogue: 139 files, 1617 chunks, semantic queries return substantive results in ~330–390 ms

**Architectural anchors**
- D040 — NuOS-led build is the foundation, not a parallel track
- D041 — `@nusoft/nuos` meta-package; this package is a sibling, not a dependent
- D042 — local-first inference; models unloaded after use
- D043 — catalogue indexer stays a separate package (this one)
