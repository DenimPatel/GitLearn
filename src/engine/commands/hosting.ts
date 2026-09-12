import { register, requireRepo, type CommandSpec } from '../registry';
import { E } from '../errors';
import { branchRef, currentBranchName, remoteRef, resolveRefToOid, walkHistory } from '../refs';
import { firstLine, readCommit, short, writeObject } from '../objects';
import { mergeBase } from '../merge/mergeBase';
import { mergeTrees } from '../merge/mergeTrees';
import { applyCommit } from '../merge/apply';
import { flattenTree, treeOfCommit, writeFlatTree } from '../trees';
import { signature } from '../clock';
import { requireOrigin } from './remotes';
import type { Oid, World } from '../types';

/** The GitHub layer. Deliberately separate from git itself: a pull request is a
 *  hosting-provider concept, not something git knows about. `gh` stands in for
 *  clicking the button on the website. */

function openPRs(world: World) {
  return world.hosting.pullRequests.filter((p) => p.status === 'open');
}

const gh: CommandSpec = {
  name: 'gh', summary: 'Open, list and merge pull requests (stands in for the website)',
  syntax: 'gh pr create --title "..."  |  gh pr merge',
  namespace: 'shell',
  flags: [
    { long: 'title', short: 't', arg: 'required' },
    { long: 'base', short: 'B', arg: 'required' },
    { long: 'squash', arg: 'none' },
    { long: 'rebase', arg: 'none' },
    { long: 'delete-branch', short: 'd', arg: 'none' },
  ],
  concepts: ['pull-request', 'code-review', 'github-flow'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const origin = requireOrigin(world);
    const [scope, sub] = args.positionals;
    if (scope !== 'pr') throw E.shell(`unknown gh command: ${scope ?? ''}`);

    if (sub === 'list') {
      if (!world.hosting.pullRequests.length) { out.line('no open pull requests'); return; }
      for (const p of world.hosting.pullRequests) {
        out.line(`#${p.id}\t${p.title}\t${p.sourceBranch} → ${p.targetBranch}\t${p.status}`);
      }
      return;
    }

    if (sub === 'create') {
      const source = currentBranchName(repo);
      if (!source) throw E.branchNotFound('HEAD');
      const target = (args.flags.base as string[] | undefined)?.[0] ?? 'main';
      if (source === target) {
        throw E.shell(`a pull request cannot merge '${target}' into itself — switch to a feature branch first`);
      }
      if (!resolveRefToOid(origin, branchRef(source))) {
        throw E.shell(`branch '${source}' is not on the remote yet. Run: git push -u origin ${source}`);
      }
      if (!resolveRefToOid(origin, branchRef(target))) {
        throw E.shell(`branch '${target}' is not on the remote yet. Run: git push origin ${target}`);
      }
      if (openPRs(world).some((p) => p.sourceBranch === source && p.targetBranch === target)) {
        throw E.shell(`a pull request from '${source}' into '${target}' is already open`);
      }

      const sourceTip = resolveRefToOid(origin, branchRef(source))!;
      const targetTip = resolveRefToOid(origin, branchRef(target))!;
      const base = mergeBase(origin, sourceTip, targetTip);
      const commits = walkHistory(origin, [sourceTip])
        .filter((c) => !base || !walkHistory(origin, [base]).includes(c));

      const id = world.hosting.pullRequests.length + 1;
      const title = (args.flags.title as string[] | undefined)?.[0]
        ?? firstLine(readCommit(origin, sourceTip).message);
      world.hosting.pullRequests.push({
        id, title, sourceBranch: source, targetBranch: target, status: 'open', commits,
      });
      out.line(
        `Creating pull request for ${source} into ${target} in ${repo.remotes.origin.url}`,
        `${repo.remotes.origin.url.replace(/\.git$/, '')}/pull/${id}`,
        `#${id} ${title} — ${commits.length} commit${commits.length === 1 ? '' : 's'}`,
      );
      out.event({ type: 'pr-opened', id });
      return;
    }

    if (sub === 'merge') {
      const idArg = args.positionals[2];
      const target = idArg
        ? world.hosting.pullRequests.find((p) => String(p.id) === idArg.replace('#', ''))
        : openPRs(world)[0];
      if (!target || target.status !== 'open') throw E.shell('no open pull request to merge');

      const sourceTip = resolveRefToOid(origin, branchRef(target.sourceBranch));
      const targetTip = resolveRefToOid(origin, branchRef(target.targetBranch));
      if (!sourceTip || !targetTip) throw E.shell('a branch in this pull request is missing on the remote');

      // The landing strategy is chosen here. Merge, squash and rebase produce
      // three visibly different histories from the same PR — which is the lesson.
      let oid: Oid;
      if (args.flags.rebase !== undefined) {
        // Rebase landing: replay each PR commit onto the target, one by one.
        let tip = targetTip;
        for (const commit of [...target.commits].reverse()) {
          const original = readCommit(origin, commit);
          const result = applyCommit(origin, tip, commit, target.targetBranch, target.sourceBranch);
          if (result.conflicts.length) {
            throw E.shell(`pull request #${target.id} cannot be rebase-merged automatically (conflicts)`);
          }
          const tree = writeFlatTree(origin, result.merged);
          tip = writeObject(origin, {
            type: 'commit', tree, parents: [tip],
            author: original.author, committer: signature(origin), message: original.message,
          });
        }
        oid = tip;
      } else {
        const base = mergeBase(origin, targetTip, sourceTip);
        const result = mergeTrees(origin, base, targetTip, sourceTip, target.targetBranch, target.sourceBranch);
        if (result.conflicts.length) {
          out.line(`Pull request #${target.id} has conflicts and cannot be merged automatically.`);
          out.exit(1);
          return;
        }
        const tree = writeFlatTree(origin, result.merged);
        const squash = args.flags.squash !== undefined;
        const parents: Oid[] = squash ? [targetTip] : [targetTip, sourceTip];
        const message = squash
          ? `${target.title} (#${target.id})`
          : `Merge pull request #${target.id} from ${target.sourceBranch}\n\n${target.title}`;
        oid = writeObject(origin, {
          type: 'commit', tree, parents,
          author: signature(origin), committer: signature(origin), message,
        });
      }
      origin.refs[branchRef(target.targetBranch)] = { kind: 'direct', target: oid };
      target.status = 'merged';
      target.mergeStrategy = args.flags.rebase !== undefined
        ? 'rebase'
        : args.flags.squash !== undefined ? 'squash' : 'merge';

      out.line(
        `Merged pull request #${target.id} (${short(oid)}).`,
        `Your local '${target.targetBranch}' does not know about this yet — run: git pull origin ${target.targetBranch}`,
      );
      if (args.flags['delete-branch'] !== undefined) {
        // --delete-branch also cleans up the remote-tracking ref on your side.
        delete origin.refs[branchRef(target.sourceBranch)];
        delete world.local.refs[remoteRef('origin', target.sourceBranch)];
        out.line(`Deleted branch ${target.sourceBranch}.`);
      }
      out.event({ type: 'pr-merged', id: target.id });
      return;
    }

    throw E.shell(`unknown gh pr subcommand: ${sub ?? ''}`);
  },
};

/** A teammate pushing while you work. Scenarios use it; so can a curious learner. */
const teammate: CommandSpec = {
  name: 'teammate', namespace: 'shell',
  summary: 'Simulate a colleague committing and pushing to the remote',
  syntax: 'teammate push <branch> <file> "<content>" "<message>"',
  flags: [], concepts: ['distributed', 'non-fast-forward'],
  handler: ({ world, args, out }) => {
    const origin = requireOrigin(world);
    const [sub, branch = 'main', file = 'README.md', content = 'teammate change', message = 'Update from a teammate'] =
      args.positionals;
    if (sub !== 'push') throw E.shell('usage: teammate push <branch> <file> <content> <message>');

    const ref = branchRef(branch);
    const tip = resolveRefToOid(origin, ref);
    const flat: Record<string, Oid> = {};
    if (tip) Object.assign(flat, flattenTree(origin, treeOfCommit(origin, tip)));
    flat[file] = writeObject(origin, { type: 'blob', content: content + '\n' });
    const tree = writeFlatTree(origin, flat);
    const oid = writeObject(origin, {
      type: 'commit', tree, parents: tip ? [tip] : [],
      author: teammateSig(origin), committer: teammateSig(origin), message,
    });
    origin.refs[ref] = { kind: 'direct', target: oid };
    out.line(`A teammate pushed ${short(oid)} to origin/${branch}: ${message}`);
  },
};

function teammateSig(repo: Parameters<typeof signature>[0]) {
  return { ...signature(repo), name: 'Sam', email: 'sam@example.com' };
}

register(gh, teammate);
