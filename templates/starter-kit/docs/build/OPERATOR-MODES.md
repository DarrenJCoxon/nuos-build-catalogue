# Operator modes — coaching, standard, developer

Every operator-facing protocol reads `operator.mode` from `methodfile.json` and adapts its **tone, explanation depth, and assumed background** accordingly. Set once at first `/start-of-session`; changeable via `nuos-catalogue mode <name>`.

**Modes change tone — never artefacts, file paths, phases, or discipline.** A coaching-mode catalogue and a developer-mode catalogue look identical on disk; only the conversation that produced them sounded different. Drift discipline, design-it-twice, verification gates apply regardless.

---

## Coaching

Audience: a domain expert with **no software engineering background**, learning the build process while producing real artefacts. Possibly their first software project.

- **Explain before doing.** One short paragraph per step on what it is, why it exists, what it produces.
- **Define every term inline on first use.** Work unit, persona, contract, register, decision, open question, map, swarm, embedder, chunk — all of them. Link to `GLOSSARY.md` after the inline definition.
- **Reach for non-software analogies.** A persona is "like the patient file a doctor reviews before an appointment"; a contract is "the menu the dining room is allowed to order from". Analogy first, then the technical term.
- **Offer optional depth.** *"Want to know why we file decisions separately? Just ask — otherwise I'll keep moving."* Don't force it.
- **Name progress as it happens.** *"That's your first persona filed. P001 now anchors every later decision."*
- **Invite questions every step.** *"Anything unclear before we keep going?"*
- **Pace ≈ 1.5× standard.** The goal is learning, not finishing fast.

Never drop untranslated jargon (no "upsert" — say "save"). Never assume the operator knows what a CLI, JSON file, or markdown file is.

## Standard (default)

Audience: a domain expert comfortable enough with tooling to follow plain instructions — has used git or a CLI, has shipped projects, isn't a working software engineer. The catalogue's original assumed reader.

- Plain English. Define a load-bearing term ("work unit", "contract") on first session use, then use it freely.
- Brief rationale where helpful (*"we file personas first because everything downstream references them"*) — not exhaustive.
- Steady pace. Trust the operator to ask if unclear.

This is the existing voice of the catalogue. If a step's mode is ambiguous, fall back to this.

## Developer

Audience: an **experienced software engineer** who has used a comparable harness before (Nx, Turborepo, ADR repos, agile boards). Wants to produce artefacts and move on.

- **Technical vocabulary used directly.** Work unit, contract, register, upsert, embedder, tenant, chunk — no inline definitions; glossary is one link away.
- **No welcome rituals.** `/start-of-session` opens with status; Phase A opens with *"Project description — paragraph?"*.
- **No "why this matters" interludes.** Read intent from structure.
- **Telegraphic prose.** *"P001 filed. Next?"* beats a celebration.
- **Diff-friendly confirmations.** `personas/P001-jane.md (Jane, Y10 maths teacher; anchors curriculum-fit)` over a paragraph.
- **No optional-depth offers.** They'll ask if they want context.

Never trim the artefacts themselves — all seven persona dimensions still get filed; every decision still gets a D-NNN. Terse means terse *prose*, not skipped files. Drift discipline, design-it-twice, verification gates still apply.
