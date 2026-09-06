import { register, requireRepo, type CommandSpec } from '../registry';
import { E } from '../errors';
import { HEAD, currentBranchName, headOid, resolveSymbolic, updateRef } from '../refs';
import { readBlob, short, writeObject } from '../objects';
import { revParse, resolveRefName } from '../revparse';
import { isAncestor, mergeBase } from '../merge/mergeBase';
import { mergeTrees, type TreeMergeResult } from '../merge/mergeTrees';
import { checkoutTree, hardResetTo, writeFile } from '../worktree';
import { indexFromFlat, indexSetStage } from '../gitIndex';
import { writeFlatTree } from '../trees';
import { signature } from '../clock';
import { requireHead } from './branching';
import type { Repository } from '../types';

/**
 * Writes a merge result into the index and working tree.
 * Conflicted paths get stages 1/2/3 and no stage 0 — which is precisely why
 * `git commit` refuses until `git add` collapses them back to stage 0.
 */
export function applyMergeResult(repo: Repository, result: TreeMergeResult): void {
  repo.index = indexFromFlat(result.merged);
  for (const [path, oid] of Object.entries(result.merged)) {
    writeFile(repo, path, readBlob(repo, oid).content);
  }
  for (const c of result.conflicts) {
    writeFile(repo, c.path, c.content);
    repo.index.entries = repo.index.entries.filter((e) => e.path !== c.path);
    if (c.base) indexSetStage(repo.index, c.path, c.base, 1);
    if (c.ours) indexSetStage(repo.index, c.path, c.ours, 2);
    if (c.theirs) indexSetStage(repo.index, c.path, c.theirs, 3);
  }
}

export function reportMerge(
  result: TreeMergeResult,
  out: { line: (...s: string[]) => void; event: (e: never) => void },
): boolean {
  for (const p of result.autoMerged) out.line(`Auto-merging ${p}`);
  for (const c of result.conflicts) {
    out.line(`CONFLICT (${c.kind}): Merge conflict in ${c.path}`);
  }
  if (result.conflicts.length) {
    (out.event as (e: unknown) => void)({ type: 'conflict', paths: result.conflicts.map((c) => c.path) });
    return true;
  }
  return false;
}

const merge: CommandSpec = {
  name: 'merge', summary: 'Join another branch’s history into this one',
  syntax: 'git merge <branch>',
  flags: [
    { long: 'no-ff', arg: 'none' },
    { long: 'ff-only', arg: 'none' },
    { long: 'abort', arg: 'none' },
    { long: 'continue', arg: 'none' },
    { long: 'message', short: 'm', arg: 'required' },
    { long: 'squash', arg: 'none' },
  ],
  concepts: ['merge', 'merge-base', 'fast-forward', 'three-way-merge', 'conflict-resolution'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);

    if (args.flags.abort !== undefined) {
      if (repo.operation.kind !== 'merge') throw E.noMergeInProgress();
      repo.operation = { kind: 'none' };
      hardResetTo(repo, headOid(repo));
      return;
    }
    if (repo.operation.kind === 'merge') throw E.mergeInProgress('merge');

    const name = args.positionals[0];
    if (!name) throw E.notSomethingWeCanMerge('');
    if (!resolveRefName(repo, name) && !/^[0-9a-f]{4,40}$/.test(name)) {
      throw E.notSomethingWeCanMerge(name);
    }
    const theirs = revParse(repo, name);
    const ours = requireHead(repo);

    if (isAncestor(repo, theirs, ours)) { out.line('Already up to date.'); return; }

    // Fast-forward: our branch has no commits of its own, so the label just slides.
    if (isAncestor(repo, ours, theirs) && args.flags['no-ff'] === undefined) {
      out.line(`Updating ${short(ours)}..${short(theirs)}`, 'Fast-forward');
      checkoutTree(repo, ours, theirs, { force: true });
      updateRef(repo, HEAD, theirs, `merge ${name}: Fast-forward`);
      out.event({ type: 'merged', strategy: 'fast-forward', from: name });
      out.event({ type: 'ref-moved', ref: resolveSymbolic(repo, HEAD), from: ours, to: theirs });
      return;
    }
    if (args.flags['ff-only'] !== undefined) {
      throw E.notSomethingWeCanMerge(name);
    }

    const base = mergeBase(repo, ours, theirs);
    const oursLabel = 'HEAD';
    const message = (args.flags.message as string[] | undefined)?.[0]
      ?? `Merge branch '${name}' into ${currentBranchName(repo) ?? 'HEAD'}`;
    const result = mergeTrees(repo, base, ours, theirs, oursLabel, name);
    applyMergeResult(repo, result);

    if (reportMerge(result, out as never)) {
      repo.operation = { kind: 'merge', theirs, theirsLabel: name, base, message };
      out.line('Automatic merge failed; fix conflicts and then commit the result.');
      out.exit(1);
      return;
    }

    if (args.flags.squash !== undefined) {
      out.line('Squash commit -- not updating HEAD');
      return;
    }

    const tree = writeFlatTree(repo, result.merged);
    const oid = writeObject(repo, {
      type: 'commit', tree, parents: [ours, theirs],
      author: signature(repo), committer: signature(repo), message,
    });
    updateRef(repo, HEAD, oid, `merge ${name}`);
    out.line(`Merge made by the 'ort' strategy.`);
    out.event({ type: 'merged', strategy: 'three-way', from: name });
    out.event({ type: 'commit-created', oid, parents: [ours, theirs] });
  },
};

register(merge);
