import { register, requireRepo, type CommandSpec } from '../registry';
import { E } from '../errors';
import { flagValues, hasFlag } from '../parseArgs';
import { initRepo } from '../world';
import {
  HEAD, currentBranchName, headOid, headLabel, isDetached, resolveSymbolic,
  updateRef, walkHistory, refsAt,
} from '../refs';
import { firstLine, readBlob, readCommit, short, writeObject } from '../objects';
import {
  hasUnmerged, indexFlat, indexRemove, indexSet, unmergedPaths,
} from '../gitIndex';
import { flatTreeOfCommit, flattenTree, writeTreeFromIndex } from '../trees';
import { revParse } from '../revparse';
import { blobFromWorktree, ignored, worktreeFlat } from '../worktree';
import { renderStatus, status } from '../status';
import { signature, formatDate } from '../clock';
import { unifiedDiff, summaryLine } from '../diff/unified';
import type { Oid, Repository } from '../types';

const init: CommandSpec = {
  name: 'init', summary: 'Create a new, empty repository',
  syntax: 'git init', flags: [], concepts: ['repository', 'git-directory'],
  handler: ({ world, out }) => {
    if (world.local.initialized) {
      out.line('Reinitialized existing Git repository in /project/.git/');
      return;
    }
    initRepo(world.local);
    out.line('Initialized empty Git repository in /project/.git/');
    out.event({ type: 'repo-initialized' });
  },
};

/** Stages a path. This is also how a conflict is resolved: writing a stage-0
 *  entry drops the 1/2/3 stages for that path. Returns true if it resolved one. */
function stagePath(repo: Repository, path: string): boolean {
  const wasUnmerged = unmergedPaths(repo.index).includes(path);
  if (repo.worktree.files[path] === undefined) indexRemove(repo.index, path);
  else indexSet(repo.index, path, blobFromWorktree(repo, path));
  return wasUnmerged;
}

/** Expands a pathspec: '.' and '-A' mean everything, otherwise an exact path. */
function resolvePathspecs(repo: Repository, specs: string[], all: boolean): string[] {
  const candidates = new Set([
    ...Object.keys(repo.worktree.files),
    ...Object.keys(indexFlat(repo.index)),
    ...unmergedPaths(repo.index),
  ]);
  if (all || specs.some((s) => s === '.' || s === '-A' || s === '*')) {
    return [...candidates].filter((p) => !ignored(repo, p) || indexFlat(repo.index)[p] !== undefined).sort();
  }
  const out: string[] = [];
  for (const s of specs) {
    const matches = [...candidates].filter((p) => p === s || p.startsWith(s.replace(/\/$/, '') + '/'));
    if (!matches.length) throw E.pathspecNotMatch(s);
    out.push(...matches);
  }
  return [...new Set(out)].sort();
}

const add: CommandSpec = {
  name: 'add', summary: 'Stage changes for the next commit',
  syntax: 'git add <file>  |  git add .',
  flags: [{ long: 'all', short: 'A', arg: 'none' }, { long: 'update', short: 'u', arg: 'none' }],
  concepts: ['index', 'staging', 'conflict-resolution'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const all = hasFlag(args, 'all', 'update');
    if (!args.positionals.length && !all) {
      throw E.pathspecNotMatch('');
    }
    const paths = resolvePathspecs(repo, args.positionals, all);
    for (const p of paths) {
      const before = indexFlat(repo.index)[p];
      const resolved = stagePath(repo, p);
      if (resolved) out.event({ type: 'conflict-resolved', path: p });
      if (before !== indexFlat(repo.index)[p]) out.event({ type: 'file-staged', path: p });
    }
  },
};

const rm: CommandSpec = {
  name: 'rm', summary: 'Delete a file and stage the deletion',
  syntax: 'git rm <file>',
  flags: [{ long: 'cached', arg: 'none' }, { long: 'force', short: 'f', arg: 'none' }],
  concepts: ['index'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    for (const p of args.positionals) {
      if (indexFlat(repo.index)[p] === undefined) throw E.pathspecNotMatch(p);
      indexRemove(repo.index, p);
      if (args.flags.cached === undefined) delete repo.worktree.files[p];
      out.line(`rm '${p}'`);
      out.event({ type: 'file-staged', path: p });
    }
  },
};

const commit: CommandSpec = {
  name: 'commit', summary: 'Record the staged snapshot in history',
  syntax: 'git commit -m "message"',
  flags: [
    { long: 'message', short: 'm', arg: 'required', repeatable: true },
    { long: 'all', short: 'a', arg: 'none' },
    { long: 'amend', arg: 'none' },
    { long: 'allow-empty', arg: 'none' },
    { long: 'no-edit', arg: 'none' },
  ],
  concepts: ['commit-object', 'snapshot', 'index', 'branch-advance'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    if (repo.operation.kind === 'rebase') throw E.cannotCommitDuringRebase();
    if (hasUnmerged(repo.index)) throw E.unmergedFiles();

    if (args.flags.all !== undefined) {
      // -a stages modifications and deletions of already-tracked paths only.
      for (const p of Object.keys(indexFlat(repo.index))) stagePath(repo, p);
    }

    const head = headOid(repo);
    const amend = args.flags.amend !== undefined;
    if (amend && !head) throw E.unknownRevision('HEAD');

    const merging = repo.operation.kind === 'merge';
    const parents: Oid[] = amend
      ? readCommit(repo, head!).parents
      : merging
        ? [head!, (repo.operation as { theirs: Oid }).theirs]
        : head ? [head] : [];

    const tree = writeTreeFromIndex(repo);
    const parentTree = parents[0] ? readCommit(repo, parents[0]).tree : null;
    if (tree === parentTree && args.flags['allow-empty'] === undefined && !merging && !amend) {
      throw E.nothingToCommit(headLabel(repo), !head);
    }

    const messages = flagValues(args, 'message');
    let message = messages.join('\n\n');
    if (!message && merging) message = (repo.operation as { message: string }).message;
    if (!message && amend) message = readCommit(repo, head!).message;
    if (!message) throw E.emptyCommitMessage();

    const author = amend ? readCommit(repo, head!).author : signature(repo);
    const oid = writeObject(repo, {
      type: 'commit', tree, parents, author, committer: signature(repo), message,
    });

    updateRef(repo, HEAD, oid, `commit${amend ? ' (amend)' : merging ? ' (merge)' : ''}: ${firstLine(message)}`);
    repo.operation = { kind: 'none' };

    const rootNote = !parents.length ? ' (root-commit)' : '';
    out.line(`[${headLabel(repo)}${rootNote} ${short(oid)}] ${firstLine(message)}`);
    if (!merging) {
      const stat = statBetween(repo, parentTree, tree);
      out.line(summaryLine(stat));
    }
    out.event({ type: 'commit-created', oid, parents });
    out.event({ type: 'ref-moved', ref: resolveSymbolic(repo, HEAD), from: head, to: oid });
  },
};

function statBetween(repo: Repository, aTree: Oid | null, bTree: Oid | null) {
  const a = flattenTree(repo, aTree);
  const b = flattenTree(repo, bTree);
  let files = 0, insertions = 0, deletions = 0;
  for (const p of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[p] === b[p]) continue;
    files++;
    const d = unifiedDiff(p, a[p] ? readBlob(repo, a[p]).content : '', b[p] ? readBlob(repo, b[p]).content : '');
    insertions += d.insertions;
    deletions += d.deletions;
  }
  return { files, insertions, deletions };
}

const statusCmd: CommandSpec = {
  name: 'status', summary: 'Show what changed, and where it currently lives',
  syntax: 'git status [-s]',
  flags: [{ long: 'short', short: 's', arg: 'none' }],
  concepts: ['three-trees', 'index', 'working-directory'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    if (args.flags.short !== undefined) {
      const s = status(repo);
      const code: Record<string, string> = {
        'staged-new': 'A ', 'staged-modified': 'M ', 'staged-deleted': 'D ',
        modified: ' M', deleted: ' D',
      };
      for (const f of s.staged) out.line(`${code[f.state] ?? '??'} ${f.path}`);
      for (const f of s.unstaged) out.line(`${code[f.state] ?? '??'} ${f.path}`);
      for (const p of s.unmerged) out.line(`UU ${p}`);
      for (const p of s.untracked) out.line(`?? ${p}`);
      return;
    }
    out.line(...renderStatus(repo));
  },
};

const log: CommandSpec = {
  name: 'log', summary: 'Walk history backwards through parent links',
  syntax: 'git log --oneline --graph',
  flags: [
    { long: 'oneline', arg: 'none' },
    { long: 'graph', arg: 'none' },
    { long: 'all', arg: 'none' },
    { long: 'max-count', short: 'n', arg: 'required' },
    { long: 'stat', arg: 'none' },
  ],
  concepts: ['history', 'dag', 'parent'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const head = headOid(repo);
    const tips: Oid[] = args.flags.all !== undefined
      ? Object.values(repo.refs)
          .filter((r): r is { kind: 'direct'; target: Oid } => r.kind === 'direct')
          .map((r) => r.target)
      : head ? [head] : [];
    if (!tips.length) throw E.noCommitsYet();

    let commits = walkHistory(repo, tips);
    const limit = args.flags['max-count'];
    if (Array.isArray(limit)) commits = commits.slice(0, parseInt(limit[0], 10));

    const oneline = args.flags.oneline !== undefined;
    const graph = args.flags.graph !== undefined;
    const prefix = graph ? '* ' : '';

    for (const oid of commits) {
      const c = readCommit(repo, oid);
      const decoration = decorate(repo, oid);
      if (oneline) {
        out.line(`${prefix}${short(oid)}${decoration} ${firstLine(c.message)}`);
      } else {
        out.line(`commit ${oid}${decoration}`);
        if (c.parents.length > 1) out.line(`Merge: ${c.parents.map(short).join(' ')}`);
        out.line(`Author: ${c.author.name} <${c.author.email}>`);
        out.line(`Date:   ${formatDate(c.author.timestamp)}`);
        out.line('');
        for (const l of c.message.split('\n')) out.line(`    ${l}`);
        out.line('');
      }
    }
  },
};

function decorate(repo: Repository, oid: Oid): string {
  const refs = refsAt(repo, oid);
  const isHead = headOid(repo) === oid;
  const parts: string[] = [];
  if (isHead && !isDetached(repo)) {
    const branch = currentBranchName(repo);
    parts.push(`HEAD -> ${branch}`);
    for (const r of refs) if (r.label !== branch) parts.push(r.kind === 'tag' ? `tag: ${r.label}` : r.label);
  } else {
    for (const r of refs) parts.push(r.kind === 'tag' ? `tag: ${r.label}` : r.label);
  }
  return parts.length ? ` (${parts.join(', ')})` : '';
}

const show: CommandSpec = {
  name: 'show', summary: 'Show a commit and the change it introduced',
  syntax: 'git show <commit>', flags: [], concepts: ['commit-object', 'diff'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const oid = revParse(repo, args.positionals[0] ?? HEAD);
    const c = readCommit(repo, oid);
    out.line(`commit ${oid}${decorate(repo, oid)}`);
    if (c.parents.length > 1) out.line(`Merge: ${c.parents.map(short).join(' ')}`);
    out.line(`Author: ${c.author.name} <${c.author.email}>`);
    out.line(`Date:   ${formatDate(c.author.timestamp)}`);
    out.line('');
    for (const l of c.message.split('\n')) out.line(`    ${l}`);
    out.line('');
    const before = flatTreeOfCommit(repo, c.parents[0] ?? null);
    const after = flatTreeOfCommit(repo, oid);
    for (const p of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (before[p] === after[p]) continue;
      out.line(...unifiedDiff(p,
        before[p] ? readBlob(repo, before[p]).content : '',
        after[p] ? readBlob(repo, after[p]).content : '').hunks);
    }
  },
};

const diff: CommandSpec = {
  name: 'diff', summary: 'Compare the three trees against each other',
  syntax: 'git diff [--staged]',
  flags: [
    { long: 'staged', arg: 'none' }, { long: 'cached', arg: 'none' }, { long: 'stat', arg: 'none' },
  ],
  concepts: ['three-trees', 'diff'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const head = headOid(repo);
    const staged = hasFlag(args, 'staged', 'cached');

    // The three-tree matrix: --staged is index vs HEAD, plain diff is worktree vs index.
    const left = staged ? flatTreeOfCommit(repo, head) : indexFlat(repo.index);
    const right = staged ? indexFlat(repo.index) : worktreeFlat(repo);
    const tracked = new Set(Object.keys(indexFlat(repo.index)));

    // The right side of an unstaged diff is the working tree, whose blobs are
    // hashed but deliberately not stored, so read those from the file itself.
    const contentAt = (side: 'left' | 'right', path: string): string => {
      const oid = (side === 'left' ? left : right)[path];
      if (oid === undefined) return '';
      if (side === 'right' && !staged) return repo.worktree.files[path] ?? '';
      return readBlob(repo, oid).content;
    };

    for (const p of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
      if (!staged && !tracked.has(p)) continue; // untracked files are not part of `git diff`
      if (left[p] === right[p]) continue;
      out.line(...unifiedDiff(p, contentAt('left', p), contentAt('right', p)).hunks);
    }
  },
};

register(init, add, rm, commit, statusCmd, log, show, diff);
export { stagePath, resolvePathspecs, decorate, statBetween };
