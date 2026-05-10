# end-of-session

Run the end-of-session protocol for this NuOS Build Method project.

Follow `docs/build/END-OF-SESSION.md` exactly. Nine steps:

1. **Update the active work unit's notes section** with what was attempted, what worked, what did not work and why, what was learned, and what the next concrete action should be. Apply the auditor's-question test: could a third-party reader read this entry and answer "why was this done and what justifies the next step?" without contacting the team?
2. **Capture any new decisions** as `docs/build/decisions/D<NNN>-<slug>.md` files plus an entry in `decisions/_index.md`.
3. **Capture any new open questions** as `docs/build/open-questions/Q<NNN>-<slug>.md` files plus an entry in `open-questions/_index.md`. If a question was both raised AND resolved this session, capture it as a decision instead.
4. **Capture any new risks** as entries in `docs/build/risks/_index.md`.
5. **Update the work-units index.** Confirm status icons reflect reality. **When a WU promotes to ✅, move its file from `work-units/<NNN>-<slug>.md` to `work-units/done/<NNN>-<slug>.md` and update the row link in `_index.md` to point at `done/<file>`.** Fix internal relative paths in the moved file (one level deeper after the move).
6. **Update `STATE.md`.** Refresh: last-updated date, last-session reference, active work unit, "What was just done", "What is next" if priorities shifted, decisions/questions/risks tables.
7. **Write a session log entry** in `docs/build/sessions/<YYYY-MM-DD>-<slug>.md`. Add a row to `sessions/_index.md`.
8. **Verify nothing is lost.** Every decision has a file + index entry. Every question has a file + index entry. Every risk has an index entry. STATE.md reflects current state. Cross-references resolve. Dates are right.
9. **Commit.** A single commit with the message `end-of-session: <YYYY-MM-DD> — <one-line summary>`. The pre-commit hook (per WU 128) will validate index integrity on the way through; if it blocks, fix the underlying drift, do not bypass with `--no-verify`.

**End-of-session is non-negotiable.** Without it, work is lost — that is the single rule the catalogue is built on.

If you cannot run the full protocol (rushing to stop, handing off mid-task), at minimum write one paragraph into the active WU's notes section: *"session ended without full end-of-session protocol; the state is approximately X; outstanding actions Y."* Then run the full protocol at the start of the next session before any new work.
