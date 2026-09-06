import { register, requireRepo, type CommandSpec } from '../registry';
import { E } from '../errors';
import { hasFlag } from '../parseArgs';
import {
  HEAD, headLabel, headOid, resolveSymbolic, shortenRef, updateRef,
} from '../refs';
import { firstLine, readBlob, readCommit, short, writeObject } from '../objects';
import { revParse } from '../revparse';
import { flatTreeOfCommit, writeFlatTree, writeTreeFromIndex } from '../trees';
import { indexFromFlat, indexFlat, indexRemove, indexSet } from '../gitIndex';
import { hardResetTo, writeFile, deleteFile, worktreeFlat } from '../worktree';
import { revertCommit } from '../merge/apply';
import { mergeTrees } from '../merge/mergeTrees';
import { applyMergeResult, reportMerge } from './merging';
import { signature } from '../clock';
import { requireHead } from './branching';
import type { Repository } from '../types';

const restore: CommandSpec = {
  name: 'restore', summary: 'Throw away changes, or unstage them',
  syntax: 'git restore <file>  |  git restore --staged <file>',
  flags: [
    { long: 'staged', short: 'S', arg: 'none' },
    { long: 'worktree', short: 'W', arg: 'none' },
    { long: 'source', short: 's', arg: 'required' },
  ],
  concepts: ['three-trees', 'undo', 'index'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const staged = args.flags.staged !== undefined;
    const worktree = args.flags.worktree !== undefined || !staged;
    const sourceFlag = (args.flags.source as string[] | undefined)?.[0];
    const source = sourceFlag ? revParse(repo, sourceFlag) : headOid(repo);
    if (!args.positionals.length) throw E.pathspecNotMatch('');

    for (const path of args.positionals) {
      if (staged) {
        // --staged copies HEAD's version back into the index, leaving your file alone.
        const head = flatTreeOfCommit(repo, source);
        if (head[path]) indexSet(repo.index, path, head[path]);
        else indexRemove(repo.index, path);
        out.event({ type: 'file-unstaged', path });
      }
      if (worktree) {
        const from = staged || sourceFlag ? flatTreeOfCommit(repo, source) : indexFlat(repo.index);
        if (from[path] !== undefined) writeFile(repo, path, readBlob(repo, from[path]).content);
        else deleteFile(repo, path);
        out.event({ type: 'file-written', path });
      }
    }
  },
};

const reset: CommandSpec = {
  name: 'reset', summary: 'Move HEAD — and optionally drag the other two trees with it',
  syntax: 'git reset --soft|--mixed|--hard <commit>',
  flags: [
    { long: 'soft', arg: 'none' },
    { long: 'mixed', arg: 'none' },
    { long: 'hard', arg: 'none' },
  ],
  concepts: ['reset-modes', 'three-trees', 'undo', 'ref'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const mode = args.flags.hard !== undefined ? 'hard' : args.flags.soft !== undefined ? 'soft' : 'mixed';
    const head = headOid(repo);

    // `git reset <paths>` is the old spelling of `git restore --staged`.
    const looksLikePaths = args.positionals.length > 0 &&
      args.positionals.every((p) => repo.worktree.files[p] !== undefined || indexFlat(repo.index)[p] !== undefined);
    if (looksLikePaths && !hasFlag(args, 'soft', 'hard', 'mixed')) {
      const headTree = flatTreeOfCommit(repo, head);
      for (const p of args.positionals) {
        if (headTree[p]) indexSet(repo.index, p, headTree[p]);
        else indexRemove(repo.index, p);
        out.event({ type: 'file-unstaged', path: p });
      }
      return;
    }

    const target = args.positionals[0] ? revParse(repo, args.positionals[0]) : requireHead(repo);

    // Three trees, three modes: soft moves HEAD only; mixed also resets the
    // index; hard also resets the working tree.
    updateRef(repo, HEAD, target, `reset: moving to ${args.positionals[0] ?? 'HEAD'}`);
    if (mode === 'mixed') repo.index = indexFromFlat(flatTreeOfCommit(repo, target));
    if (mode === 'hard') hardResetTo(repo, target);
    repo.operation = { kind: 'none' };

    out.event({ type: 'ref-moved', ref: resolveSymbolic(repo, HEAD), from: head, to: target });
    if (mode === 'hard') out.line(`HEAD is now at ${short(target)} ${firstLine(readCommit(repo, target).message)}`);
    else if (mode === 'mixed') {
      const changed = unstagedAfterReset(repo);
      if (changed.length) {
        out.line('Unstaged changes after reset:');
        for (const p of changed) out.line(`M\t${p}`);
      }
    }
  },
};

function unstagedAfterReset(repo: Repository): string[] {
  const idx = indexFlat(repo.index);
  const wt = worktreeFlat(repo);
  return [...new Set([...Object.keys(idx), ...Object.keys(wt)])]
    .filter((p) => idx[p] !== undefined && idx[p] !== wt[p]).sort();
}

const revert: CommandSpec = {
  name: 'revert', summary: 'Undo a commit by adding a new one that reverses it',
  syntax: 'git revert <commit>',
  flags: [{ long: 'no-edit', arg: 'none' }, { long: 'abort', arg: 'none' }, { long: 'continue', arg: 'none' }],
  concepts: ['revert', 'undo', 'shared-history'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);

    if (args.flags.continue !== undefined) {
      if (repo.operation.kind !== 'revert') throw E.noMergeInProgress();
      finishRevert(repo, out as never);
      return;
    }
    if (args.flags.abort !== undefined) {
      if (repo.operation.kind !== 'revert') throw E.noMergeInProgress();
      repo.operation = { kind: 'none' };
      hardResetTo(repo, headOid(repo));
      return;
    }

    const head = requireHead(repo);
    const target = revParse(repo, args.positionals[0] ?? HEAD);
    const c = readCommit(repo, target);
    const message = `Revert "${firstLine(c.message)}"\n\nThis reverts commit ${target}.`;

    const result = revertCommit(repo, head, target, headLabel(repo), `parent of ${short(target)}`);
    applyMergeResult(repo, result);
    if (reportMerge(result, out as never)) {
      repo.operation = { kind: 'revert', reverting: target, message };
      out.line('error: could not revert ' + short(target) + '... ' + firstLine(c.message));
      out.line('hint: after resolving the conflicts, mark them with "git add"');
      out.line('hint: and then run "git revert --continue"');
      out.exit(1);
      return;
    }
    finishRevert(repo, out as never, message);
  },
};

function finishRevert(
  repo: Repository,
  out: { line: (...s: string[]) => void; event: (e: never) => void },
  messageOverride?: string,
): void {
  const message = messageOverride ?? (repo.operation.kind === 'revert' ? repo.operation.message : 'Revert');
  const head = headOid(repo);
  const tree = writeTreeFromIndex(repo);
  const oid = writeObject(repo, {
    type: 'commit', tree, parents: head ? [head] : [],
    author: signature(repo), committer: signature(repo), message,
  });
  updateRef(repo, HEAD, oid, `revert: ${firstLine(message)}`);
  repo.operation = { kind: 'none' };
  out.line(`[${headLabel(repo)} ${short(oid)}] ${firstLine(message)}`);
  (out.event as (e: unknown) => void)({ type: 'commit-created', oid, parents: head ? [head] : [] });
}

const reflog: CommandSpec = {
  name: 'reflog', summary: 'Every place HEAD has been — the safety net',
  syntax: 'git reflog', flags: [{ long: 'all', arg: 'none' }],
  concepts: ['reflog', 'recovery', 'nothing-is-lost'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const which = args.positionals[0] ?? HEAD;
    const ref = which === HEAD ? HEAD : (resolveSymbolic(repo, which) || HEAD);
    const entries = repo.reflogs[ref] ?? repo.reflogs[HEAD] ?? [];
    if (!entries.length) { out.line(`fatal: no reflog for '${shortenRef(ref)}'`); return; }
    entries.forEach((e, i) => {
      out.line(`${short(e.after)} ${shortenRef(ref)}@{${i}}: ${e.message}`);
    });
  },
};

const stash: CommandSpec = {
  name: 'stash', summary: 'Park uncommitted work so you can switch context',
  syntax: 'git stash  |  git stash pop  |  git stash list',
  flags: [{ long: 'include-untracked', short: 'u', arg: 'none' }, { long: 'message', short: 'm', arg: 'required' }],
  concepts: ['stash', 'three-trees'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const sub = args.positionals[0] ?? 'push';

    if (sub === 'list') {
      repo.stash.forEach((s, i) => out.line(`stash@{${i}}: ${s.message}`));
      return;
    }

    if (sub === 'push' || sub === 'save') {
      const head = requireHead(repo);
      const wt = worktreeFlat(repo);
      const idx = indexFlat(repo.index);
      const headTree = flatTreeOfCommit(repo, head);
      const dirty = [...new Set([...Object.keys(wt), ...Object.keys(idx), ...Object.keys(headTree)])]
        .some((p) => headTree[p] !== wt[p] && (idx[p] !== undefined || headTree[p] !== undefined));
      if (!dirty) { out.line('No local changes to save'); return; }

      // A stash entry is a real commit whose tree is the dirty working tree, so
      // popping it can reuse the ordinary three-way merge machinery.
      // Intern the dirty working tree as real blobs, then build a tree from them.
      const tracked: Record<string, string> = {};
      for (const p of Object.keys(wt)) {
        if (idx[p] !== undefined || headTree[p] !== undefined || args.flags['include-untracked'] !== undefined) {
          tracked[p] = writeObject(repo, { type: 'blob', content: repo.worktree.files[p] });
        }
      }
      const tree = writeFlatTree(repo, tracked);
      const branch = headLabel(repo);
      const message = (args.flags.message as string[] | undefined)?.[0]
        ?? `WIP on ${branch}: ${short(head)} ${firstLine(readCommit(repo, head).message)}`;
      const oid = writeObject(repo, {
        type: 'commit', tree, parents: [head],
        author: signature(repo), committer: signature(repo), message,
      });
      repo.stash.unshift({ oid, message });
      hardResetTo(repo, head);
      out.line(`Saved working directory and index state ${message}`);
      out.event({ type: 'stash-pushed', oid });
      return;
    }

    if (sub === 'pop' || sub === 'apply') {
      const which = args.positionals[1];
      const idx = which ? parseInt(which.replace(/\D+/g, ''), 10) : 0;
      const entry = repo.stash[idx];
      if (!entry) throw E.noStash();
      const head = requireHead(repo);

      // Base = the commit the stash was taken on, theirs = the stashed tree.
      // Popping is therefore an ordinary three-way merge, not its own algorithm.
      const stashParent = readCommit(repo, entry.oid).parents[0];
      const merged = mergeTrees(repo, stashParent, head, entry.oid, headLabel(repo), 'stash');
      applyMergeResult(repo, merged);
      if (reportMerge(merged, out as never)) {
        out.line('The stash entry is kept in case you need it again.');
        out.exit(1);
        return;
      }
      if (sub === 'pop') repo.stash.splice(idx, 1);
      out.line(`Dropped ${which ?? 'refs/stash@{0}'} (${entry.oid})`);
      out.event({ type: 'stash-popped', oid: entry.oid });
      return;
    }

    if (sub === 'drop') {
      if (!repo.stash.length) throw E.noStash();
      const dropped = repo.stash.shift()!;
      out.line(`Dropped refs/stash@{0} (${dropped.oid})`);
      return;
    }

    if (sub === 'clear') { repo.stash = []; return; }

    throw E.shell(`error: unknown subcommand: ${sub}`);
  },
};

register(restore, reset, revert, reflog, stash);
