# {{PROJECT_NAME}} — handoff snapshot

> The pickup point, read at the start of every session. **Not a dashboard** — it stays
> the size of one screen on purpose. Decisions, risks, and open questions are not
> mirrored here; they live in their registers ([`decisions/`](decisions/_index.md),
> [`risks/`](risks/_index.md), [`open-questions/`](open-questions/_index.md)), and the
> session-by-session story lives in [`sessions/`](sessions/_index.md). For health counts
> run `nuos-catalogue doctor`.
>
> The **Active work unit** and **Blockers** regions below are compiled by
> `nuos-catalogue state compile` (run automatically by end-of-session). The **Resume**
> block between them is the one part written by hand — end-of-session overwrites it each
> session. **Last updated:** {{TODAY}}

## Planning progress

This project is at the start of its planning arc. The AI will walk you through five
phases before you begin building. Each phase is its own session. (Once all five are
✅ complete, delete this section — it has no role once building starts.)

| Phase | What it produces | Status |
| --- | --- | --- |
| A — Orientation | Project description, 1-3 personas, the horizon map | 🔵 not yet started |
| B — Architecture & Contracts | The major pieces of the project and what they exchange | 🔵 not yet started |
| C — UI/UX + Design System | The user-facing surfaces and the shared visual language | 🔵 not yet started |
| D — Maps | Phases of work and the near-term plan | 🔵 not yet started |
| E — Initial Work Units | The first 5-10 things to build, in dependency order | 🔵 not yet started |

When you run `/start-of-session` on this fresh project, the AI will see this tracker and
offer to begin Phase A.

<!-- nuos:generated:where:start -->
## Active work unit

No active WU declared yet. Once planning produces the first work units, run
`nuos-catalogue wu start <handle>` and this region will name the active WU.
<!-- nuos:generated:where:end -->

## Resume

_Planning has not started. Run `/start-of-session` to begin Phase A._

end-of-session overwrites this block each session with exactly three things:

1. **Where we are** in the arc — one line (a planning phase, or "Building — Phase N").
2. **Where the last session stopped** — the precise pickup point.
3. **The single next concrete action** — specific enough to start without re-reading.

Write it once, well. This block replaces the old "in flight / just shipped / what is
next / last session" slots — they all described the same moment, so they collapse here.

<!-- nuos:generated:blockers:start -->
## Blockers

None. The active work unit is unblocked.
<!-- nuos:generated:blockers:end -->
