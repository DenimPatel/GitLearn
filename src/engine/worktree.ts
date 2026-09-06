import { hashObject, readBlob, writeObject } from './objects';
import { indexFromFlat, indexFlat } from './gitIndex';
import { flatTreeOfCommit, type FlatTree } from './trees';
import { isIgnored, parseIgnore } from './ignore';
import { E } from './errors';
import type { Oid, Repository } from './types';

export function writeFile(repo: Repository, path: string, content: string): void {
  repo.worktree.files[path] = content;
}

export function deleteFile(repo: Repository, path: string): void {
  delete repo.worktree.files[path];
}

export const readFile = (repo: Repository, path: string): string | undefined =>
  repo.worktree.files[path];

export const worktreePaths = (repo: Repository): string[] =>
  Object.keys(repo.worktree.files).sort();

export function ignorePatterns(repo: Repository): string[] {
  return parseIgnore(repo.worktree.files['.gitignore']);
}

export const ignored = (repo: Repository, path: string): boolean =>
  path !== '.gitignore' && isIgnored(path, ignorePatterns(repo));

/** Hashes a working-tree file into the object database and returns its oid. */
export function blobFromWorktree(repo: Repository, path: string): Oid {
  return writeObject(repo, { type: 'blob', content: repo.worktree.files[path] ?? '' });
}

/** The working tree as path -> oid, for comparison against a tree or the index.
 *  Hashes without storing: this runs on read-only queries like `git status`,
 *  which must never mutate the object database. */
export function worktreeFlat(repo: Repository): FlatTree {
  const out: FlatTree = {};
  for (const [path, content] of Object.entries(repo.worktree.files)) {
    out[path] = hashObject({ type: 'blob', content });
  }
  return out;
}

/** Paths whose working-tree content differs from the index. */
export function dirtyPaths(repo: Repository): string[] {
  const idx = indexFlat(repo.index);
  const wt = worktreeFlat(repo);
  const paths = new Set([...Object.keys(idx), ...Object.keys(wt)]);
  return [...paths].filter((p) => idx[p] !== wt[p]).sort();
}

/**
 * Moves the working tree and index from one commit to another.
 *
 * This is the single implementation of "change which snapshot is checked out",
 * shared by checkout, switch, reset --hard, fast-forward merge, stash and rebase —
 * so branch switching, resetting and rebasing can never disagree about it.
 *
 * Git's rule, which we follow: uncommitted changes are carried across, unless a
 * path that differs between the two commits also has local modifications, in
 * which case the operation is refused rather than losing work.
 */
export function checkoutTree(
  repo: Repository,
  from: Oid | null,
  to: Oid | null,
  opts: { force?: boolean; verb?: string } = {},
): void {
  const fromFlat = flatTreeOfCommit(repo, from);
  const toFlat = flatTreeOfCommit(repo, to);
  const idx = indexFlat(repo.index);
  const wt = worktreeFlat(repo);

  if (!opts.force) {
    const blocked: string[] = [];
    const paths = new Set([...Object.keys(fromFlat), ...Object.keys(toFlat)]);
    for (const p of paths) {
      if (fromFlat[p] === toFlat[p]) continue; // unchanged between the two trees
      const locallyModified = (wt[p] ?? null) !== (idx[p] ?? null);
      if (locallyModified) blocked.push(p);
    }
    if (blocked.length) throw E.localChangesOverwritten(blocked.sort(), opts.verb ?? 'checkout');
  }

  // Remove files the old commit had and the new one does not, then materialize the new tree.
  for (const p of Object.keys(fromFlat)) {
    if (!(p in toFlat) && wt[p] === fromFlat[p]) deleteFile(repo, p);
  }
  for (const [p, oid] of Object.entries(toFlat)) {
    if (opts.force || wt[p] === undefined || wt[p] === (fromFlat[p] ?? idx[p]) || wt[p] === idx[p]) {
      writeFile(repo, p, readBlob(repo, oid).content);
    }
  }
  repo.index = indexFromFlat(toFlat);
}

/** Discards everything and makes the working tree and index match a commit exactly. */
export function hardResetTo(repo: Repository, to: Oid | null): void {
  const toFlat = flatTreeOfCommit(repo, to);
  const tracked = new Set(Object.keys(indexFlat(repo.index)));
  for (const p of Object.keys(repo.worktree.files)) {
    if (tracked.has(p) && !(p in toFlat)) deleteFile(repo, p);
  }
  for (const [p, oid] of Object.entries(toFlat)) writeFile(repo, p, readBlob(repo, oid).content);
  repo.index = indexFromFlat(toFlat);
}
