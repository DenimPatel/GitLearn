import { E } from './errors';
import { HEAD, headOid, setHeadDetached, setHeadToBranch, updateRef } from './refs';
import { firstLine, readCommit, short, writeObject } from './objects';
import { applyCommit } from './merge/apply';
import { writeFlatTree } from './trees';
import { hardResetTo } from './worktree';
import { signature } from './clock';
import { applyMergeResult, reportMerge } from './commands/merging';
import type { Oid, RebaseStep, Repository } from './types';

export interface SequencerOut {
  line: (...s: string[]) => void;
  event: (e: never) => void;
  exit: (code: number) => void;
}

/**
 * Replays the pending rebase steps one at a time.
 *
 * Stops at the first conflict, leaving `operation` populated so
 * `--continue`, `--skip` and `--abort` all have something to resume from.
 * Cherry-pick and revert use this same loop, which is why "conflict, resolve,
 * continue" behaves identically across all three.
 */
export function runRebase(repo: Repository, out: SequencerOut): void {
  if (repo.operation.kind !== 'rebase') throw E.noRebaseInProgress();

  while (repo.operation.kind === 'rebase' && repo.operation.todo.length) {
    const op = repo.operation;
    const step = op.todo[0];

    if (step.action === 'drop') { op.todo.shift(); continue; }

    const onto = headOid(repo)!;
    const result = applyCommit(repo, onto, step.oid, 'HEAD', step.label);
    applyMergeResult(repo, result);

    if (result.conflicts.length) {
      op.current = step;
      op.todo.shift();
      reportMerge(result, out as never);
      out.line(
        `error: could not apply ${short(step.oid)}... ${step.label}`,
        'hint: Resolve all conflicts manually, mark them as resolved with',
        'hint: "git add/rm <conflicted_files>", then run "git rebase --continue".',
        'hint: You can instead skip this commit: run "git rebase --skip".',
      );
      out.exit(1);
      return;
    }

    const original = readCommit(repo, step.oid);
    if (step.action === 'squash' && op.done.length) {
      // Fold into the previous commit rather than adding a new one.
      const prev = readCommit(repo, headOid(repo)!);
      const tree = writeFlatTree(repo, result.merged);
      const oid = writeObject(repo, {
        type: 'commit', tree, parents: prev.parents,
        author: prev.author, committer: signature(repo),
        message: `${prev.message}\n\n${original.message}`,
      });
      updateRef(repo, HEAD, oid, `rebase (squash): ${firstLine(original.message)}`);
      op.done[op.done.length - 1] = oid;
    } else {
      const tree = writeFlatTree(repo, result.merged);
      // Same change, same author, new committer and new parent — so a new hash.
      // That "new hash" is the whole point of the rebase lesson.
      const oid = writeObject(repo, {
        type: 'commit', tree, parents: [onto],
        author: original.author, committer: signature(repo), message: original.message,
      });
      updateRef(repo, HEAD, oid, `rebase (pick): ${firstLine(original.message)}`);
      op.done.push(oid);
      out.event({ type: 'commit-created', oid, parents: [onto] } as never);
    }

    op.todo.shift();
    op.current = null;
  }

  finishRebase(repo, out);
}

export function finishRebase(repo: Repository, out: SequencerOut): void {
  if (repo.operation.kind !== 'rebase') return;
  const op = repo.operation;
  const tip = headOid(repo)!;
  if (op.origBranch) {
    // Point the original branch at the replayed tip and re-attach HEAD to it.
    repo.refs[op.origBranch] = { kind: 'direct', target: tip };
    setHeadToBranch(repo, op.origBranch, `rebase finished: returning to ${op.origBranch}`);
    out.line(`Successfully rebased and updated ${op.origBranch}.`);
  } else {
    out.line('Successfully rebased.');
  }
  repo.operation = { kind: 'none' };
  out.event({ type: 'rebase-finished' } as never);
}

export function abortRebase(repo: Repository, out: SequencerOut): void {
  if (repo.operation.kind !== 'rebase') throw E.noRebaseInProgress();
  const op = repo.operation;
  if (op.origBranch) {
    repo.refs[op.origBranch] = { kind: 'direct', target: op.origHead };
    setHeadToBranch(repo, op.origBranch, 'rebase: aborting');
  } else {
    setHeadDetached(repo, op.origHead, 'rebase: aborting');
  }
  repo.operation = { kind: 'none' };
  hardResetTo(repo, op.origHead);
  void out;
}

export const stepsFrom = (repo: Repository, oids: Oid[]): RebaseStep[] =>
  oids.map((oid) => ({ action: 'pick' as const, oid, label: firstLine(readCommit(repo, oid).message) }));

