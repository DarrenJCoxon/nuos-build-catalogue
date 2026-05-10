# persona-new

Create a new persona (P-NNN) for this NuOS Build Method project.

A persona is a **specification of who will use an outcome and what situation they will be in when they use it** — not a demographic snapshot, but a design constraint. Personas live as first-class catalogue entries (per D046) so they can be cited by stable handle from multiple WUs.

If arguments are provided (`$ARGUMENTS` for OpenCode/Claude Code, prompt-supplied for Codex), use them as the persona name; otherwise prompt the operator for the name.

Steps:

1. **Determine the next available P number.** Scan `docs/build/personas/` and `docs/build/personas/done/` for the maximum P-NNN prefix. The new number is max + 1.
2. **Slugify the persona name** — lowercase, dashes for spaces, no special characters, max 60 chars.
3. **Generate the file** at `docs/build/personas/P<NNN>-<slug>.md` from the template at `starter-kit/docs/build/personas/001-template.md`. Replace placeholders with operator-supplied values.
4. **Prompt the operator for the seven dimensions:**

   - **1. Identity** — who they are in the context of *this system*. Not their age or job title in the abstract — their relationship to this particular system. What account do they have? What role do they play? What other systems have they used that shape their expectations?
   - **2. Reality** — physical environment when they use the outcome. Device, connection quality, noise level, time pressure. Real conditions, not idealised ones.
   - **3. Psychology** — technical confidence, stress level, tolerance for confusion. Will they read instructions or click around? Will they abandon if a page takes more than three seconds?
   - **4. Trigger** — what brings them to this outcome. A real-world event, not a UI click. The event in their life that created the need.
   - **5. History** — what they have done before arriving at this outcome. Returning user vs first-time visitor. Saved details vs no context.
   - **6. Success** — what "done" looks like from *their* perspective. Not what the system logs — what they *feel*. This drives the design.
   - **7. Constraints** — what they cannot or will not do. Defines the outer boundary of acceptable design.

5. **Prompt for the acid-test refinement.** The hardest legitimate user — this persona with the most demanding combination of real constraints. Not a hostile user; a legitimate one with the worst realistic conditions. Slow device, low technical confidence, time pressure, complex situation. Design for the acid-test and the standard cases hold.
6. **Prompt for paired persona (if any).** If this persona's outcomes are paired with another's — a customer who books an event and an organiser who receives the booking — capture the paired P-NNN. If no pair exists yet, the operator may file the paired persona next via a second `persona-new` invocation.
7. **Apply the persona discipline checks:**

   - **Does this persona change a design decision?** If you could substitute this persona with a different one and the WU specification would be identical, the persona is decorative. Surface the gap and prompt for refinement.
   - **Does this persona have specific triggers, not just a demographic profile?** A persona without triggers is a character in search of a plot. Surface and prompt for refinement.
   - **Is the acid-test the hardest legitimate combination, or only a slightly harder version of the easy case?** The acid-test must be uncomfortable to design for — that is its point.

8. **Add a row to `docs/build/personas/_index.md`.** Status `🟢 active`. The "Used by WUs" cell stays empty until WUs cite it (which the `wu-new` protocol will update).
9. **Surface to the operator:**
   - The new persona file path (clickable)
   - The row added to `_index.md`
   - Any discipline checks that surfaced gaps (paired-persona suggestion; "this persona doesn't yet constrain a decision" warning)
   - The next concrete action — typically: file a WU that serves this persona (`wu-new`), or file the paired persona

**Discipline:** the persona is a design constraint or it is decoration. The seven dimensions exist to make every design decision answerable. If the persona file does not constrain at least one decision a future WU will need to make, rewrite it until it does.

**On the multi-month context (per D046):** in serious systems, personas are referenced from many WUs over many months. The seven-dimension shape is what makes the persona reusable — generic personas ("the user") force every WU to invent the persona inline; specific personas with stable handles let outcomes inherit the constraint. The persona register is the catalogue's commitment to this reuse.

If the operator wants to skip a dimension because it feels obvious, accommodate but record what was skipped — a future WU may need exactly that dimension and find it missing. The catalogue's value is that what was decided is recorded; what was not yet decided is also recorded, as a known gap.
