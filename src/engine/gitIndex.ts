import type { Index, IndexEntry, Oid, Stage } from './types';
import type { FlatTree } from './trees';

export const emptyIndex = (): Index => ({ entries: [] });

const sortEntries = (entries: IndexEntry[]) =>
  entries.sort((a, b) => (a.path === b.path ? a.stage - b.stage : a.path < b.path ? -1 : 1));

export function indexGet(index: Index, path: string, stage: Stage = 0): IndexEntry | undefined {
  return index.entries.find((e) => e.path === path && e.stage === stage);
}

export function indexPaths(index: Index): string[] {
  return [...new Set(index.entries.map((e) => e.path))].sort();
}

/** Stage-0 view of the index, as path -> oid. */
export function indexFlat(index: Index): FlatTree {
  const out: FlatTree = {};
  for (const e of index.entries) if (e.stage === 0) out[e.path] = e.oid;
  return out;
}

/** Writes a resolved (stage 0) entry, dropping any conflict stages for that path.
 *  This is what makes `git add <path>` the way you resolve a conflict. */
export function indexSet(index: Index, path: string, oid: Oid): void {
  index.entries = index.entries.filter((e) => e.path !== path);
  index.entries.push({ path, oid, mode: '100644', stage: 0 });
  sortEntries(index.entries);
}

export function indexSetStage(index: Index, path: string, oid: Oid, stage: Stage): void {
  index.entries = index.entries.filter((e) => !(e.path === path && e.stage === stage));
  index.entries.push({ path, oid, mode: '100644', stage });
  sortEntries(index.entries);
}

export function indexRemove(index: Index, path: string): void {
  index.entries = index.entries.filter((e) => e.path !== path);
}

export function hasUnmerged(index: Index): boolean {
  return index.entries.some((e) => e.stage !== 0);
}

export function unmergedPaths(index: Index): string[] {
  return [...new Set(index.entries.filter((e) => e.stage !== 0).map((e) => e.path))].sort();
}

/** Replaces the whole index with a tree's contents, all at stage 0. */
export function indexFromFlat(flat: FlatTree): Index {
  const entries: IndexEntry[] = Object.entries(flat).map(([path, oid]) => ({
    path, oid, mode: '100644' as const, stage: 0 as Stage,
  }));
  sortEntries(entries);
  return { entries };
}
