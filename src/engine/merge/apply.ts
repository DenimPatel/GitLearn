import { readCommit } from '../objects';
import { mergeTrees, type TreeMergeResult } from './mergeTrees';
import type { Oid, Repository } from '../types';

/**
 * The single primitive behind cherry-pick, revert and rebase: replay the change
 * a commit introduced on top of a different commit, as a three-way merge whose
 * base is the picked commit's own parent.
 */
export function applyCommit(
  repo: Repository, onto: Oid, pick: Oid, ontoLabel: string, pickLabel: string,
): TreeMergeResult {
  const parent = readCommit(repo, pick).parents[0] ?? null;
  return mergeTrees(repo, parent, onto, pick, ontoLabel, pickLabel);
}

/** `git revert` is the same operation with base and theirs swapped: take the
 *  commit's parent as the incoming side, so its change is undone. */
export function revertCommit(
  repo: Repository, onto: Oid, target: Oid, ontoLabel: string, targetLabel: string,
): TreeMergeResult {
  const parent = readCommit(repo, target).parents[0] ?? null;
  return mergeTreesForRevert(repo, target, onto, parent, ontoLabel, targetLabel);
}

function mergeTreesForRevert(
  repo: Repository, base: Oid, ours: Oid, theirs: Oid | null, oursLabel: string, theirsLabel: string,
): TreeMergeResult {
  if (theirs === null) {
    // Reverting a root commit means removing everything it introduced.
    return mergeTrees(repo, base, ours, base, oursLabel, theirsLabel);
  }
  return mergeTrees(repo, base, ours, theirs, oursLabel, theirsLabel);
}
