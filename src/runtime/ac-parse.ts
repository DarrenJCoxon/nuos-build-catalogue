/**
 * Acceptance-criteria parser + tickr.
 *
 * Two shapes are recognised, matching what the live catalogue uses:
 *
 *   1. Checkbox: `- [ ] text` (unticked) or `- [x] text` (ticked)
 *   2. Numbered + emoji: `1. ✅ text` (ticked) or `1. text` (unticked)
 *
 * Files that don't match either shape produce an empty AC list — the
 * maintainer falls back to hand-editing for those. WU 073 is the only
 * known WU that uses neither shape.
 *
 * The parser scans only inside the `## Acceptance criteria` section
 * (case-insensitive; tolerates the ` (= verification)` suffix per
 * D046). Lines outside that section are ignored even if they happen
 * to look like AC.
 */

import type { AcceptanceCriterion } from '@nusoft/nuflow-pack-nuos-build-catalogue';

/** Internal extended shape that retains the source line for byte-accurate replacement. */
export interface ParsedAcceptanceCriterion {
  /** Zero-based index in the AC list as parsed. */
  index: number;
  /** AC text without the bullet/checkbox/number/emoji prefix. */
  text: string;
  /** True if the source markdown has the ticked form. */
  met: boolean;
  /** The original full line as it appeared in the markdown — used by `tickAcceptanceCriterion` for in-place replacement. */
  rawLine: string;
  /** Bullet style detected for this entry — used to render the ticked form in the same shape. */
  style: 'checkbox' | 'numbered-emoji';
  /** Numeric prefix preserved (e.g. "1") for numbered entries; empty string for checkbox. */
  numberPrefix: string;
}

const HEADING_RE = /^##\s+Acceptance\s+criteria(\s*\(=\s*verification\))?\s*$/im;

const CHECKBOX_RE = /^(\s*-\s+\[)([ xX])(\]\s+)(.+)$/;
const NUMBERED_TICKED_RE = /^(\s*)(\d+)(\.\s+)(✅\s+)(.+)$/u;
const NUMBERED_UNTICKED_RE = /^(\s*)(\d+)(\.\s+)(?!✅|⏳|⚠|❌|🔴)([^*-].*)$/u;

/**
 * Parse the AC list from a WU markdown body.
 *
 * Returns an empty list if no `## Acceptance criteria` heading exists,
 * if the section has no recognisable AC entries, or if the section is
 * empty.
 */
export function parseAcceptanceCriteria(rawMarkdown: string): ParsedAcceptanceCriterion[] {
  const headingMatch = HEADING_RE.exec(rawMarkdown);
  if (!headingMatch) return [];

  const sectionStart = headingMatch.index + headingMatch[0].length;
  // Find the next ## or # heading (or EOF) to bound the section
  const tail = rawMarkdown.slice(sectionStart);
  const nextHeadingMatch = /^#{1,2}\s+\S/m.exec(tail);
  const sectionEnd = nextHeadingMatch ? sectionStart + nextHeadingMatch.index : rawMarkdown.length;

  const section = rawMarkdown.slice(sectionStart, sectionEnd);
  const lines = section.split('\n');

  const result: ParsedAcceptanceCriterion[] = [];
  let index = 0;

  for (const line of lines) {
    // Try checkbox first
    const cb = CHECKBOX_RE.exec(line);
    if (cb) {
      result.push({
        index,
        text: cb[4].trim(),
        met: cb[2].toLowerCase() === 'x',
        rawLine: line,
        style: 'checkbox',
        numberPrefix: '',
      });
      index += 1;
      continue;
    }

    // Then numbered + ✅
    const nt = NUMBERED_TICKED_RE.exec(line);
    if (nt) {
      result.push({
        index,
        text: nt[5].trim(),
        met: true,
        rawLine: line,
        style: 'numbered-emoji',
        numberPrefix: nt[2],
      });
      index += 1;
      continue;
    }

    // Then numbered without leading emoji (treated as unticked)
    const nu = NUMBERED_UNTICKED_RE.exec(line);
    if (nu) {
      result.push({
        index,
        text: nu[4].trim(),
        met: false,
        rawLine: line,
        style: 'numbered-emoji', // round-trips back as numbered+emoji when ticked
        numberPrefix: nu[2],
      });
      index += 1;
      continue;
    }
  }

  return result;
}

/**
 * Flip the AC at `targetIndex` from unticked to ticked, preserving the
 * original style. If the AC is already ticked, the markdown is
 * returned unchanged. If the index is out of range or no AC list is
 * found, throws.
 */
export function tickAcceptanceCriterion(rawMarkdown: string, targetIndex: number): string {
  const acs = parseAcceptanceCriteria(rawMarkdown);
  if (acs.length === 0) {
    throw new Error('tickAcceptanceCriterion: no acceptance-criteria section found in this markdown');
  }
  if (targetIndex < 0 || targetIndex >= acs.length) {
    throw new Error(
      `tickAcceptanceCriterion: index ${targetIndex} out of range (AC list has ${acs.length} entries)`
    );
  }

  const target = acs[targetIndex];
  if (target.met) {
    return rawMarkdown; // already ticked; no-op
  }

  const tickedLine = renderTickedLine(target);
  // Replace the FIRST occurrence of the raw line (we expect uniqueness
  // because the same line text appearing twice in the AC section would
  // already be a catalogue-discipline issue).
  return rawMarkdown.replace(target.rawLine, tickedLine);
}

function renderTickedLine(ac: ParsedAcceptanceCriterion): string {
  switch (ac.style) {
    case 'checkbox':
      return ac.rawLine.replace(CHECKBOX_RE, '$1x$3$4');
    case 'numbered-emoji':
      // Two cases: was numbered-ticked already (caller shouldn't hit this
      // because met==true returns early), or was numbered-unticked.
      if (ac.rawLine.includes('✅')) {
        return ac.rawLine; // defensive: shouldn't happen
      }
      return ac.rawLine.replace(NUMBERED_UNTICKED_RE, '$1$2$3✅ $4');
  }
}

/**
 * Extract AC list in the shape the build-catalogue pack's
 * `work_unit.advance_status` workflow expects in
 * `metadata.acceptanceCriteria` for the completion gate.
 *
 * Evidence inference:
 *   - If the AC is ticked in markdown AND there's a Build catalogue
 *     history entry naming this AC index, evidence comes from the
 *     history entry.
 *   - If the AC is ticked in markdown with no history entry, evidence
 *     defaults to "Ticked in source markdown."
 *   - If the AC is unticked, evidence is undefined and the completion
 *     gate will reject.
 */
export function extractForCompletion(rawMarkdown: string): AcceptanceCriterion[] {
  const parsed = parseAcceptanceCriteria(rawMarkdown);
  const historyEvidence = parseHistoryEvidence(rawMarkdown);
  return parsed.map((ac) => ({
    text: ac.text,
    met: ac.met,
    evidence: ac.met
      ? historyEvidence.get(ac.index) ?? 'Ticked in source markdown.'
      : undefined,
  }));
}

/**
 * Parse the `## Build catalogue history` section for tick entries
 * matching `Acceptance criterion <N> ticked` and pull the
 * `Evidence: ...` line from the same entry. Returns a map from AC
 * index (zero-based, matching `parseAcceptanceCriteria` output) to
 * the evidence string.
 *
 * The history log uses 1-based AC numbering in its summary line
 * ("Acceptance criterion 3 ticked: ..."), but we map to 0-based
 * indexing here for consistency with the rest of the pipeline.
 */
function parseHistoryEvidence(rawMarkdown: string): Map<number, string> {
  const result = new Map<number, string>();
  // Anchor the heading lookup to start-of-line so prose mentions inside
  // code spans or paragraphs (e.g. a WU's notes log discussing the
  // section by name) don't false-match the literal string.
  const HEADING_RE = /^## Build catalogue history\s*$/m;
  const headingMatch = HEADING_RE.exec(rawMarkdown);
  if (!headingMatch) return result;
  const historyHeadingIndex = headingMatch.index;
  const headingLength = headingMatch[0].length;

  const sectionTail = rawMarkdown.slice(historyHeadingIndex);
  // Bound the history section at the next ## heading (if any).
  const nextSectionMatch = /\n## \S/.exec(sectionTail.slice(headingLength));
  const sectionEnd = nextSectionMatch ? headingLength + nextSectionMatch.index : sectionTail.length;
  const section = sectionTail.slice(0, sectionEnd);

  // Split into entries on the top-level `- **<timestamp>**` bullets.
  // Each entry runs until the next top-level bullet or end-of-section.
  const blocks = section.split(/\n(?=- \*\*)/);
  for (const block of blocks) {
    if (!/^- \*\*/.test(block)) continue;
    const summaryMatch = /Acceptance criterion (?:at index )?(\d+)/i.exec(block);
    if (!summaryMatch) continue;
    const evidenceMatch = /^\s*-\s*Evidence:\s*(.+?)$/m.exec(block);
    let index = parseInt(summaryMatch[1], 10);
    if (/at index/i.test(block)) {
      // already 0-based
    } else {
      index = index - 1;
    }
    if (index < 0) continue;
    const evidence = evidenceMatch ? evidenceMatch[1].trim() : 'Ticked via workflow.';
    result.set(index, evidence);
  }
  return result;
}
