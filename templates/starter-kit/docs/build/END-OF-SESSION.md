# End-of-Session Protocol

> Run this every time a session ends. The point is to commit the session's results into the catalogue before context is lost. **If a session ends without this protocol, work is lost.** This is the single load-bearing ritual that prevents the project from drifting.

## Steps

1. **Update the active work unit's notes section.** Append a dated entry describing:
   - What was attempted
   - What worked
   - What did not work and why
   - What was learned (if any pattern is starting to emerge)
   - What the next concrete action should be

   The auditor's-question test: *"Could a third-party auditor read this entry and answer 'why was this done and what evidence justifies the next step?' without contacting the team?"* If yes, the entry is sufficient.

2. **Update [`STATE.md`](STATE.md)** to reflect the session's outcome:
   - Refresh "What is currently in flight"
   - Refresh "What just shipped" if anything completed
   - Refresh "What is next"
   - Update the work-units-in-flight table
   - Update the decisions-made-recently table if any decisions landed
   - Update the "Last updated" date

3. **Write a new session log entry** in [`sessions/`](sessions/) named `YYYY-MM-DD-short-description.md`. The entry should include:
   - **What this session was about** — one paragraph framing
   - **What was done** — chronological narrative; reference any commits
   - **Decisions that surfaced** — link to D-NNN files
   - **Open questions raised** — link to Q-NNN files
   - **Risks identified** — link to R-NNN files
   - **What's next** — the concrete next action (mirrors STATE.md "What is next")

4. **Update the relevant `_index.md` files**:
   - If a new D-NNN landed, add it to `decisions/_index.md`
   - If a new WU landed or a WU's status changed, update `work-units/_index.md`
   - Always add the new session log entry to `sessions/_index.md`
   - If a new Q-NNN or R-NNN landed, update those indexes

5. **Verify nothing is lost.** Read the session log entry back and check:
   - Did anything happen that is not captured somewhere?
   - Are there cross-references that should exist? (a WU should link to the decision that justifies it; a session should link to the WU it advanced)
   - Are the dates right?

6. **Commit.** Single commit, message format:
   ```
   end-of-session: {{TODAY}} — [one-line summary of session outcome]
   ```

## What this protocol guarantees

- No work happens that is not recorded in the catalogue
- Every session has a replay-grade trace; a fresh session (or a fresh operator) can pick up exactly where this one left off
- The catalogue compounds rather than drifts

## What to do if a session was unusually short or unusually long

- **Short session (<30 min, no work landed):** Still write a session entry. It can be brief: "explored X, decided not to start; reason: Y." This counts as a non-trivial action because it consumed a decision-making slot.
- **Long session (multiple WUs touched, multiple decisions):** Write one session entry covering all of it. If the session is genuinely two sessions worth of work that happened in one sitting, write two entries with appropriate timestamps.

## What to do if you cannot run the full protocol

- **You're rushing to stop:** at minimum, write one paragraph into the active WU's notes section saying *"session ended without full end-of-session protocol; the state is approximately X; outstanding actions Y."* Then run the full protocol at the start of the next session before any new work.
- **You're handing off mid-task to another operator:** do run the full protocol, even if the work is incomplete. The next operator needs the current truth.
