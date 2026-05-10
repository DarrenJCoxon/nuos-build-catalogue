# Start-of-Session Protocol

> Run this every time a session begins. The point is to absorb the project state in under sixty seconds and propose a concrete next action. If this takes more than two minutes to follow, the catalogue is unhealthy — fix that first.

## Steps

1. **Read [`STATE.md`](STATE.md)** in full. It is the single source of "where are we right now?"

2. **Read the most recent session log entry** in [`sessions/`](sessions/). The directory is sorted newest-last; the most recent entry is the last one chronologically. If there is no session log yet, this is the first session — note that and proceed.

3. **Read the active work unit** named in STATE.md. Read it in full, including the notes / log section at the bottom. The notes capture what the previous session learned that has not yet been generalised into a decision.

4. **Skim `open-questions/_index.md` and `risks/_index.md`** for any items that block the active work unit. If any are blocking, surface them now before any work starts.

5. **Surface to the operator:**
   - Where the project is right now (one sentence)
   - What the active work unit is and what its current status is (one sentence)
   - Any blockers (one bullet each)
   - The next concrete action (one bullet)

6. **Confirm the next action with the operator before starting work.** If the operator wants to do something other than the proposed next action, that is fine — but record the divergence either as a new work unit or as a note on the active work unit.

## What this protocol guarantees

- No session begins without a clear understanding of where the project stands
- No work happens outside an acknowledged work unit (or with an explicit acknowledgement of why it is outside)
- Blockers are surfaced before work starts, not after work has been wasted on something that cannot ship

## What to do if something is missing

- **STATE.md is out of date.** Note this to the operator immediately. Likely the previous end-of-session was skipped or incomplete. Check the latest session log and the latest WU notes for what the truth actually is.
- **No active work unit named.** Note this. Likely a phase boundary just closed and the next WU has not been picked yet. Surface the candidate WUs and ask the operator to pick.
- **Blocking open questions.** Stop. Surface them. Do not start work that depends on an unresolved question.
