/**
 * Output formatter — human-readable table or JSON.
 */

import type { SearchHit } from './query.js';

export function formatHumanReadable(hits: SearchHit[]): string {
  if (hits.length === 0) return '(no results)';
  return hits
    .map((h, i) => {
      const idTag = h.idInKind ? ` ${h.idInKind}` : '';
      const status = h.status ? ` [${h.status}]` : '';
      const heading = h.headings ? ` › ${h.headings}` : '';
      const lines = h.startLine ? `:${h.startLine}-${h.endLine}` : '';
      return [
        `${(i + 1).toString().padStart(2)}. ${h.path}${lines}`,
        `    ${h.fileKind}${idTag}${status}${heading}  (score ${h.score.toFixed(4)})`,
        `    ${h.snippet}`,
      ].join('\n');
    })
    .join('\n\n');
}

export function formatJson(hits: SearchHit[]): string {
  return JSON.stringify({ hits }, null, 2);
}
