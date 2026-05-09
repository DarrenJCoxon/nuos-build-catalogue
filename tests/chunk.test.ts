import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chunkMarkdown } from '../src/indexer/chunk.ts';

describe('chunkMarkdown', () => {
  it('emits a single chunk for short files', () => {
    const md = `# Title\n\nSome short content.\n`;
    const chunks = chunkMarkdown('a/b.md', md);
    assert.equal(chunks.length, 1);
    assert.match(chunks[0].id, /^a\/b\.md#title$/);
    assert.deepEqual(chunks[0].headings, ['Title']);
  });

  it('splits on H2 boundaries when sections have substantive content', () => {
    const intro = 'Introduction text that is long enough to make this section stand on its own without being merged into a sibling.';
    const sectionA = 'This is section A with sufficient body content to remain a standalone chunk after the merge-tiny-sections pass.';
    const sectionB = 'And section B likewise carries enough body to stand on its own; merging only fires when sections are near-empty.';
    const md = `# Doc\n\n${intro}\n\n## Section A\n\n${sectionA}\n\n## Section B\n\n${sectionB}\n`;
    const chunks = chunkMarkdown('x.md', md);
    assert.equal(chunks.length, 3, 'three substantive sections should produce three chunks');
    const idHeadings = chunks.map((c) => c.headings.join('/'));
    assert.deepEqual(idHeadings, ['Doc', 'Doc/Section A', 'Doc/Section B']);
  });

  it('merges near-empty sections forward into the next sibling', () => {
    // Headings with no body (just a heading line, no following content)
    // should not produce their own chunks. They should merge with the
    // next section so the embedded text is substantive.
    const md = [
      '# Doc',
      '',
      '## Scope',
      '',
      '## Real content',
      '',
      'This is a section with substantive body content that should anchor the chunk and pull the empty Scope heading along with it.',
      '',
    ].join('\n');
    const chunks = chunkMarkdown('x.md', md);
    // Should NOT have a standalone "## Scope" chunk
    const scopeOnly = chunks.find(
      (c) => c.headings.includes('Scope') && c.text.trim().split('\n').length <= 1,
    );
    assert.equal(scopeOnly, undefined, 'tiny Scope-only chunk must not exist');
    // The "Real content" chunk should contain the substantive body
    const realContent = chunks.find((c) => c.text.includes('substantive body content'));
    assert.ok(realContent, 'real-content chunk must exist');
  });

  it('merges a trailing tiny section backward into its predecessor', () => {
    const md = [
      '# Doc',
      '',
      'A section with substantive body content that stands on its own without needing to merge with anything else around it.',
      '',
      '## Trailing tiny',
      '',
    ].join('\n');
    const chunks = chunkMarkdown('x.md', md);
    // The trailing tiny section should not produce its own chunk
    const trailing = chunks.find((c) => c.headings.includes('Trailing tiny'));
    assert.equal(trailing, undefined, 'trailing tiny chunk must merge backward');
    assert.equal(chunks.length, 1);
  });

  it('preserves code fences across heading-shaped lines inside the fence', () => {
    // Each section needs substantive body so they don't merge — the test
    // is about fence-handling, not merging.
    const docBody = 'Lead-in paragraph for the doc that gives the chunker enough body to keep this section standalone after the merge-tiny-sections pass.';
    const realBody = 'Real content body with enough words to stand on its own as a chunk without being merged forward or backward.';
    const md = [
      '# Doc',
      '',
      docBody,
      '',
      '```',
      '## not a heading',
      'still inside fence',
      '```',
      '',
      '## real heading',
      '',
      realBody,
      '',
    ].join('\n');
    const chunks = chunkMarkdown('x.md', md);
    // The fake "## not a heading" inside the fence must not split
    assert.equal(chunks.length, 2);
    assert.deepEqual(chunks[0].headings, ['Doc']);
    assert.deepEqual(chunks[1].headings, ['Doc', 'real heading']);
    assert.match(chunks[0].text, /not a heading/);
  });

  it('produces deterministic chunk IDs', () => {
    const md = `# A\n\n## B\n\ntext\n`;
    const a = chunkMarkdown('p.md', md);
    const b = chunkMarkdown('p.md', md);
    assert.deepEqual(
      a.map((c) => c.id),
      b.map((c) => c.id),
    );
  });

  it('builds nested heading hierarchy across H1/H2/H3 with substantive bodies', () => {
    const topBody = 'Top-level introductory paragraph long enough to be its own chunk and not get merged into a sibling section.';
    const midBody = 'Mid-level paragraph with sufficient body content to stand on its own and avoid being merged forward by the chunker.';
    const deepBody = 'Deep-level leaf content with enough body to stand on its own as a chunk without merging anywhere.';
    const md = `# Top\n\n${topBody}\n\n## Mid\n\n${midBody}\n\n### Deep\n\n${deepBody}\n`;
    const chunks = chunkMarkdown('p.md', md);
    const deep = chunks.find((c) => c.headings.length === 3);
    assert.ok(deep, 'expected a deep chunk');
    assert.deepEqual(deep!.headings, ['Top', 'Mid', 'Deep']);
  });

  it('slices very long sections with overlap', () => {
    const longLine = 'word '.repeat(2000); // ~10000 chars
    const md = `# Big\n\n${longLine}\n`;
    const chunks = chunkMarkdown('p.md', md);
    assert.ok(chunks.length >= 4, `expected multiple chunks, got ${chunks.length}`);
    const ids = chunks.map((c) => c.id);
    // First chunk has no slice suffix; later ones do
    assert.equal(ids[0], 'p.md#big');
    assert.match(ids[1], /^p\.md#big~1$/);
  });
});
