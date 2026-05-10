# start-of-session

Run the start-of-session protocol for this NuOS Build Method project.

Follow `docs/build/START-OF-SESSION.md` exactly. Five steps:

1. **Read `docs/build/STATE.md` in full.** It is the single source of "where are we right now?"
2. **Read the most recent session log entry** in `docs/build/sessions/` (the file with the most recent date in its filename). Read it in full.
3. **Read the active work unit** named in STATE.md, in full — including the notes / log section at the bottom.
4. **Skim `docs/build/open-questions/_index.md` and `docs/build/risks/_index.md`** for any items that block the active work unit. If any are blocking, surface them now before any work starts.
5. **Surface to the operator:**
   - Where the project is right now (one sentence)
   - The active work unit and its current status (one sentence)
   - Any blockers (one bullet each)
   - The next concrete action (one bullet)

**Wait for confirmation before proceeding to substantive work.** If the operator wants to do something other than the proposed next action, that is fine — but record the divergence either as a new work unit or as a note on the active work unit.

If STATE.md looks out of date — or if there is no active work unit named — note that to the operator immediately. Likely the previous end-of-session was skipped.
