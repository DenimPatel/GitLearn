import { readBlob, writeObject } from '../objects';
import { flatTreeOfCommit, type FlatTree } from '../trees';
import { mergeContent } from '../diff/diff3';
import type { Oid, Repository } from '../types';

export type ConflictKind = 'content' | 'add/add' | 'modify/delete';

export interface MergeConflict {
  path: string;
  kind: ConflictKind;
  base: Oid | null;
  ours: Oid | null;
  theirs: Oid | null;
  /** Working-tree content, with markers for a content conflict. */
  content: string;
}

export interface TreeMergeResult {
  merged: FlatTree;
  conflicts: MergeConflict[];
  /** Paths that merged cleanly but changed relative to ours — what "Auto-merging" prints. */
  autoMerged: string[];
}

/**
 * Path-wise three-way merge. Where a path changed on only one side that side
 * wins outright; where both changed it, the file contents get a line-level
 * three-way merge, which is the only place conflict markers are produced.
 */
export function mergeTrees(
  repo: Repository,
  baseCommit: Oid | null,
  oursCommit: Oid,
  theirsCommit: Oid,
  oursLabel: string,
  theirsLabel: string,
): TreeMergeResult {
  const base = flatTreeOfCommit(repo, baseCommit);
  const ours = flatTreeOfCommit(repo, oursCommit);
  const theirs = flatTreeOfCommit(repo, theirsCommit);

  const merged: FlatTree = {};
  const conflicts: MergeConflict[] = [];
  const autoMerged: string[] = [];
  const text = (oid: Oid | undefined | null) => (oid ? readBlob(repo, oid).content : '');

  for (const path of new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])) {
    const b = base[path] ?? null;
    const o = ours[path] ?? null;
    const t = theirs[path] ?? null;

    if (o === t) { if (o) merged[path] = o; continue; }          // both sides agree (incl. both deleted)
    if (b === o) { if (t) merged[path] = t; continue; }           // only they changed it
    if (b === t) { if (o) merged[path] = o; continue; }           // only we changed it

    // Both sides changed it, differently.
    if (o === null || t === null) {
      conflicts.push({
        path, kind: 'modify/delete', base: b, ours: o, theirs: t,
        content: text(o ?? t),
      });
      if (o ?? t) merged[path] = (o ?? t)!;
      continue;
    }

    const kind: ConflictKind = b === null ? 'add/add' : 'content';
    const res = mergeContent(text(b), text(o), text(t), oursLabel, theirsLabel);
    const oid = writeObject(repo, { type: 'blob', content: res.content });
    merged[path] = oid;
    if (res.conflicted) {
      conflicts.push({ path, kind, base: b, ours: o, theirs: t, content: res.content });
    } else {
      autoMerged.push(path);
    }
  }

  return { merged, conflicts: conflicts.sort((a, b) => (a.path < b.path ? -1 : 1)), autoMerged: autoMerged.sort() };
}
