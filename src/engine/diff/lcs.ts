/** Longest-common-subsequence line diff. O(n*m) dynamic programming, which is
 *  more than fast enough for tutorial-sized files and far easier to read (and
 *  to trust) than Myers. This one function backs `git diff`, `git show`, the
 *  commit --stat line, and the three-way merge. */

export type DiffOp =
  | { type: 'eq'; a: number; b: number; line: string }
  | { type: 'del'; a: number; line: string }
  | { type: 'ins'; b: number; line: string };

export function diffLines(a: string[], b: string[]): DiffOp[] {
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: 'eq', a: i, b: j, line: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', a: i, line: a[i] }); i++; }
    else { out.push({ type: 'ins', b: j, line: b[j] }); j++; }
  }
  while (i < n) { out.push({ type: 'del', a: i, line: a[i] }); i++; }
  while (j < m) { out.push({ type: 'ins', b: j, line: b[j] }); j++; }
  return out;
}

export const splitLines = (s: string): string[] => (s === '' ? [] : s.replace(/\n$/, '').split('\n'));
