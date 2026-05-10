/**
 * Minimal line-counting diff helper.
 *
 * Phase I only needs to know "did the file change, and by roughly how
 * much". Full unified-diff output is a future enhancement; today the
 * drift report names the file and the magnitude.
 */

export interface LineCounts {
  added: number;
  removed: number;
}

/**
 * Counts lines that differ between `before` and `after` using a basic
 * Myers-style diff. For the catalogue's small files this is fast
 * enough; if we ever need to diff multi-MB files we'd swap in `diff`
 * from npm.
 */
export function countLineDiff(before: string, after: string): LineCounts {
  if (before === after) return { added: 0, removed: 0 };

  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  // Build LCS table — small files, O(n*m) is fine.
  const m = beforeLines.length;
  const n = afterLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (beforeLines[i] === afterLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const lcsLength = dp[0][0];
  return {
    removed: m - lcsLength,
    added: n - lcsLength,
  };
}
