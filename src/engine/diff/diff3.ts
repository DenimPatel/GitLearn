import { diffLines, splitLines } from './lcs';

export type MergeChunk =
  | { type: 'stable'; lines: string[] }
  | { type: 'ours'; lines: string[] }
  | { type: 'theirs'; lines: string[] }
  | { type: 'conflict'; base: string[]; ours: string[]; theirs: string[] };

/** Maps each base line index to the changed side's lines, so the two independent
 *  diffs can be walked in lockstep against a common spine. */
function alignToBase(base: string[], side: string[]): { replaced: string[] }[] {
  // slot i holds what `side` has in place of base line i; slot base.length holds a trailing insert
  const slots: { replaced: string[] }[] = Array.from({ length: base.length + 1 }, () => ({ replaced: [] }));
  const kept = new Array<boolean>(base.length).fill(false);
  let cursor = 0;
  for (const op of diffLines(base, side)) {
    if (op.type === 'eq') { kept[op.a] = true; cursor = op.a + 1; slots[op.a].replaced.push(op.line); }
    else if (op.type === 'del') { cursor = op.a + 1; }
    else { slots[Math.min(cursor, base.length)].replaced.push(op.line); }
  }
  // A base line that neither side kept is a deletion — its slot stays empty.
  for (let i = 0; i < base.length; i++) if (!kept[i]) { /* deleted: leave empty */ }
  return slots;
}

/**
 * Three-way line merge. Where only one side changed a region, that side wins.
 * Where both changed the same region differently, a conflict chunk is emitted.
 */
export function diff3(base: string[], ours: string[], theirs: string[]): MergeChunk[] {
  const o = alignToBase(base, ours);
  const t = alignToBase(base, theirs);
  const chunks: MergeChunk[] = [];

  const push = (c: MergeChunk) => {
    const last = chunks[chunks.length - 1];
    if (c.type === 'stable' && last?.type === 'stable') last.lines.push(...c.lines);
    else chunks.push(c);
  };

  for (let i = 0; i <= base.length; i++) {
    const baseLine = i < base.length ? [base[i]] : [];
    const ol = o[i].replaced;
    const tl = t[i].replaced;
    const oursChanged = !same(ol, baseLine);
    const theirsChanged = !same(tl, baseLine);

    if (!oursChanged && !theirsChanged) { if (baseLine.length) push({ type: 'stable', lines: baseLine }); }
    else if (oursChanged && !theirsChanged) { if (ol.length) push({ type: 'ours', lines: ol }); }
    else if (!oursChanged && theirsChanged) { if (tl.length) push({ type: 'theirs', lines: tl }); }
    else if (same(ol, tl)) { if (ol.length) push({ type: 'stable', lines: ol }); }
    else push({ type: 'conflict', base: baseLine, ours: ol, theirs: tl });
  }

  return mergeAdjacentConflicts(chunks);
}

/** Neighbouring conflicts read as one conflict to a human, so join them. */
function mergeAdjacentConflicts(chunks: MergeChunk[]): MergeChunk[] {
  const out: MergeChunk[] = [];
  for (const c of chunks) {
    const last = out[out.length - 1];
    if (c.type === 'conflict' && last?.type === 'conflict') {
      last.base.push(...c.base); last.ours.push(...c.ours); last.theirs.push(...c.theirs);
    } else out.push(c);
  }
  return out;
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export const hasConflict = (chunks: MergeChunk[]): boolean => chunks.some((c) => c.type === 'conflict');

/** Renders merged content, writing git's conflict markers where both sides changed. */
export function renderMerge(chunks: MergeChunk[], oursLabel: string, theirsLabel: string): string {
  const lines: string[] = [];
  for (const c of chunks) {
    if (c.type === 'conflict') {
      lines.push(`<<<<<<< ${oursLabel}`, ...c.ours, '=======', ...c.theirs, `>>>>>>> ${theirsLabel}`);
    } else {
      lines.push(...c.lines);
    }
  }
  return lines.length ? lines.join('\n') + '\n' : '';
}

export interface ContentMergeResult { content: string; conflicted: boolean }

export function mergeContent(
  base: string, ours: string, theirs: string, oursLabel: string, theirsLabel: string,
): ContentMergeResult {
  const chunks = diff3(splitLines(base), splitLines(ours), splitLines(theirs));
  return { content: renderMerge(chunks, oursLabel, theirsLabel), conflicted: hasConflict(chunks) };
}
