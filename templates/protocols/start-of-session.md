# start-of-session

You are starting a session on a project that uses the **NuOS Build Method catalogue**. Your job is to read where the project is right now and tell the operator in plain English, then propose the next action and wait for confirmation.

## Step 0a — Verify the build memory CLI is installed (every session)

Run: `which nuos-catalogue || npm install -g @nusoft/nuos-build-catalogue`

This CLI powers the build memory system (`nuos-catalogue memory store/search`). It is a global npm tool with no presence in any project `package.json` — so it disappears silently when global npm packages are cleared (Node.js update, Homebrew update, etc.). If it was missing and you just installed it, tell the operator. The gap is real — memories from recent swarms may not have been stored. After installing, run `nuos-catalogue memory search --query="<active WU title>" --limit=5` to check what is indexed.

## Step 0 — Operator mode

Read `methodfile.json`'s `operator.mode`:

- Set to `"coaching"` / `"standard"` / `"developer"` → adopt that tone per `docs/build/OPERATOR-MODES.md`. Skip to Step 1.
- `null` → run the picker below before doing anything else.

**Picker (first run only).** Tell the operator this is a one-time setup, then offer the three modes in your own words from `OPERATOR-MODES.md`:
- **Coaching** — new to software development; learning the process while building.
- **Standard** — domain expert; comfortable with files and instructions; not a working dev. *(Most common — recommend if they're unsure.)*
- **Developer** — experienced engineer; wants terse protocols.

On their answer: write the choice to `methodfile.json` as `operator.mode` (string) and stamp `operator.modeSelectedAt` with today's ISO date. Confirm in one line: *"Saved. Change any time with `nuos-catalogue mode <name>`."* Continue to Step 1.

---

## Step 1 — First-run detection

Read `docs/build/STATE.md`. Look at the **Planning progress** section:

- If **all five phases (A-E) are still `🔵 not yet started`** AND there are no real work units in `docs/build/work-units/` (only templates), this is a fresh project. Tell the operator:

  > "This is a brand-new catalogue. Before we file any work units, we walk through 5 short planning phases that produce the substrate every later session draws on. Phase A — Orientation — takes about 30 minutes. Want to begin now? (yes / no, look around first)"

  If yes, **switch to the `plan-orientation` protocol** (invoke `/plan-orientation` if available; otherwise read `.claude/commands/plan-orientation.md` and follow it). If no, point them at `docs/build/WELCOME.md` and `docs/build/GLOSSARY.md` so they can read about the catalogue first, then wait.

- If **any planning phase is in progress or marked `🟡 next`**, route to the appropriate protocol. Read the most recent session log's "Resume hint" to know exactly where to pick up within the phase.

  | Phase | Protocol |
  |---|---|
  | A — Orientation | `plan-orientation` |
  | B — Architecture & Contracts | `plan-architecture` |
  | C — UI/UX + Design System | `plan-uiux` |
  | D — Maps | `plan-maps` |
  | E — Initial Work Units | `plan-initial-wu` |

  Invoke the protocol with its slash command (e.g. `/plan-uiux`) if available; otherwise read `.claude/commands/<protocol>.md` and follow it. The "next" phase in STATE.md is the one to route to — if Phase B is `✅ complete` and Phase C is `🟡 next`, invoke `plan-uiux`.

- If **all five planning phases are complete**, proceed with the normal session-start steps below.

## Step 2 — Read where the project is

Read these files in order:

1. `docs/build/STATE.md` in full — the always-current snapshot
2. The most recent file in `docs/build/sessions/` — what happened last session
3. The active work unit named in STATE.md, including its notes section at the bottom
4. Skim `docs/build/open-questions/_index.md` and `docs/build/risks/_index.md` for anything blocking the active work unit

## Step 3 — Tell the operator where they are

Use plain English. One short paragraph or 4-5 bullets:

- **Where the project is right now** — one sentence describing the current state
- **What was just done** — the last session's outcome in a sentence
- **The active work unit** — what's open and its status
- **Any blockers** — one bullet per blocking question or risk
- **The next concrete action** — one bullet

## Step 4 — Wait for the operator's confirmation

The operator may want to do the proposed next action, or something different. Either is fine. Just don't start substantive work until they've confirmed direction.

If they want to do something different from the proposed next action, record the divergence — either as a note on the active work unit, or by filing a new work unit if the divergence is significant.

---

## If anything is wrong with STATE.md

If STATE.md still has placeholder text, references a work unit that doesn't exist, or is missing the planning progress section, tell the operator immediately. Likely the previous session ended without `/end-of-session` running. The recovery is to file a session log for what's known to have happened, update STATE, then proceed.

## What never to do at session start

- **Don't make decisions in conversation without filing them.** If the operator says "let's do X" and X is a real architectural choice, file it as a decision in `docs/build/decisions/` before moving on. Decisions made in conversation that aren't filed produce drift — and drift is the failure mode that makes the catalogue worthless.
- **Don't start work that needs an open question resolved.** Surface the blocker; ask the operator how they want to proceed.
- **Don't read past your tasks.** STATE, last session log, active work unit, blockers — then stop. Surface those, wait for direction.
