---
description: Capture what happened, update state, write session log, commit
---

# end-of-session

You are ending a session on a project that uses the **NuOS Build Method catalogue**. Your job is to capture everything that happened, update the project's snapshot, write a session log, and commit. **Without this, work is lost. The whole catalogue is built on the assumption that every period of work gets captured before it closes.**

**The operator is most likely a domain expert, not a software engineer.** Plain English throughout. Use the operator's words where possible; translate technical jargon into domain language when writing things down.

---

## Steps

### 1. Update the active work unit's notes section (or the active planning phase's notes if mid-planning)

Append a dated entry to the active work unit's `## Notes / log` section. Capture:

- **What was attempted** — in their words, in plain language
- **What worked** — concrete and specific
- **What didn't work and why** — be honest; vague entries are worthless
- **What was learned** — anything generalisable; patterns starting to emerge
- **What the next concrete action should be** — specific enough that the next session can pick up without thinking

**The test:** could a future-you (or anyone joining the project) read this entry and answer *"why was this done, and what justifies the next step?"* without asking? If yes, the entry is sufficient. If you'd need to explain, write more.

### 2. File any new decisions made this session

If anything was decided in conversation — even if it felt obvious at the time — file it as a decision in `docs/build/decisions/`. Use the next available D-NNN number. Add a row to `decisions/_index.md`. Link from the active work unit if it shaped the work.

**This is non-negotiable.** Decisions made and not filed are drift. The catalogue's value is that what was decided is recorded.

### 3. File any new open questions raised

If something came up that needs deciding later, file it in `docs/build/open-questions/` as Q-NNN. Add a row to `open-questions/_index.md`. If a question was both raised AND resolved this session, skip the question file and just file the decision in step 2.

### 4. Note any new risks

If something to watch was identified, add a row to `docs/build/risks/_index.md`.

### 5. Update the work-units index

Confirm status icons reflect reality. When a work unit promotes to ✅ shipped:

- Move its file from `work-units/NNN-slug.md` to `work-units/done/NNN-slug.md`
- Update the row link in `_index.md` to point at `done/`
- Fix any internal relative paths in the moved file (they go one level deeper)

### 6. Update STATE.md

Refresh:

- **Last updated** — today's date
- **What is currently in flight** — the current state of work in one paragraph
- **What just shipped** — the most recent completion
- **What is next** — the immediate next action
- **Planning progress** — if a planning phase advanced, update its status here
- The decisions, questions, and active work units tables — pull the most recent rows from each register

### 7. Write a session log entry

Create `docs/build/sessions/YYYY-MM-DD-short-slug.md`. The entry includes:

- **What this session was about** — one paragraph
- **What was done** — chronological, in plain language; the story of the session
- **Decisions made** — linked to the D-NNN files filed this session
- **Open questions raised** — linked to Q-NNN files
- **Risks identified** — linked to R-NNN rows
- **What's next** — the concrete next action; what the next session should start with
- **Resume hint** — *critical if the session ended mid-task*. A one-paragraph note of exactly where you were and what was about to happen next, so the next session can pick up cleanly. Example: *"We were in Phase B of planning, working on the contract for the Overnight Consolidation module. Next: walk through the Planning Module contract."*

Add a row to `sessions/_index.md`.

### 8. Verify nothing is lost

Before committing, scan:

- Every decision filed has a D-NNN file AND an index entry
- Every open question filed has a Q-NNN file AND an index entry
- Every risk filed has an index row
- STATE.md reflects current state
- Cross-references resolve (no dead links)
- Dates are right

### 9. Commit

Single commit. Message format:

```
end-of-session: YYYY-MM-DD — one-line summary
```

The pre-commit hook validates index integrity on the way through. If it blocks, fix the underlying issue — don't bypass with `--no-verify`. The post-commit hook will refresh the search index in the background after the commit lands.

---

## What never to do

- **Never close a session without end-of-session running.** If you have to stop in a rush, at minimum write one paragraph into the active work unit's notes saying *"session ended without full end-of-session protocol; state is approximately X; outstanding actions Y"*. Then run the full protocol at the start of the next session before any new work.

- **Never bypass the pre-commit hook with `--no-verify` for substantive changes.** Typo fixes on accepted decisions are the only legitimate use. If the hook blocks you, something in the catalogue is inconsistent — fix it; don't paper over.

- **Never leave a decision in conversation rather than in a file.** *"We agreed to use X"* in chat is not a decision. The file is the decision; chat is the conversation that produced it.

---

## Why this matters

The catalogue's compounding value comes from the accumulated record. Every session writes a small layer of context. Six months in, a new contributor — or future-you — opens the project and can read the path from origin to now. Drift is what makes that path unreadable. End-of-session is the protocol that prevents drift.

If end-of-session feels like ceremony, the project is fine; carry on. If end-of-session feels like the only thing standing between coherence and chaos, the catalogue is doing its job.
