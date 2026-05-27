# [Module name]

> *Replace bracketed placeholders. Delete this hint block once filled in.*

**Status:** 🔵 proposed / 🟡 in flight / 🟢 active / ⚫ retired
**Owner:** [persona handle and name — or "infrastructure" if not user-facing]
**Last updated:** {{TODAY}}

## What this module does

[One paragraph in plain language. Avoid implementation language. Describe the responsibility, not the code.]

> Example: "The Overnight Consolidation module processes every interaction with a student during a school day and produces, by morning, a per-student plan ranked by need."

## Interface surface

> *Small by design. List every public entry point another module can call: function names, exported types, HTTP routes, CLI commands, message types. If this list runs longer than a screen, the interface is wide — the module is at risk of being shallow. See [deep-modules.md](../../philosophy/deep-modules.md).*

- [public function / route / type]
- [...]

## Hidden complexity

> *Large by design. List what this module encapsulates that callers do not have to think about: state, branching, external integrations, retry logic, validation, edge cases, persistence, ordering, concurrency. The depth ratio (hidden complexity ÷ interface surface) is what makes a module deep.*

- [thing hidden from callers]
- [...]

## Depth justification

> *Required for every module. Answer in two or three sentences: why is the hidden complexity above genuinely larger than the interface surface above? If you cannot answer this, the module is shallow — fold its work into an existing module instead of filing a new one.*

[The depth argument.]

## Paths claimed

> *Required. List the source-tree paths this module owns. The PreToolUse hook (`check-module-discipline.sh`) reads this section and blocks writes to source files not claimed by any module. Use directory prefixes (`src/auth/`) or glob-style patterns (`src/auth/**`). One per line, as a bullet.*

- `src/[module-slug]/`
- [...]

## Who uses it directly

[List the personas who interact with this module via UI/UX surfaces. Each as `[P001](../personas/P001-name.md)` with a one-line note on how they use it.]

## What it depends on

- **Other modules:** [list with links to their architecture files]
- **External services:** [APIs, vendors, hardware]
- **Hardware or infrastructure:** [if relevant]

## What depends on it

[What would break if this module went away or returned wrong results? List the affected modules + the affected user-facing surfaces.]

## Contracts this module owns

[List the contracts in `contracts/` that this module produces. One per row.]

| Contract | What it provides |
| --- | --- |
| [contract handle/file] | [one-line description] |

## Open questions about this module

[Link to Q-NNN entries in `open-questions/` that affect this module specifically. If none yet, write _none currently_.]

## Decisions specific to this module

[Link to D-NNN entries that affect just this module. Cross-cutting decisions can stay in the decisions register without being linked here.]

## Notes

[Date-stamped notes about how this module has evolved. Use this section the way you'd use a work unit's notes section — what was tried, what worked, what didn't.]
