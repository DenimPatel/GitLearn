import { indexFlat, unmergedPaths } from './gitIndex';
import { flatTreeOfCommit } from './trees';
import { headOid, currentBranchName, isDetached, currentBranchRef, shortenRef } from './refs';
import { ignored, worktreeFlat } from './worktree';
import { mergeBase } from './merge/mergeBase';
import { walkHistory } from './refs';
import type { Repository } from './types';
import { short } from './objects';

export type FileState =
  | 'untracked' | 'ignored'
  | 'staged-new' | 'staged-modified' | 'staged-deleted'
  | 'modified' | 'deleted'
  | 'unmerged'
  | 'clean';

export interface StatusReport {
  branch: string | null;
  detachedAt: string | null;
  unborn: boolean;
  staged: { path: string; state: FileState }[];
  unstaged: { path: string; state: FileState }[];
  untracked: string[];
  unmerged: string[];
  ahead: number;
  behind: number;
  upstream: string | null;
  clean: boolean;
}

/**
 * The tri-comparison that the entire three-trees model rests on:
 * HEAD tree vs index gives you "staged", index vs working tree gives you
 * "not staged". Every other status distinction falls out of those two.
 */
export function status(repo: Repository): StatusReport {
  const head = headOid(repo);
  const headTree = flatTreeOfCommit(repo, head);
  const idx = indexFlat(repo.index);
  const wt = worktreeFlat(repo);
  const unmerged = unmergedPaths(repo.index);
  const unmergedSet = new Set(unmerged);

  const staged: { path: string; state: FileState }[] = [];
  for (const p of new Set([...Object.keys(headTree), ...Object.keys(idx)])) {
    if (unmergedSet.has(p)) continue;
    if (headTree[p] === idx[p]) continue;
    if (!(p in headTree)) staged.push({ path: p, state: 'staged-new' });
    else if (!(p in idx)) staged.push({ path: p, state: 'staged-deleted' });
    else staged.push({ path: p, state: 'staged-modified' });
  }

  const unstaged: { path: string; state: FileState }[] = [];
  const untracked: string[] = [];
  for (const p of new Set([...Object.keys(idx), ...Object.keys(wt)])) {
    if (unmergedSet.has(p)) continue;
    if (!(p in idx)) {
      if (!ignored(repo, p)) untracked.push(p);
      continue;
    }
    if (idx[p] === wt[p]) continue;
    unstaged.push({ path: p, state: p in wt ? 'modified' : 'deleted' });
  }

  const upstreamRef = currentBranchRef(repo) ? repo.upstream[currentBranchRef(repo)!] : undefined;
  let ahead = 0, behind = 0;
  if (upstreamRef) {
    const up = repo.refs[upstreamRef];
    const upOid = up && up.kind === 'direct' ? up.target : null;
    if (upOid && head) {
      const base = mergeBase(repo, head, upOid);
      const ours = new Set(walkHistory(repo, [head]));
      const theirs = new Set(walkHistory(repo, [upOid]));
      const baseSet = new Set(base ? walkHistory(repo, [base]) : []);
      ahead = [...ours].filter((c) => !theirs.has(c) && !baseSet.has(c)).length;
      behind = [...theirs].filter((c) => !ours.has(c) && !baseSet.has(c)).length;
    } else if (upOid && !head) {
      behind = walkHistory(repo, [upOid]).length;
    } else if (head) {
      ahead = walkHistory(repo, [head]).length;
    }
  }

  return {
    branch: currentBranchName(repo),
    detachedAt: isDetached(repo) && head ? short(head) : null,
    unborn: !head,
    staged: staged.sort(byPath),
    unstaged: unstaged.sort(byPath),
    untracked: untracked.sort(),
    unmerged,
    ahead,
    behind,
    upstream: upstreamRef ? shortenRef(upstreamRef) : null,
    clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0 && unmerged.length === 0,
  };
}

const byPath = (a: { path: string }, b: { path: string }) => (a.path < b.path ? -1 : 1);

const label: Record<string, string> = {
  'staged-new': 'new file:',
  'staged-modified': 'modified:',
  'staged-deleted': 'deleted:',
  modified: 'modified:',
  deleted: 'deleted:',
};

/** Renders the report the way `git status` prints it. */
export function renderStatus(repo: Repository): string[] {
  const s = status(repo);
  const out: string[] = [];

  if (s.detachedAt) out.push(`HEAD detached at ${s.detachedAt}`);
  else out.push(`On branch ${s.branch}`);

  if (s.upstream) {
    if (s.ahead && s.behind) {
      out.push(`Your branch and '${s.upstream}' have diverged,`);
      out.push(`and have ${s.ahead} and ${s.behind} different commits each, respectively.`);
    } else if (s.ahead) {
      out.push(`Your branch is ahead of '${s.upstream}' by ${s.ahead} commit${s.ahead === 1 ? '' : 's'}.`);
    } else if (s.behind) {
      out.push(`Your branch is behind '${s.upstream}' by ${s.behind} commit${s.behind === 1 ? '' : 's'}, and can be fast-forwarded.`);
    } else {
      out.push(`Your branch is up to date with '${s.upstream}'.`);
    }
  }

  if (s.unborn) out.push('', 'No commits yet');
  if (repo.operation.kind === 'merge') {
    out.push('', s.unmerged.length ? 'You have unmerged paths.' : 'All conflicts fixed but you are still merging.');
    out.push(s.unmerged.length
      ? '  (fix conflicts and run "git commit")'
      : '  (use "git commit" to conclude merge)');
  }
  if (repo.operation.kind === 'rebase') {
    const op = repo.operation;
    out.push('', `interactive rebase in progress; onto ${short(op.onto)}`);
  }

  if (s.unmerged.length) {
    out.push('', 'Unmerged paths:', '  (use "git add <file>..." to mark resolution)');
    for (const p of s.unmerged) out.push(`\tboth modified:   ${p}`);
  }

  if (s.staged.length) {
    out.push('', 'Changes to be committed:');
    out.push('  (use "git restore --staged <file>..." to unstage)');
    for (const f of s.staged) out.push(`\t${(label[f.state] ?? '').padEnd(12)} ${f.path}`);
  }

  if (s.unstaged.length) {
    out.push('', 'Changes not staged for commit:');
    out.push('  (use "git add <file>..." to update what will be committed)');
    out.push('  (use "git restore <file>..." to discard changes in working directory)');
    for (const f of s.unstaged) out.push(`\t${(label[f.state] ?? '').padEnd(12)} ${f.path}`);
  }

  if (s.untracked.length) {
    out.push('', 'Untracked files:');
    out.push('  (use "git add <file>..." to include in what will be committed)');
    for (const p of s.untracked) out.push(`\t${p}`);
  }

  if (s.clean) {
    out.push('', s.unborn ? 'nothing to commit (create/copy files and use "git add" to track)' : 'nothing to commit, working tree clean');
  } else if (!s.staged.length && !s.unmerged.length) {
    out.push('', s.untracked.length && !s.unstaged.length
      ? 'nothing added to commit but untracked files present (use "git add" to track)'
      : 'no changes added to commit (use "git add" and/or "git commit -a")');
  }

  return out;
}
