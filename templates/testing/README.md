# Vitest scaffolding

These files are copied into a JS/TS implementation repo by the swarm coordinator (see [build-wu.md §Step 4 — Vitest pre-flight](../protocols/build-wu.md)) when:

- `methodfile.json` has `testing.framework: "vitest"` AND `testing.enforced: true`, and
- the implementation repo does not yet have vitest installed or a `vitest.config.ts` present.

## Files

- `vitest.config.ts` — minimal Node-environment config with sensible include/exclude globs for typical `src/`, `app/`, `routes/`, `lib/` layouts and v8 coverage wired in.
- `example.test.ts` — single passing test, dropped at `tests/example.test.ts` so the operator can confirm the runner works end-to-end.

## What the coordinator does

1. Runs `npm i -D vitest @vitest/coverage-v8` in the implementation repo.
2. Copies `vitest.config.ts` to the repo root.
3. Copies `example.test.ts` to `tests/example.test.ts` (creates the directory if missing).
4. Adds `"test": "vitest run"` to the implementation repo's `package.json` `scripts` block if absent.
5. Runs `npx vitest run` once to confirm the wiring works before spawning the coder.

The example test is meant to be deleted as soon as the first real WU adds real tests — its purpose is purely to prove the wiring before the swarm depends on it.
