import { register, requireRepo, type CommandSpec } from '../registry';
import { E } from '../errors';
import {
  HEAD, branchRef, currentBranchName, currentBranchRef, headOid, headsPrefix,
  remoteRef, resolveRefToOid, resolveSymbolic, setHeadDetached, shortenRef, updateRef, walkHistory,
} from '../refs';
import { short, writeObject } from '../objects';
import { commitRange } from '../revparse';
import { isAncestor, mergeBase } from '../merge/mergeBase';
import { mergeTrees } from '../merge/mergeTrees';
import { checkoutTree } from '../worktree';
import { writeFlatTree } from '../trees';
import { indexFromFlat } from '../gitIndex';
import { emptyRepo, initRepo } from '../world';
import { signature } from '../clock';
import { runRebase, stepsFrom } from '../sequencer';
import { applyMergeResult, reportMerge } from './merging';
import { flatTreeOfCommit } from '../trees';
import type { Oid, Repository, World } from '../types';

const DEFAULT_URL = 'https://github.com/you/project.git';

function requireOrigin(world: World): Repository {
  if (!world.origin || !world.local.remotes.origin) throw E.noRemote('origin');
  return world.origin;
}

/** Copies a commit and everything it reaches from one repository into another.
 *  This is what "pushing" and "fetching" actually move: objects, then a ref. */
function transferObjects(from: Repository, to: Repository, tip: Oid): number {
  let copied = 0;
  for (const oid of walkHistory(from, [tip])) {
    const commit = from.objects[oid];
    if (!to.objects[oid]) { to.objects[oid] = commit; copied++; }
    const stack: Oid[] = [(commit as { tree: Oid }).tree];
    while (stack.length) {
      const t = stack.pop()!;
      const obj = from.objects[t];
      if (!obj) continue;
      if (!to.objects[t]) { to.objects[t] = obj; copied++; }
      if (obj.type === 'tree') for (const e of obj.entries) stack.push(e.oid);
    }
  }
  return copied;
}

const remote: CommandSpec = {
  name: 'remote', summary: '"origin" is a nickname for a URL — nothing more',
  syntax: 'git remote add origin <url>',
  flags: [{ long: 'verbose', short: 'v', arg: 'none' }],
  concepts: ['remote', 'distributed'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const [sub, name, url] = args.positionals;

    if (!sub || args.flags.verbose !== undefined) {
      for (const [n, cfg] of Object.entries(repo.remotes)) {
        out.line(`${n}\t${cfg.url} (fetch)`, `${n}\t${cfg.url} (push)`);
      }
      return;
    }
    if (sub === 'add') {
      if (repo.remotes[name]) throw E.remoteExists(name);
      repo.remotes[name] = { url: url ?? DEFAULT_URL };
      // The other side is a real repository, bare like a server's copy.
      if (name === 'origin' && !world.origin) {
        world.origin = emptyRepo({ bare: true });
        initRepo(world.origin);
      }
      return;
    }
    if (sub === 'remove' || sub === 'rm') {
      delete repo.remotes[name];
      return;
    }
    throw E.shell(`error: Unknown subcommand: ${sub}`);
  },
};

const clone: CommandSpec = {
  name: 'clone', summary: 'Copy an entire repository — history and all',
  syntax: 'git clone <url>', flags: [], concepts: ['clone', 'distributed', 'remote-tracking-ref'],
  handler: ({ world, args, out }) => {
    const url = args.positionals[0] ?? DEFAULT_URL;
    if (!world.origin) throw E.noRemote(url);
    const origin = world.origin;

    const local = emptyRepo();
    initRepo(local);
    local.remotes.origin = { url };
    out.line(`Cloning into 'project'...`);

    for (const [name, ref] of Object.entries(origin.refs)) {
      if (!name.startsWith(headsPrefix) || ref.kind !== 'direct') continue;
      transferObjects(origin, local, ref.target);
      local.refs[remoteRef('origin', shortenRef(name))] = { kind: 'direct', target: ref.target };
    }

    const originHead = resolveSymbolic(origin, HEAD);
    const defaultBranch = originHead.startsWith(headsPrefix) ? shortenRef(originHead) : 'main';
    const tip = resolveRefToOid(origin, branchRef(defaultBranch));
    if (tip) {
      local.refs[branchRef(defaultBranch)] = { kind: 'direct', target: tip };
      local.upstream[branchRef(defaultBranch)] = remoteRef('origin', defaultBranch);
      local.refs[HEAD] = { kind: 'symbolic', target: branchRef(defaultBranch) };
      const flat = flatTreeOfCommit(local, tip);
      local.index = indexFromFlat(flat);
      for (const [p, oid] of Object.entries(flat)) {
        local.worktree.files[p] = (local.objects[oid] as { content: string }).content;
      }
      out.line(`Receiving objects: 100% (${walkHistory(local, [tip]).length} commits), done.`);
    }
    world.local = local;
    out.event({ type: 'cloned' });
  },
};

const fetch: CommandSpec = {
  name: 'fetch', summary: 'Download from the remote — and touch nothing of yours',
  syntax: 'git fetch', flags: [{ long: 'all', arg: 'none' }],
  concepts: ['fetch', 'fetch-vs-pull', 'remote-tracking-ref'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const origin = requireOrigin(world);
    void args;
    const updated: string[] = [];

    // The whole point of fetch: it writes refs/remotes/*, never refs/heads/*.
    for (const [name, ref] of Object.entries(origin.refs)) {
      if (!name.startsWith(headsPrefix) || ref.kind !== 'direct') continue;
      const branch = shortenRef(name);
      const tracking = remoteRef('origin', branch);
      const before = resolveRefToOid(repo, tracking);
      if (before === ref.target) continue;
      transferObjects(origin, repo, ref.target);
      repo.refs[tracking] = { kind: 'direct', target: ref.target };
      updated.push(`   ${before ? short(before) : '*'}..${short(ref.target)}  ${branch} -> origin/${branch}`);
      out.event({ type: 'ref-moved', ref: tracking, from: before, to: ref.target });
    }

    if (updated.length) {
      out.line(`From ${repo.remotes.origin.url}`, ...updated);
      out.event({ type: 'fetched', refs: updated });
    }
  },
};

const push: CommandSpec = {
  name: 'push', summary: 'Publish your commits to the remote',
  syntax: 'git push  |  git push -u origin <branch>',
  flags: [
    { long: 'set-upstream', short: 'u', arg: 'none' },
    { long: 'force', short: 'f', arg: 'none' },
    { long: 'delete', short: 'd', arg: 'none' },
  ],
  concepts: ['push', 'non-fast-forward', 'remote-tracking-ref', 'upstream'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const origin = requireOrigin(world);
    const url = repo.remotes.origin.url;
    const branch = args.positionals[1] ?? currentBranchName(repo);
    if (!branch) throw E.noCommitsYet();

    const localRef = branchRef(branch);
    const localTip = resolveRefToOid(repo, localRef);
    if (!localTip) throw E.branchNotFound(branch);

    if (!args.positionals.length && !repo.upstream[localRef] && args.flags['set-upstream'] === undefined) {
      throw E.noUpstream(branch);
    }

    const remoteTip = resolveRefToOid(origin, localRef);
    const force = args.flags.force !== undefined;
    // Reject unless we're strictly ahead: the remote has work we don't have.
    if (remoteTip && !force && !isAncestor(repo, remoteTip, localTip)) {
      throw E.nonFastForward(branch, url);
    }

    transferObjects(repo, origin, localTip);
    origin.refs[localRef] = { kind: 'direct', target: localTip };
    if (!origin.refs[HEAD]) origin.refs[HEAD] = { kind: 'symbolic', target: localRef };
    repo.refs[remoteRef('origin', branch)] = { kind: 'direct', target: localTip };
    if (args.flags['set-upstream'] !== undefined) repo.upstream[localRef] = remoteRef('origin', branch);

    const count = walkHistory(repo, [localTip]).length;
    out.line(
      `Enumerating objects: ${count}, done.`,
      `To ${url}`,
      remoteTip
        ? `   ${short(remoteTip)}..${short(localTip)}  ${branch} -> ${branch}`
        : ` * [new branch]      ${branch} -> ${branch}`,
    );
    if (args.flags['set-upstream'] !== undefined) {
      out.line(`branch '${branch}' set up to track 'origin/${branch}'.`);
    }
    out.event({ type: 'pushed', ref: localRef, forced: force });
  },
};

const pull: CommandSpec = {
  name: 'pull', summary: 'fetch + merge (or + rebase) in one step',
  syntax: 'git pull  |  git pull --rebase',
  flags: [
    { long: 'rebase', short: 'r', arg: 'none' },
    { long: 'no-rebase', arg: 'none' },
    { long: 'ff-only', arg: 'none' },
  ],
  concepts: ['pull', 'fetch-vs-pull', 'merge', 'rebase'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const origin = requireOrigin(world);
    const branch = args.positionals[1] ?? currentBranchName(repo);
    if (!branch) throw E.noCommitsYet();

    // pull is literally fetch, then integrate. Do the fetch part first.
    const remoteTip = resolveRefToOid(origin, branchRef(branch));
    if (!remoteTip) throw E.branchNotFound(branch);
    transferObjects(origin, repo, remoteTip);
    const tracking = remoteRef('origin', branch);
    const beforeTracking = resolveRefToOid(repo, tracking);
    repo.refs[tracking] = { kind: 'direct', target: remoteTip };
    if (beforeTracking !== remoteTip) out.line(`From ${repo.remotes.origin.url}`);

    const localTip = headOid(repo);
    if (!localTip) {
      updateRef(repo, HEAD, remoteTip, `pull: initial`);
      checkoutTree(repo, null, remoteTip, { force: true });
      return;
    }
    if (localTip === remoteTip || isAncestor(repo, remoteTip, localTip)) {
      out.line('Already up to date.');
      return;
    }

    if (isAncestor(repo, localTip, remoteTip)) {
      out.line(`Updating ${short(localTip)}..${short(remoteTip)}`, 'Fast-forward');
      checkoutTree(repo, localTip, remoteTip, { force: true });
      updateRef(repo, HEAD, remoteTip, 'pull: Fast-forward');
      out.event({ type: 'merged', strategy: 'fast-forward', from: `origin/${branch}` });
      return;
    }

    // Diverged. This is where the old engine silently threw local work away.
    if (args.flags['ff-only'] !== undefined) throw E.divergedNoStrategy();

    if (args.flags.rebase !== undefined) {
      // Replay our local commits on top of theirs, reusing the rebase sequencer
      // so `pull --rebase` and `rebase` can never disagree.
      const base = mergeBase(repo, localTip, remoteTip);
      const picks = commitRange(repo, base, localTip);
      repo.operation = {
        kind: 'rebase', onto: remoteTip, origHead: localTip,
        origBranch: currentBranchRef(repo), todo: stepsFrom(repo, picks), done: [], current: null,
      };
      setHeadDetached(repo, remoteTip, `pull --rebase: checkout origin/${branch}`);
      checkoutTree(repo, localTip, remoteTip, { force: true });
      out.event({ type: 'rebase-started', count: picks.length });
      runRebase(repo, out as never);
      return;
    }

    const base = mergeBase(repo, localTip, remoteTip);
    const result = mergeTrees(repo, base, localTip, remoteTip, 'HEAD', `origin/${branch}`);
    applyMergeResult(repo, result);
    const message = `Merge branch '${branch}' of ${repo.remotes.origin.url}`;
    if (reportMerge(result, out as never)) {
      repo.operation = { kind: 'merge', theirs: remoteTip, theirsLabel: `origin/${branch}`, base, message };
      out.line('Automatic merge failed; fix conflicts and then commit the result.');
      out.exit(1);
      return;
    }
    const tree = writeFlatTree(repo, result.merged);
    const oid = writeObject(repo, {
      type: 'commit', tree, parents: [localTip, remoteTip],
      author: signature(repo), committer: signature(repo), message,
    });
    updateRef(repo, HEAD, oid, `pull: Merge made by the 'ort' strategy.`);
    out.line(`Merge made by the 'ort' strategy.`);
    out.event({ type: 'commit-created', oid, parents: [localTip, remoteTip] });
  },
};

register(remote, clone, fetch, push, pull);
export { transferObjects, requireOrigin };
