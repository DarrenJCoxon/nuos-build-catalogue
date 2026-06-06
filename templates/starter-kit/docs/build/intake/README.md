# Intake — drop your raw input here before planning

This is the **front door** for material you already have. Before the planning arc starts, you probably have things sitting on your disk or in your head: interview transcripts, a product brief, meeting notes, a spreadsheet of requirements, a competitor teardown, screenshots of a design, a half-written spec. Drop them here.

When you run `/ingest-intake` (or start `/plan-orientation`), the AI reads everything in this folder and turns it into **draft** catalogue records — proposed decisions, candidate personas, open questions — that you then accept, edit, or reject in conversation. Your planning session starts from your actual material instead of a blank page.

## The contract for this folder

**Read-only source.** The AI reads what you drop here. It never edits, moves, or deletes your originals. The folder is your input; the catalogue is the output. If you want a file gone, you delete it yourself.

**Nothing here is truth yet.** Dropping a document does not make its claims into accepted project decisions. The AI drafts records as `proposed` or as open questions, and *you* decide what becomes catalogue truth in the planning conversation. (This is the same honesty rule the whole harness runs on — the machine can read, but it doesn't assert truth you haven't confirmed.)

## What to drop

Anything that captures intent, scope, constraints, or context. Examples:

- Interview or meeting transcripts (`.txt`, `.md`, `.vtt`)
- A product requirements doc, brief, or pitch (`.md`, `.pdf`, `.docx`)
- Notes — even rough ones
- A list of the people the project is for
- Constraints: budget, deadline, tech you must use, tech you can't
- Existing diagrams or screenshots (the AI reads what it can; for images it will ask you to describe what it can't parse)

## What happens to it

| You drop | The AI may draft (for your approval) |
| --- | --- |
| A persona description | a `personas/` candidate (P-NNN) |
| "We decided to use Postgres" | a `decisions/` record, status `proposed` |
| Something unresolved or contradictory | an `open-questions/` entry |
| Scope / what's-in-what's-out | notes feeding the horizon map (M001) |
| A constraint | an open question or a proposed decision |

You can keep dropping files here at any point in the project's life, not just at the start — re-run `/ingest-intake` whenever you add something new.
