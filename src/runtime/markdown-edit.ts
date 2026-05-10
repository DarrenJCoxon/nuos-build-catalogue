/**
 * Minimal markdown editors for the Phase H part 2 write commands.
 *
 * The catalogue's existing files use two status formats:
 *   - bold:        `**Status:** <text>`
 *   - pipe-table:  `| Status | <text> |`
 *
 * Both are rewritten in place by `replaceStatusLine`. If neither is
 * found, the helper inserts a `**Status:**` line near the file's H1.
 *
 * For AC ticking we deliberately do NOT parse the AC list (different
 * files use different shapes — `- [ ] text`, numbered lists, prose
 * bullets, sub-headings). Instead, `appendChangeLog` writes a
 * structured footer entry naming the change. The maintainer can then
 * hand-tighten the AC list itself if they want; the workflow record
 * + audit chain are the canonical statements either way.
 */

const BOLD_STATUS_RE = /^(\*\*Status:\*\*\s*)(.+?)(\s*)$/m;
const TABLE_STATUS_RE = /^(\|\s*Status\s*\|\s*)(.+?)(\s*\|\s*)$/m;

/**
 * Replace the file's status line in place.
 *
 * Returns `{ updated: string, replaced: boolean }`. If `replaced` is
 * false, the file did not have a status line in either supported
 * format; the caller decides whether to insert one (`insertStatusLine`).
 */
export function replaceStatusLine(
  rawMarkdown: string,
  newStatus: string
): { updated: string; replaced: boolean } {
  if (BOLD_STATUS_RE.test(rawMarkdown)) {
    return {
      updated: rawMarkdown.replace(BOLD_STATUS_RE, `$1${newStatus}$3`),
      replaced: true,
    };
  }
  if (TABLE_STATUS_RE.test(rawMarkdown)) {
    return {
      updated: rawMarkdown.replace(TABLE_STATUS_RE, `$1${newStatus}$3`),
      replaced: true,
    };
  }
  return { updated: rawMarkdown, replaced: false };
}

/**
 * Insert a `**Status:** <newStatus>` line immediately after the file's
 * first H1 heading (with a blank line separator). If there is no H1,
 * prepend the status line at the top.
 */
export function insertStatusLine(rawMarkdown: string, newStatus: string): string {
  const h1Match = /^#\s+.+$/m.exec(rawMarkdown);
  if (!h1Match) {
    return `**Status:** ${newStatus}\n\n${rawMarkdown}`;
  }
  const insertAt = h1Match.index + h1Match[0].length;
  const before = rawMarkdown.slice(0, insertAt);
  const after = rawMarkdown.slice(insertAt);
  return `${before}\n\n**Status:** ${newStatus}${after}`;
}

export interface ChangeLogEntry {
  isoTimestamp: string;
  summary: string;
  details?: string;
  /** Optional source pointer — commit ref, evidence URL, etc. */
  reference?: string;
}

/**
 * Append a structured entry to a markdown file's `## Build catalogue
 * history` section (creating it if missing). This is the audit-trail
 * surface for write operations whose effect on the markdown is
 * non-trivial to express by structural edit alone (e.g. AC ticks,
 * status change rationales).
 *
 * Idempotence: each call appends; running the same workflow twice
 * appends twice. The audit chain in the workflow store is the
 * deduplicating source of truth.
 */
export function appendChangeLog(rawMarkdown: string, entry: ChangeLogEntry): string {
  const heading = '## Build catalogue history';
  const headingIndex = rawMarkdown.indexOf(heading);

  const detailLines: string[] = [];
  if (entry.details) detailLines.push(`  - ${entry.details}`);
  if (entry.reference) detailLines.push(`  - Reference: ${entry.reference}`);

  const block = [
    `- **${entry.isoTimestamp}** — ${entry.summary}`,
    ...detailLines,
  ].join('\n');

  if (headingIndex === -1) {
    const sep = rawMarkdown.endsWith('\n') ? '' : '\n';
    return `${rawMarkdown}${sep}\n${heading}\n\n${block}\n`;
  }

  // Find the end of the file (or the next section) and insert before that.
  // Simplest: append the block immediately after the existing section's
  // current content. We treat everything from `headingIndex` to the
  // next H1/H2 boundary (or EOF) as the section.
  const tail = rawMarkdown.slice(headingIndex);
  const nextHeadingMatch = /\n##? \S/.exec(tail.slice(heading.length));
  if (!nextHeadingMatch) {
    // History is the last section — append at end of file.
    const sep = rawMarkdown.endsWith('\n') ? '' : '\n';
    return `${rawMarkdown}${sep}${block}\n`;
  }
  const splitAt = headingIndex + heading.length + nextHeadingMatch.index;
  const before = rawMarkdown.slice(0, splitAt);
  const after = rawMarkdown.slice(splitAt);
  const beforeHasTrailingNewline = before.endsWith('\n');
  const sep = beforeHasTrailingNewline ? '' : '\n';
  return `${before}${sep}${block}\n${after}`;
}
