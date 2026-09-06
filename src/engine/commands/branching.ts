import { register, requireRepo, type CommandSpec } from '../registry';
import { E, GitError } from '../errors';
import { hasFlag } from '../parseArgs';
import {
  HEAD, branchRef, currentBranchName, currentBranchRef, deleteRef, headOid,
  listBranches, remotesPrefix, resolveRefToOid, setHeadDetached, setHeadToBranch,
  shortenRef, tagRef, listTags,
} from '../refs';
import { firstLine, readCommit, short, writeObject } from '../objects';
import { isValidBranchName, revParse, tryRevParse } from '../revparse';
import { isAncestor } from '../merge/mergeBase';
import { checkoutTree } from '../worktree';
import { signature } from '../clock';
import type { Oid, Repository } from '../types';

function requireHead(repo: Repository): Oid {
  const oid = headOid(repo);
  if (!oid) throw E.noCommitsYet();
  return oid;
}

const branch: CommandSpec = {
  name: 'branch', summary: 'List, create or delete branches — a branch is just a movable label',
  syntax: 'git branch <name>',
  flags: [
    { long: 'delete', short: 'd', arg: 'none' },
    { long: 'force-delete', short: 'D', arg: 'none' },
    { long: 'all', short: 'a', arg: 'none' },
    { long: 'move', short: 'm', arg: 'none' },
    { long: 'verbose', short: 'v', arg: 'none' },
  ],
  concepts: ['branch', 'ref', 'dag'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const [first, second] = args.positionals;

    if (hasFlag(args, 'delete', 'force-delete')) {
      const name = first;
      const ref = branchRef(name);
      if (!repo.refs[ref]) throw E.branchNotFound(name);
      if (currentBranchRef(repo) === ref) throw E.cannotDeleteCurrent(name);
      const tip = resolveRefToOid(repo, ref)!;
      const head = headOid(repo);
      if (args.flags['force-delete'] === undefined && head && !isAncestor(repo, tip, head)) {
        throw E.notFullyMerged(name);
      }
      deleteRef(repo, ref);
      out.line(`Deleted branch ${name} (was ${short(tip)}).`);
      out.event({ type: 'ref-deleted', ref });
      return;
    }

    if (args.flags.move !== undefined) {
      const from = second ? first : currentBranchName(repo);
      const to = second ?? first;
      if (!from) throw E.branchNotFound('HEAD');
      const oid = resolveRefToOid(repo, branchRef(from));
      if (!oid) throw E.branchNotFound(from);
      if (repo.refs[branchRef(to)]) throw E.branchExists(to);
      deleteRef(repo, branchRef(from));
      repo.refs[branchRef(to)] = { kind: 'direct', target: oid };
      if (currentBranchRef(repo) === branchRef(from)) setHeadToBranch(repo, branchRef(to), `branch: renamed to ${to}`);
      return;
    }

    if (!first) {
      const showRemote = args.flags.all !== undefined;
      const current = currentBranchName(repo);
      for (const b of listBranches(repo)) {
        out.line(`${b.short === current ? '* ' : '  '}${b.short}`);
      }
      if (showRemote) {
        for (const [name, ref] of Object.entries(repo.refs)) {
          if (name.startsWith(remotesPrefix) && ref.kind === 'direct') {
            out.line(`  remotes/${shortenRef(name)}`);
          }
        }
      }
      return;
    }

    if (!isValidBranchName(first)) throw E.invalidRefName(first);
    if (repo.refs[branchRef(first)]) throw E.branchExists(first);
    const at = second ? revParse(repo, second) : requireHead(repo);
    repo.refs[branchRef(first)] = { kind: 'direct', target: at };
    repo.reflogs[branchRef(first)] = [{
      before: null, after: at, who: signature(repo), message: `branch: Created from ${second ?? 'HEAD'}`,
    }];
    out.event({ type: 'ref-created', ref: branchRef(first), at });
  },
};

/** Shared by `switch` and `checkout`: move HEAD, and bring the working tree with it. */
function doCheckout(
  repo: Repository, target: string, opts: { create?: string; detach?: boolean; force?: boolean },
  out: { line: (...s: string[]) => void; event: (e: never) => void },
): void {
  const from = headOid(repo);

  if (opts.create) {
    if (!isValidBranchName(opts.create)) throw E.invalidRefName(opts.create);
    if (repo.refs[branchRef(opts.create)]) throw E.branchExists(opts.create);
    const at = target ? revParse(repo, target) : requireHead(repo);
    repo.refs[branchRef(opts.create)] = { kind: 'direct', target: at };
    repo.reflogs[branchRef(opts.create)] = [{
      before: null, after: at, who: signature(repo), message: 'branch: Created from HEAD',
    }];
    checkoutTree(repo, from, at, { force: opts.force, verb: 'checkout' });
    setHeadToBranch(repo, branchRef(opts.create), `checkout: moving from ${labelOf(repo, from)} to ${opts.create}`);
    (out.event as (e: unknown) => void)({ type: 'ref-created', ref: branchRef(opts.create), at });
    (out.event as (e: unknown) => void)({ type: 'head-moved', to: opts.create, detached: false });
    out.line(`Switched to a new branch '${opts.create}'`);
    return;
  }

  const branchTarget = repo.refs[branchRef(target)] ? branchRef(target) : null;
  if (branchTarget && !opts.detach) {
    const to = resolveRefToOid(repo, branchTarget)!;
    checkoutTree(repo, from, to, { force: opts.force, verb: 'checkout' });
    setHeadToBranch(repo, branchTarget, `checkout: moving from ${labelOf(repo, from)} to ${target}`);
    (out.event as (e: unknown) => void)({ type: 'head-moved', to: target, detached: false });
    out.line(`Switched to branch '${target}'`);
    return;
  }

  // Anything else resolves to a commit, and checking out a commit detaches HEAD.
  const to = revParse(repo, target);
  checkoutTree(repo, from, to, { force: opts.force, verb: 'checkout' });
  setHeadDetached(repo, to, `checkout: moving from ${labelOf(repo, from)} to ${target}`);
  (out.event as (e: unknown) => void)({ type: 'head-moved', to: short(to), detached: true });
  out.line(
    'Note: switching to ' + `'${target}'.`,
    '',
    'You are in \'detached HEAD\' state. You can look around, make experimental',
    'changes and commit them, and you can discard any commits you make in this',
    'state without impacting any branches by switching back to a branch.',
    '',
    `HEAD is now at ${short(to)} ${firstLine(readCommit(repo, to).message)}`,
  );
}

const labelOf = (repo: Repository, oid: Oid | null): string =>
  currentBranchName(repo) ?? (oid ? short(oid) : 'HEAD');

const checkout: CommandSpec = {
  name: 'checkout', summary: 'Switch branches, or detach HEAD at a commit',
  syntax: 'git checkout <branch>',
  flags: [
    { long: 'branch', short: 'b', arg: 'none' },
    { long: 'detach', arg: 'none' },
    { long: 'force', short: 'f', arg: 'none' },
  ],
  concepts: ['branch', 'detached-head', 'working-directory'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const create = args.flags.branch !== undefined;
    const [a, b] = args.positionals;
    doCheckout(
      repo,
      create ? (b ?? '') : a,
      { create: create ? a : undefined, detach: args.flags.detach !== undefined, force: args.flags.force !== undefined },
      out as never,
    );
  },
};

const switchCmd: CommandSpec = {
  name: 'switch', summary: 'Switch branches (the modern, clearer half of checkout)',
  syntax: 'git switch <branch>  |  git switch -c <new-branch>',
  flags: [
    { long: 'create', short: 'c', arg: 'none' },
    { long: 'detach', short: 'd', arg: 'none' },
    { long: 'force', short: 'f', arg: 'none' },
  ],
  concepts: ['branch', 'detached-head', 'working-directory'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const create = args.flags.create !== undefined;
    const [a, b] = args.positionals;
    if (a === '-') {
      const prev = tryRevParse(repo, '@{-1}');
      if (!prev) throw E.unknownRevision('-');
      const name = listBranches(repo).find((x) => x.oid === prev)?.short;
      doCheckout(repo, name ?? prev, {}, out as never);
      return;
    }
    doCheckout(
      repo, create ? (b ?? '') : a,
      { create: create ? a : undefined, detach: args.flags.detach !== undefined, force: args.flags.force !== undefined },
      out as never,
    );
  },
};

const tag: CommandSpec = {
  name: 'tag', summary: 'Mark a commit with a permanent name',
  syntax: 'git tag <name>  |  git tag -a <name> -m "msg"',
  flags: [
    { long: 'annotate', short: 'a', arg: 'none' },
    { long: 'message', short: 'm', arg: 'required' },
    { long: 'delete', short: 'd', arg: 'none' },
    { long: 'list', short: 'l', arg: 'none' },
  ],
  concepts: ['tag', 'ref', 'annotated-tag'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const [name, target] = args.positionals;

    if (!name || args.flags.list !== undefined) {
      for (const t of listTags(repo)) out.line(t.short);
      return;
    }
    if (args.flags.delete !== undefined) {
      if (!repo.refs[tagRef(name)]) throw E.branchNotFound(name);
      deleteRef(repo, tagRef(name));
      out.line(`Deleted tag '${name}'`);
      return;
    }
    if (repo.refs[tagRef(name)]) throw E.alreadyExistsTag(name);

    const at = target ? revParse(repo, target) : requireHead(repo);
    const annotate = args.flags.annotate !== undefined || args.flags.message !== undefined;
    if (annotate) {
      // An annotated tag is a real object with its own id, tagger and message;
      // a lightweight tag is only a ref. That difference is the lesson.
      const message = (args.flags.message as string[] | undefined)?.[0] ?? name;
      const oid = writeObject(repo, {
        type: 'tag', object: at, objectType: 'commit', tag: name, tagger: signature(repo), message,
      });
      repo.refs[tagRef(name)] = { kind: 'direct', target: oid };
    } else {
      repo.refs[tagRef(name)] = { kind: 'direct', target: at };
    }
    out.event({ type: 'ref-created', ref: tagRef(name), at });
  },
};

const symbolicRef: CommandSpec = {
  name: 'symbolic-ref', summary: 'Show what HEAD actually points at',
  syntax: 'git symbolic-ref HEAD', flags: [{ long: 'short', arg: 'none' }],
  concepts: ['ref', 'detached-head'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const r = repo.refs[HEAD];
    if (!r || r.kind !== 'symbolic') {
      throw new GitError(['fatal: ref HEAD is not a symbolic ref'], 128, [], 'detached');
    }
    out.line(args.flags.short !== undefined ? shortenRef(r.target) : r.target);
  },
};

register(branch, checkout, switchCmd, tag, symbolicRef);
export { doCheckout, requireHead, labelOf };
