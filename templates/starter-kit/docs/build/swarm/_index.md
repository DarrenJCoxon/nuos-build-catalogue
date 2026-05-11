# Swarm runs

Every time the operator invokes `/build-wu <handle>` (or the AI orchestrates agents against a work unit), the run gets a permanent record here. The swarm register is the audit trail: which agents were spawned, which models they used, what they produced, what shipped, what didn't, and why.

This is **load-bearing for cost auditability** — if you ever wonder "is the swarm worth it? where is the spend going?", these files answer.

## Index

| Date | Work unit | Outcome | Cost (est.) |
| --- | --- | --- | --- |
| _none yet — entries appear here as `/build-wu` runs_ | | | |

## What a swarm run captures

For each run:

- **Work unit** — handle + title; the input
- **Classification** — design-only / implementation / full-feature / bug-fix / research-first
- **Decomposition** — the subtasks the coordinator identified
- **Agents spawned** — one row per spawn: role, model used, input summary, output summary, approximate time
- **Outcome** — APPROVED / REQUEST CHANGES (with retry count) / ESCALATED (to operator or architect)
- **Decisions / open questions / risks that surfaced** — links to the catalogue entries that were filed
- **Cost** — best-effort estimate based on agent count, model tier, and approximate context size

The audit trail tells you whether the swarm worked, what it cost, and where (if anywhere) the work routed back to the operator for a decision.

## How runs get filed

Automatic. The `build-wu` protocol writes one file per run at `swarm/YYYY-MM-DD-wu-<handle>.md` and adds a row to this index. The post-commit hook re-indexes the catalogue after the swarm's commit lands, so future `nuos-catalogue search` queries find these audit entries.

## How to use the register

- **Reviewing cost over time** — sort by cost column to see which work units have been expensive; reflect on whether they were scoped too large
- **Tracking patterns in escalation** — if "ESCALATED to operator" rows cluster around a specific module or concern, that's a signal that the contracts in that area need sharpening
- **Onboarding** — a new contributor can read the most recent swarm runs to see how the project's work units actually got built; the runs explain WHY a piece of code looks the way it does
