import { register, requireRepo, type CommandSpec } from '../registry';
import { E } from '../errors';
import {
  HEAD, currentBranchRef, headOid, setHeadDetached, updateRef, shortenRef,
} from '../refs';
import { firstLine, readCommit, short, writeObject } from '../objects';
import { commitRange, revParse } from '../revparse';
import { isAncestor, mergeBase } from '../merge/mergeBase';
import { applyCommit } from '../merge/apply';
import { writeFlatTree, writeTreeFromIndex } from '../trees';
import { hasUnmerged } from '../gitIndex';
import { signature } from '../clock';
import { checkoutTree } from '../worktree';
import { abortRebase, runRebase, stepsFrom } from '../sequencer';
import { applyMergeResult, reportMerge } from './merging';
import { requireHead } from './branching';
import type { Oid, RebaseStep } from '../types';

const rebase: CommandSpec = {
  name: 'rebase', summary: 'Replay your commits onto a new base — new commits, new hashes',
  syntax: 'git rebase <branch>',
  flags: [
    { long: 'continue', arg: 'none' },
    { long: 'abort', arg: 'none' },
    { long: 'skip', arg: 'none' },
    { long: 'interactive', short: 'i', arg: 'none' },
    { long: 'autosquash', arg: 'none' },
    { long: 'onto', arg: 'required' },
  ],
  concepts: ['rebase', 'rebase-rewrites-history', 'linear-history', 'conflict-resolution'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);

    if (args.flags.abort !== undefined) { abortRebase(repo, out as never); return; }

    if (args.flags.continue !== undefined) {
      if (repo.operation.kind !== 'rebase') throw E.noRebaseInProgress();
      if (hasUnmerged(repo.index)) throw E.unmergedFiles();
      const op = repo.operation;
      if (op.current) {
        // Commit the resolution, then let the loop carry on with the rest.
        const original = readCommit(repo, op.current.oid);
        const onto = headOid(repo)!;
        const tree = writeTreeFromIndex(repo);
        const oid = writeObject(repo, {
          type: 'commit', tree, parents: [onto],
          author: original.author, committer: signature(repo), message: original.message,
        });
        updateRef(repo, HEAD, oid, `rebase (continue): ${firstLine(original.message)}`);
        op.done.push(oid);
        op.current = null;
        out.event({ type: 'commit-created', oid, parents: [onto] });
      }
      runRebase(repo, out as never);
      return;
    }

    if (args.flags.skip !== undefined) {
      if (repo.operation.kind !== 'rebase') throw E.noRebaseInProgress();
      repo.operation.current = null;
      runRebase(repo, out as never);
      return;
    }

    if (repo.operation.kind === 'rebase') throw E.rebaseInProgress();

    const head = requireHead(repo);
    const upstreamName = args.positionals[0];
    if (!upstreamName) throw E.unknownRevision('');
    const upstream = revParse(repo, upstreamName);
    const ontoFlag = (args.flags.onto as string[] | undefined)?.[0];
    const onto = ontoFlag ? revParse(repo, ontoFlag) : upstream;

    if (isAncestor(repo, head, onto)) {
      // Nothing of ours to replay; git fast-forwards instead.
      updateRef(repo, HEAD, onto, `rebase: fast-forward to ${upstreamName}`);
      checkoutTree(repo, head, onto, { force: true });
      out.line(`Successfully rebased and updated ${shortenRef(currentBranchRef(repo) ?? HEAD)}.`);
      return;
    }
    // An interactive or autosquash rebase rewrites the todo list even when the
    // branch is already based on `onto`, so it must not short-circuit here.
    const interactive = args.flags.interactive !== undefined || args.flags.autosquash !== undefined;
    if (isAncestor(repo, onto, head) && !ontoFlag && !interactive) {
      out.line('Current branch is up to date.');
      return;
    }

    const base = mergeBase(repo, head, upstream);
    const picks = commitRange(repo, base, head).filter((c) => c !== onto);
    let todo: RebaseStep[] = stepsFrom(repo, picks);
    if (args.flags.autosquash !== undefined) todo = autosquashSteps(todo);

    repo.operation = {
      kind: 'rebase', onto, origHead: head, origBranch: currentBranchRef(repo),
      todo, done: [], current: null,
    };
    setHeadDetached(repo, onto, `rebase: checkout ${ontoFlag ?? upstreamName}`);
    out.event({ type: 'rebase-started', count: todo.length });
    runRebase(repo, out as never);
  },
};

const cherryPick: CommandSpec = {
  name: 'cherry-pick', summary: 'Copy one commit’s change onto the current branch',
  syntax: 'git cherry-pick <commit>',
  flags: [{ long: 'continue', arg: 'none' }, { long: 'abort', arg: 'none' }],
  concepts: ['cherry-pick', 'rebase-rewrites-history'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);

    if (args.flags.abort !== undefined) {
      if (repo.operation.kind !== 'cherry-pick') throw E.noMergeInProgress();
      repo.operation = { kind: 'none' };
      return;
    }

    const pending: Oid[] = args.flags.continue !== undefined
      ? (repo.operation.kind === 'cherry-pick' ? [repo.operation.picking, ...repo.operation.remaining] : [])
      : args.positionals.map((p) => revParse(repo, p));
    if (!pending.length) throw E.unknownRevision(args.positionals[0] ?? '');

    const continuing = args.flags.continue !== undefined;
    for (let i = 0; i < pending.length; i++) {
      const pick = pending[i];
      const onto = requireHead(repo);
      const original = readCommit(repo, pick);

      if (continuing && i === 0) {
        // The conflict was resolved by hand; just record it.
        const tree = writeTreeFromIndex(repo);
        const oid = writeObject(repo, {
          type: 'commit', tree, parents: [onto],
          author: original.author, committer: signature(repo), message: original.message,
        });
        updateRef(repo, HEAD, oid, `cherry-pick: ${firstLine(original.message)}`);
        repo.operation = { kind: 'none' };
        out.line(`[${shortenRef(currentBranchRef(repo) ?? HEAD)} ${short(oid)}] ${firstLine(original.message)}`);
        out.event({ type: 'commit-created', oid, parents: [onto] });
        continue;
      }

      const result = applyCommit(repo, onto, pick, 'HEAD', firstLine(original.message));
      applyMergeResult(repo, result);
      if (reportMerge(result, out as never)) {
        repo.operation = { kind: 'cherry-pick', picking: pick, remaining: pending.slice(i + 1) };
        out.line(
          `error: could not apply ${short(pick)}... ${firstLine(original.message)}`,
          'hint: After resolving the conflicts, mark them with',
          'hint: "git add/rm <pathspec>", then run "git cherry-pick --continue".',
        );
        out.exit(1);
        return;
      }

      const tree = writeFlatTree(repo, result.merged);
      // Same change, same author, different parent — therefore a different id.
      const oid = writeObject(repo, {
        type: 'commit', tree, parents: [onto],
        author: original.author, committer: signature(repo), message: original.message,
      });
      updateRef(repo, HEAD, oid, `cherry-pick: ${firstLine(original.message)}`);
      out.line(`[${shortenRef(currentBranchRef(repo) ?? HEAD)} ${short(oid)}] ${firstLine(original.message)}`);
      out.event({ type: 'commit-created', oid, parents: [onto] });
    }
    repo.operation = { kind: 'none' };
  },
};

/**
 * Git's autosquash: a commit whose subject is `fixup! <subject>` (or
 * `squash! <subject>`) is moved to sit directly after the commit it names, and
 * its action changes so the rebase folds it in. `fixup` discards the message;
 * `squash` keeps it.
 */
export function autosquashSteps(steps: RebaseStep[]): RebaseStep[] {
  const isFixup = (s: RebaseStep) => /^(fixup|squash)! /.test(s.label);
  const fixups = steps.filter(isFixup);
  if (!fixups.length) return steps;

  const out: RebaseStep[] = [];
  const used = new Set<RebaseStep>();
  for (const base of steps.filter((s) => !isFixup(s))) {
    out.push(base);
    for (const f of fixups) {
      const m = f.label.match(/^(fixup|squash)! (.+)$/);
      if (m && m[2] === base.label) {
        out.push({ ...f, action: m[1] === 'squash' ? 'squash' : 'fixup' });
        used.add(f);
      }
    }
  }
  // A fixup whose target is not in the range is left where it was, as git does.
  for (const f of fixups) if (!used.has(f)) out.push(f);
  return out;
}

register(rebase, cherryPick);
