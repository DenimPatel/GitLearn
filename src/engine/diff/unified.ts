import { diffLines, splitLines, type DiffOp } from './lcs';

export interface DiffStat { files: number; insertions: number; deletions: number }

export interface FileDiff {
  path: string;
  status: 'added' | 'deleted' | 'modified';
  hunks: string[];
  insertions: number;
  deletions: number;
}

/** Renders one file's change as unified diff text with @@ hunk headers. */
export function unifiedDiff(path: string, before: string, after: string, context = 3): FileDiff {
  const a = splitLines(before);
  const b = splitLines(after);
  const ops = diffLines(a, b);

  const insertions = ops.filter((o) => o.type === 'ins').length;
  const deletions = ops.filter((o) => o.type === 'del').length;
  const status: FileDiff['status'] =
    before === '' && after !== '' ? 'added' : after === '' && before !== '' ? 'deleted' : 'modified';

  const lines: string[] = [];
  lines.push(`diff --git a/${path} b/${path}`);
  if (status === 'added') lines.push('new file mode 100644');
  if (status === 'deleted') lines.push('deleted file mode 100644');
  lines.push(`--- ${status === 'added' ? '/dev/null' : 'a/' + path}`);
  lines.push(`+++ ${status === 'deleted' ? '/dev/null' : 'b/' + path}`);

  // Group changed ops into hunks, padded with `context` unchanged lines.
  const changed = ops.map((o) => o.type !== 'eq');
  let idx = 0;
  while (idx < ops.length) {
    if (!changed[idx]) { idx++; continue; }
    let start = Math.max(0, idx - context);
    let end = idx;
    while (end < ops.length) {
      const nextChange = changed.indexOf(true, end + 1);
      if (nextChange !== -1 && nextChange - end <= context * 2) end = nextChange;
      else break;
    }
    end = Math.min(ops.length - 1, end + context);

    const slice = ops.slice(start, end + 1);
    const aStart = firstIndex(slice, 'a') ?? 0;
    const bStart = firstIndex(slice, 'b') ?? 0;
    const aCount = slice.filter((o) => o.type !== 'ins').length;
    const bCount = slice.filter((o) => o.type !== 'del').length;
    lines.push(`@@ -${aCount ? aStart + 1 : 0},${aCount} +${bCount ? bStart + 1 : 0},${bCount} @@`);
    for (const o of slice) {
      lines.push((o.type === 'eq' ? ' ' : o.type === 'del' ? '-' : '+') + o.line);
    }
    idx = end + 1;
  }

  return { path, status, hunks: lines, insertions, deletions };
}

function firstIndex(ops: DiffOp[], side: 'a' | 'b'): number | null {
  for (const o of ops) {
    if (side === 'a' && o.type !== 'ins') return o.a;
    if (side === 'b' && o.type !== 'del') return o.b;
  }
  return null;
}

export function renderStat(diffs: FileDiff[]): string[] {
  if (!diffs.length) return [];
  const width = Math.max(...diffs.map((d) => d.path.length));
  const out = diffs.map((d) => {
    const n = d.insertions + d.deletions;
    return ` ${d.path.padEnd(width)} | ${String(n).padStart(2)} ` +
      '+'.repeat(Math.min(d.insertions, 40)) + '-'.repeat(Math.min(d.deletions, 40));
  });
  const ins = diffs.reduce((s, d) => s + d.insertions, 0);
  const del = diffs.reduce((s, d) => s + d.deletions, 0);
  out.push(summaryLine({ files: diffs.length, insertions: ins, deletions: del }));
  return out;
}

export function summaryLine(stat: DiffStat): string {
  const parts = [`${stat.files} file${stat.files === 1 ? '' : 's'} changed`];
  if (stat.insertions) parts.push(`${stat.insertions} insertion${stat.insertions === 1 ? '' : 's'}(+)`);
  if (stat.deletions) parts.push(`${stat.deletions} deletion${stat.deletions === 1 ? '' : 's'}(-)`);
  return ' ' + parts.join(', ');
}
