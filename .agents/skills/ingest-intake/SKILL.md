---
name: ingest-intake
description: Read raw material dropped in docs/build/intake/ and draft proposed catalogue records for the operator to accept
---

# ingest-intake

You are reading the operator's **raw pre-build material** and turning it into *draft* catalogue records they can accept, edit, or reject. The operator has dropped files into `docs/build/intake/` and run `/ingest-intake` (or you've arrived here from `/plan-orientation`, which checks intake first).

**Your job is to read, not to decide.** You draft proposed records and open questions. The operator confirms what becomes catalogue truth. This honours the harness's core honesty rule: the machine can read, but it does not assert semantic truth the human hasn't confirmed (D130 lineage).

**Mode:** honour `methodfile.json`'s `operator.mode` per `docs/build/OPERATOR-MODES.md` (default `standard` if unset) for how much you narrate.

---

## The two hard rules

1. **Intake is read-only source.** You read every file under `docs/build/intake/`. You **never** edit, move, rename, or delete anything in that folder. The operator owns their originals. Your output goes into the catalogue registers (`personas/`, `decisions/`, `open-questions/`, etc.), never back into `intake/`.

2. **Nothing you draft is accepted truth.** Every decision you draft carries `Status: 🔵 proposed`. Anything unresolved, contradictory, or merely implied becomes an **open question**, not an asserted fact. You surface drafts to the operator and let them accept. Drafting `accepted` records directly from raw input is forbidden — it's exactly the drift the catalogue exists to prevent.

---

## Step 0 — Find the material

List `docs/build/intake/` (recursively, excluding `README.md` and `.gitkeep`). 

- **If it's empty**, tell the operator plainly: *"There's nothing in `docs/build/intake/` yet. Drop any transcripts, briefs, notes, persona descriptions, or constraint docs you already have into that folder, then run `/ingest-intake` again. Or we can plan from a blank page — your call."* Then stop.
- **If there's material**, list what you found (filenames + rough type) and tell the operator you're about to read it all. No need to wait for confirmation to *read* — reading is safe.

For each file: read it. For formats you can parse (`.md`, `.txt`, `.json`, `.csv`, `.vtt`), read directly. For PDFs, read with the page-range tooling. For images or anything you can't parse, **don't guess** — list it and ask the operator to summarise its contents in a sentence or two.

## Step 1 — Extract candidates (do not write yet)

Read across everything and pull out candidates in these buckets. Hold them in working notes first; you'll write after the operator sees the shape.

- **Personas** — any specific person, role, or user the material describes. Capture their name/role, what they're trying to do, and what would make the project a win for them.
- **Proposed decisions** — any choice that appears already made or strongly implied ("we're using X", "it has to run offline", "no login"). Each becomes a `proposed` decision with the source quoted.
- **Open questions** — anything unresolved, contradictory across documents, assumed-without-basis, or that you'd need to ask a human to settle. Contradictions between two intake files are *automatically* open questions — quote both sides.
- **Scope / horizon signal** — what's in, what's out, rough phasing, deadlines, success criteria. These feed the horizon map (M001), not standalone records.
- **Constraints** — budget, deadline, mandated or forbidden tech, compliance, team size. A hard constraint with a clear source → proposed decision. A soft or unverified one → open question.

For each candidate, keep the **source pointer**: which intake file (and where in it) it came from. You'll cite this so the operator can trace every draft back to their own words.

## Step 2 — Show the operator the shape (before writing)

Present a compact summary, grouped by bucket. Something like:

> From your 3 intake files I can draft:
> - **2 personas**: "Maria, the SENCO" and "James, the parent"
> - **4 proposed decisions**: offline-first; Postgres; no third-party auth; mobile-last
> - **6 open questions**: incl. a contradiction — the brief says "GDPR-only" but the transcript mentions US users
> - **Horizon signal**: 3 phases implied; a March deadline
>
> Nothing here is committed yet. Want me to draft all of these as proposed records, or shall we walk them one at a time so you can drop the ones that don't fit?

Honour the operator's mode: in coaching mode, walk them one at a time. In developer mode, offer to draft the lot and let them prune. Either way, **the operator decides what gets drafted.**

## Step 3 — Draft the records the operator approved

For each approved candidate, write the catalogue record using the existing register templates and conventions — same as `/wu-new`, `/persona-new`, and the planning protocols produce. Key rules:

- **Personas** → `docs/build/personas/P-NNN-slug.md` using the persona template. Walk the seven dimensions where the intake supports them; leave gaps as inline open questions inside the file rather than inventing detail.
- **Decisions** → `docs/build/decisions/D-NNN-slug.md`, **`Status: 🔵 proposed`**, with a `## Source` line quoting the intake file and the relevant passage. Never `accepted`.
- **Open questions** → `docs/build/open-questions/` using that register's convention. For contradictions, quote both conflicting sources.
- **Horizon / scope signal** → do **not** silently write M001. Hand the extracted scope/phasing/deadline notes to `/plan-orientation` (or `/plan-maps`) as input. If the operator is running ingest standalone, write the notes into STATE.md's open-questions or a scratch note they can pull into planning — flag clearly that the map itself is built in the planning arc, not here.

Save each record as it's approved — don't batch to the end. After each, show the path.

Every drafted record must be traceable: a `## Source` (or inline source note) pointing at the intake file it came from. A reviewer accepting these later needs to check them against the operator's actual material, not against your paraphrase.

## Step 4 — Record what was ingested (audit, not mutation)

You must not move or stamp files inside `intake/`. Instead, append an ingest record to STATE.md (or a dedicated `docs/build/sessions/` note) capturing:

- Which intake files you read (by name + content hash if easy via `shasum`)
- What you drafted, with paths
- What you deferred to the planning arc
- Any intake file you couldn't parse and asked the operator about

This gives a re-run of `/ingest-intake` a way to see what's already been processed — without touching the operator's folder. On a re-run, read the prior ingest record and focus on files not previously ingested (or changed since, by hash).

## Step 5 — Hand off

End by pointing the operator at the next step:

- If they ran this standalone before planning: *"Drafts are filed as proposed. Run `/plan-orientation` when you're ready — it'll pick these up, and we'll firm up which proposed decisions you actually accept as we go."*
- If they got here from `/plan-orientation`: return control to that protocol with the drafts in place.

**Remember the boundary the whole time:** you read their material and proposed structure. You did not decide their project. The proposed records are a starting draft for a human to accept — that's the AI-native move: review happens on the *spec*, and the human owns the truth.
