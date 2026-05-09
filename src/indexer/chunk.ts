/**
 * Markdown-aware chunker.
 *
 * Splits a file on H1/H2/H3 boundaries. Code fences (``` ... ```) are
 * preserved intact — we never break a chunk inside one. Each chunk gets
 * a deterministic id of the form `<relPath>#<heading-slug-path>` so
 * re-indexing the same file produces stable IDs.
 *
 * Token budget: estimated as ~4 chars per token (rough but adequate for
 * routing decisions; the actual cost is at the embedder, which has its
 * own per-call limits we respect there).
 */

const MAX_CHUNK_CHARS = 600 * 4; // ~600 tokens
const OVERLAP_CHARS = 50 * 4; // ~50 tokens overlap when splitting
/**
 * Minimum body length (the section text MINUS its heading line) for a
 * chunk to be embedded as its own unit. Sections shorter than this are
 * merged forward into the next non-empty sibling so the embedding has
 * something substantive to anchor on. Without this, headings like
 * `## Scope` with no body until the next sub-heading produce single-line
 * chunks that all match the same generic queries at the same similarity,
 * crowding real content out of search results.
 */
const MIN_BODY_CHARS = 80;

export interface Chunk {
  id: string;
  text: string;
  headings: string[]; // hierarchy from H1 down to deepest section heading
  startLine: number;
  endLine: number;
}

export function chunkMarkdown(relativePath: string, content: string): Chunk[] {
  const lines = content.split('\n');
  const rawSections = splitOnHeadings(lines);
  const sections = mergeTinySections(rawSections);

  const chunks: Chunk[] = [];
  for (const section of sections) {
    const sectionText = section.lines.join('\n').trim();
    if (sectionText.length === 0) continue;

    if (sectionText.length <= MAX_CHUNK_CHARS) {
      chunks.push({
        id: makeChunkId(relativePath, section.headings, 0),
        text: sectionText,
        headings: section.headings,
        startLine: section.startLine,
        endLine: section.endLine,
      });
    } else {
      const slices = sliceLong(sectionText);
      slices.forEach((slice, i) => {
        chunks.push({
          id: makeChunkId(relativePath, section.headings, i),
          text: slice,
          headings: section.headings,
          startLine: section.startLine,
          endLine: section.endLine,
        });
      });
    }
  }
  return chunks;
}

/**
 * Merge sections whose body (everything after the heading line) is
 * under MIN_BODY_CHARS into the next sibling. The merged section keeps
 * the heading hierarchy of the upstream tiny section so navigation
 * still works, but the embedded text now has substantive content.
 *
 * If a tiny section is the LAST section, it merges backward into the
 * previous one. This catches files that end on a near-empty heading.
 */
function mergeTinySections(sections: Section[]): Section[] {
  if (sections.length <= 1) return sections;
  const merged: Section[] = [];
  let i = 0;
  while (i < sections.length) {
    const current = sections[i];
    const body = bodyOfSection(current);
    if (body.length >= MIN_BODY_CHARS) {
      merged.push(current);
      i += 1;
      continue;
    }
    // tiny section — merge forward into the next sibling
    if (i + 1 < sections.length) {
      const next = sections[i + 1];
      merged.push({
        // Keep the LATER (more specific) heading hierarchy so search
        // results point at the section the user actually wants.
        headings: next.headings.length >= current.headings.length ? next.headings : current.headings,
        lines: [...current.lines, ...next.lines],
        startLine: current.startLine,
        endLine: next.endLine,
      });
      i += 2;
      continue;
    }
    // tiny section is the last — merge backward into the previous one
    if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      merged[merged.length - 1] = {
        headings: prev.headings,
        lines: [...prev.lines, ...current.lines],
        startLine: prev.startLine,
        endLine: current.endLine,
      };
    } else {
      // Lone tiny section in the file — keep it.
      merged.push(current);
    }
    i += 1;
  }
  return merged;
}

function bodyOfSection(section: Section): string {
  // The first line is the heading itself; "body" is everything after.
  const bodyLines = section.lines.slice(1);
  return bodyLines.join('\n').trim();
}

interface Section {
  headings: string[];
  lines: string[];
  startLine: number;
  endLine: number;
}

function splitOnHeadings(lines: string[]): Section[] {
  const sections: Section[] = [];
  let inFence = false;
  const stack: string[] = []; // current heading hierarchy
  let current: { headings: string[]; lines: string[]; startLine: number } = {
    headings: [...stack],
    lines: [],
    startLine: 1,
  };

  const flush = (endLine: number) => {
    if (current.lines.length > 0 || current.headings.length > 0) {
      sections.push({
        headings: current.headings,
        lines: current.lines,
        startLine: current.startLine,
        endLine,
      });
    }
  };

  lines.forEach((line, i) => {
    const lineNum = i + 1;
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      current.lines.push(line);
      return;
    }

    if (!inFence) {
      const m = /^(#{1,3})\s+(.+?)\s*$/u.exec(line);
      if (m) {
        // close the current section before the heading line
        flush(lineNum - 1);
        const depth = m[1].length;
        const text = m[2];
        // Truncate to depth-1, padding any holes left by missing parent
        // levels (e.g. a file that starts at H3 with no preceding H1/H2).
        stack.length = Math.max(0, depth - 1);
        for (let s = 0; s < stack.length; s++) {
          if (stack[s] === undefined) stack[s] = '';
        }
        stack.push(text);
        current = {
          headings: stack.filter((h) => h && h.length > 0),
          lines: [line],
          startLine: lineNum,
        };
        return;
      }
    }

    current.lines.push(line);
  });

  flush(lines.length);
  return sections;
}

function sliceLong(text: string): string[] {
  const out: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    const end = Math.min(pos + MAX_CHUNK_CHARS, text.length);
    out.push(text.slice(pos, end));
    if (end >= text.length) break;
    pos = end - OVERLAP_CHARS;
    if (pos <= 0) pos = end;
  }
  return out;
}

function makeChunkId(relPath: string, headings: string[], sliceIdx: number): string {
  const slug = headings
    .map((h) =>
      h
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-+|-+$/gu, '')
        .slice(0, 60),
    )
    .filter(Boolean)
    .join('/');
  const tail = sliceIdx > 0 ? `~${sliceIdx}` : '';
  return slug ? `${relPath}#${slug}${tail}` : `${relPath}#root${tail}`;
}
