# Integration runbook — `@nusoft/nuos-build-catalogue`

> Phase J of WU 111. Use this runbook when first standing up the build-catalogue CLI on a new machine, after a fresh clone, or to verify state at a known checkpoint.

This package is the operator-facing CLI for managing the NuOS build catalogue. Two related packages are part of the same picture:

- `@nusoft/nuflow-pack-nuos-build-catalogue` — the NuFlow workflow pack that defines the lifecycle for every catalogue artefact (work unit, decision, open question, persona).
- `@nusoft/nuvector` — the search store this CLI uses for semantic catalogue search (`nuos-catalogue index` + `search`).

## What the CLI gives you

```
nuos-catalogue index                                 — index the catalogue into NuVector for semantic search
nuos-catalogue search "<query>"                      — semantic search across the catalogue
nuos-catalogue migrate                               — lift markdown artefacts into the JSON workflow store
nuos-catalogue regenerate                            — drift-check stored markdown vs source files
nuos-catalogue summary                               — record counts by register

Read commands (per register: wu/decision/question/persona):
  nuos-catalogue <register> list  [--status=<s>] [--limit=N] [--json]
  nuos-catalogue <register> show  <handle> [--json]

Write commands:
  nuos-catalogue wu       advance   <handle> --to=<status> [--reason="..."]
  nuos-catalogue wu       tick      <handle> --index=N --evidence="..."
  nuos-catalogue decision supersede <target>   --by=<superseding> [--reason="..."]
  nuos-catalogue question resolve   <q-handle> --by=<d-handle> [--reason="..."]

Interactive create commands (multi-step prompts):
  nuos-catalogue wu       create
  nuos-catalogue decision create
  nuos-catalogue question create
  nuos-catalogue persona  create
```

## Install on a new machine (after clone)

The CLI lives in a sibling repo to `nuos/`. Expected layout:

```
current-projects/
  nuos/                                  ← the catalogue (markdown)
  nuvector/                              ← @nusoft/nuvector
  nuflow/                                ← @nusoft/nuflow
  nuwiki/                                ← @nusoft/nuwiki
  nuflow-pack-nuos-build-catalogue/      ← the workflow pack
  nuos-build-catalogue/                  ← THIS REPO (the CLI)
  ...
```

```bash
cd current-projects/nuos-build-catalogue
npm install
npm run build
npm test                                  # 113+/113+ tests should pass
```

## Verifying the install is healthy

A clean install passes a four-step smoke test:

```bash
# 1. Migrate the catalogue into the JSON workflow store (creates .nuos-catalogue/workflows.json)
npx tsx src/cli.ts migrate

# 2. Confirm the migrate counted the right number of artefacts
npx tsx src/cli.ts summary
# Expect: total: 166 (or whatever the live catalogue currently has)

# 3. Verify there are no markdown drift issues
npx tsx src/cli.ts regenerate
# Expect: identical: 166, differs: 0, missing: 0

# 4. Read a known WU to confirm round-trip works
npx tsx src/cli.ts wu show 111
# Expect: WU 111's title + metadata + first 2000 chars of body
```

If any step fails, check the troubleshooting section below.

## Day-to-day use

The CLI is the recommended way to mutate the catalogue. Each of the write/create commands updates both the markdown file on disk **and** the JSON workflow store atomically.

- **Advancing a WU's status** — use `wu advance` rather than hand-editing. The pack's state machine validates legal transitions; the completion gate verifies AC are met-with-evidence at `→ completed`.
- **Ticking an AC** — use `wu tick`. The CLI updates the actual checkbox in the markdown AND appends a structured audit entry to `## Build catalogue history`.
- **Creating a new artefact** — use `<register> create`. The interactive prompts walk the relevant protocol body (`wu-new`, `persona-new`).
- **Hand-editing markdown is still permitted.** After hand-editing, run `nuos-catalogue migrate` to refresh the store, or `regenerate --write` to discard hand-edits.

## After making changes

```bash
# Re-run regenerate to confirm store + disk are in sync
npx tsx src/cli.ts regenerate
```

If `differs > 0`, the catalogue has drifted from the workflow store. Common causes:

- You hand-edited a markdown file the store knew about. Run `migrate` to re-ingest, or `regenerate --write` to discard.
- A workflow operation didn't complete cleanly. Inspect the `## Build catalogue history` section of the affected file for the audit trail.

## Build catalogue history

Every write command appends a structured entry to a `## Build catalogue history` section in the affected markdown file. Format:

```markdown
## Build catalogue history

- **2026-05-10T18:15:42Z** — Status advanced ready → in_progress.
  - because reasons
  - Reference: intent intent_<wfid>
- **2026-05-10T19:01:33Z** — Acceptance criterion 3 ticked: "Foo verified".
  - Evidence: commit abc123
  - Reference: intent intent_<wfid>
```

This section is the per-file audit trail. The JSON workflow store carries the same data structurally; the markdown is the human-readable view.

## Manifest of related artefacts

- WU 111 — `nuos/docs/build/work-units/111-work-units-as-nuflow-instances.md` — the workstream this CLI implements.
- D047 — `nuos/docs/build/decisions/D047-migration-json-storage-nuvector-deferred.md` — why the workflow store is JSON and not NuVector.
- D048 — `nuos/docs/build/decisions/D048-work-unit-sub-artefacts-directory.md` — where WU sub-artefacts live (not in the migrator's path).
- D045 — `nuos/docs/build/decisions/D045-nuos-packages-caret-ranges-never-exact-pins.md` — caret-ranges convention.
- The pack contract (`@nusoft/nuflow-pack-nuos-build-catalogue/README.md`) — workflow types and pack shape.

## Troubleshooting

**`migrate` reports conflicts.** Multiple source files share the same handle (e.g. `072b-foo.md` and `072b-bar.md`). Resolve by renaming or moving sub-artefacts to `nuos/docs/build/work-unit-artefacts/<wu>/` per D048.

**`regenerate` reports `missing` records.** The store has records for files that no longer exist on disk. Either restore the file from git, or remove the stale record from `.nuos-catalogue/workflows.json` and re-run `migrate`.

**`wu advance --to=completed` rejects with an AC error.** The completion gate requires every AC to have `met: true` with evidence. Use `wu tick --index=N --evidence="..."` to tick each one, then retry.

**Build fails after pulling new commits.** The pack and CLI use `file:../nuflow` and `file:../nuflow-pack-nuos-build-catalogue` for local dev. Run `npm install` after pulling changes to either sibling repo.

## What this runbook does NOT cover

- The Phase A → I implementation history of WU 111 (see CHANGELOG.md).
- The pack's internal architecture (see `nuflow-pack-nuos-build-catalogue/README.md`).
- The NuOS trifecta (see `nuos/docs/contracts/`).
- Mode 2 cutover (post-WU-113) when JSON becomes canonical and markdown is generated. Today's mode is "markdown canonical, JSON parallel ledger".
