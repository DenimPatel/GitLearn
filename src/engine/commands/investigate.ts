import { register, requireRepo, type CommandSpec } from '../registry';
import { E } from '../errors';
import { flagValue, hasFlag } from '../parseArgs';
import {
  currentBranchRef, headOid, listTags, setHeadDetached, setHeadToBranch,
} from '../refs';
import { firstLine, readBlob, readCommit, short } from '../objects';
import { flatTreeOfCommit } from '../trees';
import { diffLines, splitLines } from '../diff/lcs';
import { checkoutTree } from '../worktree';
import { formatDate } from '../clock';
import { revParse } from '../revparse';
import type { Oid, Repository } from '../types';

/**
 * History investigation: blame, describe, shortlog, fsck and bisect.
 *
 * These commands answer "who wrote this line / which commit broke it / where am
 * I in the release cycle" without inventing any state the rest of the engine
 * does not already have — except bisect, whose cursor is a real, persistent
 * piece of repository state, exactly like .git/BISECT_* on disk.
 */

/** The first-parent chain from a commit, newest first. */
function firstParentChain(repo: Repository, head: Oid): Oid[] {
  const chain: Oid[] = [];
  let cur: Oid | null = head;
  while (cur && repo.objects[cur]?.type === 'commit') {
    chain.push(cur);
    cur = readCommit(repo, cur).parents[0] ?? null;
  }
  return chain;
}

const fileAt = (repo: Repository, oid: Oid, path: string): string | null => {
  const oidOfBlob = flatTreeOfCommit(repo, oid)[path];
  return oidOfBlob ? readBlob(repo, oidOfBlob).content : null;
};

const blame: CommandSpec = {
  name: 'blame', summary: 'Show which commit last touched each line of a file',
  syntax: 'git blame <file>', flags: [], concepts: ['code-archaeology', 'history', 'diff'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const path = args.positionals[0];
    if (!path) throw E.shell('usage: git blame <file>');
    const head = headOid(repo);
    if (!head) throw E.noCommitsYet();
    const atHead = fileAt(repo, head, path);
    if (atHead === null) throw E.pathspecNotMatch(path);

    // Walk oldest -> newest, keeping a line-by-line owner list. Lines that
    // appear unchanged carry their owner forward; lines a commit introduced
    // (or rewrote) are attributed to it.
    const chain = firstParentChain(repo, head).reverse();
    let state: { line: string; owner: Oid }[] =
      splitLines(fileAt(repo, chain[0], path) ?? '').map((line) => ({ line, owner: chain[0] }));

    for (let i = 1; i < chain.length; i++) {
      const before = splitLines(fileAt(repo, chain[i - 1], path) ?? '');
      const after = splitLines(fileAt(repo, chain[i], path) ?? '');
      const next: { line: string; owner: Oid }[] = [];
      for (const op of diffLines(before, after)) {
        if (op.type === 'eq') next.push(state[op.a]);
        else if (op.type === 'ins') next.push({ line: op.line, owner: chain[i] });
      }
      state = next;
    }

    state.forEach((entry, i) => {
      const c = readCommit(repo, entry.owner);
      out.line(`^${short(entry.owner)} (${c.author.name} ${formatDate(c.author.timestamp)} ${i + 1}) ${entry.line}`);
    });
  },
};

/** A tag ref resolved to the commit it names, and whether it is annotated. */
function tagCommits(repo: Repository): { name: string; commit: Oid; annotated: boolean }[] {
  const out: { name: string; commit: Oid; annotated: boolean }[] = [];
  for (const t of listTags(repo)) {
    const obj = repo.objects[t.oid];
    if (!obj) continue;
    if (obj.type === 'tag') out.push({ name: t.short, commit: obj.object, annotated: true });
    else out.push({ name: t.short, commit: t.oid, annotated: false });
  }
  return out;
}

const describe: CommandSpec = {
  name: 'describe', summary: 'Name a commit by the nearest reachable tag',
  syntax: 'git describe [--tags] [--abbrev=0]',
  flags: [
    { long: 'tags', arg: 'none' },
    { long: 'abbrev', arg: 'required' },
  ],
  concepts: ['code-archaeology', 'tag', 'history'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const head = headOid(repo);
    if (!head) throw E.noCommitsYet();

    const includeLightweight = args.flags.tags !== undefined;
    const distances = new Map<Oid, number>([[head, 0]]);
    const queue: Oid[] = [head];
    while (queue.length) {
      const oid = queue.shift()!;
      for (const p of readCommit(repo, oid).parents) {
        if (!distances.has(p)) { distances.set(p, distances.get(oid)! + 1); queue.push(p); }
      }
    }

    let best: { name: string; commit: Oid; distance: number } | null = null;
    for (const t of tagCommits(repo)) {
      if (!includeLightweight && !t.annotated) continue;
      const d = distances.get(t.commit);
      if (d === undefined) continue;
      if (!best || d < best.distance || (d === best.distance && t.name < best.name)) {
        best = { name: t.name, commit: t.commit, distance: d };
      }
    }
    if (!best) throw E.shell('fatal: No names found, cannot describe anything.');

    const abbrevFlag = flagValue(args, 'abbrev');
    if (abbrevFlag === '0' || best.distance === 0) { out.line(best.name); return; }
    const n = abbrevFlag ? parseInt(abbrevFlag, 10) : 7;
    out.line(`${best.name}-${best.distance}-g${short(best.commit).slice(0, n)}`);
  },
};

const shortlog: CommandSpec = {
  name: 'shortlog', summary: 'Summarise commits grouped by author',
  syntax: 'git shortlog -sn',
  flags: [
    { long: 'summary', short: 's', arg: 'none' },
    { long: 'numbered', short: 'n', arg: 'none' },
  ],
  concepts: ['code-archaeology', 'history'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const head = headOid(repo);
    if (!head) throw E.noCommitsYet();

    const counts = new Map<string, number>();
    for (const oid of walk(repo, head)) {
      const name = readCommit(repo, oid).author.name;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    const rows = [...counts.entries()];
    if (hasFlag(args, 'numbered')) rows.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    else rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));

    for (const [name, count] of rows) out.line(`${String(count).padStart(6)}\t${name}`);
  },
};

/** All commit objects unreachable from any ref. */
export function unreachableCommits(repo: Repository): Oid[] {
  const reachable = new Set<Oid>();
  const push = (oid: Oid | null | undefined) => {
    if (!oid) return;
    const stack = [oid];
    while (stack.length) {
      const cur = stack.pop()!;
      if (reachable.has(cur) || !repo.objects[cur]) continue;
      reachable.add(cur);
      const obj = repo.objects[cur];
      if (obj.type === 'commit') stack.push(...obj.parents);
      else if (obj.type === 'tag') stack.push(obj.object);
    }
  };
  for (const ref of Object.values(repo.refs)) {
    if (ref.kind === 'direct') push(ref.target);
  }
  return Object.values(repo.objects)
    .filter((o) => o.type === 'commit' && !reachable.has(o.oid))
    .map((o) => o.oid)
    .sort();
}

const fsck: CommandSpec = {
  name: 'fsck', summary: 'Find objects no ref can reach',
  syntax: 'git fsck', flags: [], concepts: ['nothing-lost', 'object-database'],
  handler: ({ world, out }) => {
    const repo = requireRepo(world);
    out.line('Checking object directories: 100% (256/256), done.');
    for (const oid of unreachableCommits(repo)) out.line(`dangling commit ${oid}`);
  },
};

/** Commits reachable from `bad` but not from any commit in `goods`. */
function commitsBetween(repo: Repository, goods: Oid[], bad: Oid): Oid[] {
  const excluded = new Set<Oid>();
  const stack = [...goods];
  while (stack.length) {
    const oid = stack.pop()!;
    if (excluded.has(oid) || !repo.objects[oid]) continue;
    excluded.add(oid);
    stack.push(...readCommit(repo, oid).parents);
  }
  const out: Oid[] = [];
  const seen = new Set<Oid>();
  const pending = [bad];
  while (pending.length) {
    const oid = pending.pop()!;
    if (seen.has(oid) || excluded.has(oid) || !repo.objects[oid]) continue;
    seen.add(oid);
    out.push(oid);
    pending.push(...readCommit(repo, oid).parents);
  }
  return out.sort((a, b) => readCommit(repo, a).committer.timestamp - readCommit(repo, b).committer.timestamp);
}

/** Picks the next commit to test, checks it out so the learner can judge it, or
 *  announces the first bad commit when nothing is left to test. */
function advanceBisect(repo: Repository, out: { line: (...s: string[]) => void }): void {
  const b = repo.bisect;
  if (!b.bad) { out.line('status: waiting for both good and bad commits'); return; }
  if (!b.good.length) { out.line('status: waiting for good commits'); return; }

  const candidates = commitsBetween(repo, b.good, b.bad).filter((c) => c !== b.bad);
  b.remaining = candidates;

  if (!candidates.length) {
    const c = readCommit(repo, b.bad);
    b.current = b.bad;
    b.remaining = [];
    out.line(
      `${b.bad} is the first bad commit`,
      `commit ${b.bad}`,
      `Author: ${c.author.name} <${c.author.email}>`,
      `Date:   ${formatDate(c.author.timestamp)}`,
      '',
      `    ${firstLine(c.message)}`,
    );
    return;
  }

  const mid = candidates[Math.floor(candidates.length / 2)];
  b.current = mid;
  const from = headOid(repo);
  checkoutTree(repo, from, mid, { force: true });
  setHeadDetached(repo, mid, `bisect: checkout ${short(mid)}`);
  const steps = Math.max(1, Math.ceil(Math.log2(candidates.length + 1)));
  out.line(
    `Bisecting: ${candidates.length} revision${candidates.length === 1 ? '' : 's'} left to test` +
      ` after this (roughly ${steps} steps)`,
    `[${short(mid)}] ${firstLine(readCommit(repo, mid).message)}`,
  );
}

const bisect: CommandSpec = {
  name: 'bisect', summary: 'Binary-search history for the commit that introduced a bug',
  syntax: 'git bisect start  |  git bisect good  |  git bisect bad  |  git bisect reset',
  flags: [],
  concepts: ['code-archaeology', 'nothing-lost', 'dag'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const [sub, revArg] = args.positionals;
    const b = repo.bisect;
    const head = headOid(repo);

    if (sub === 'start') {
      if (!head) throw E.noCommitsYet();
      repo.bisect = {
        good: [], bad: null, remaining: [], current: null,
        origHead: head, origBranch: currentBranchRef(repo),
      };
      out.line('status: waiting for both good and bad commits');
      return;
    }

    if (sub === 'reset') {
      if (!b.origHead) throw E.shell('fatal: no bisect in progress');
      const from = headOid(repo);
      const restore = b.origHead;
      checkoutTree(repo, from, restore, { force: true });
      if (b.origBranch && repo.refs[b.origBranch]) {
        setHeadToBranch(repo, b.origBranch, 'bisect: reset');
      } else {
        setHeadDetached(repo, restore, 'bisect: reset');
      }
      repo.bisect = { good: [], bad: null, remaining: [], current: null, origHead: null, origBranch: null };
      out.line(`Previous HEAD position was ${short(restore)} ${firstLine(readCommit(repo, restore).message)}`);
      out.line('Your branch and working tree are back to normal.');
      return;
    }

    if (sub !== 'good' && sub !== 'bad') {
      throw E.shell(`error: unknown bisect subcommand: ${sub ?? ''}`);
    }
    // origHead doubles as the "bisect is running" marker.
    if (!b.origHead) throw E.shell("error: You need to start by 'git bisect start'");

    const target = revArg ? revParse(repo, revArg) : (b.current ?? head);
    if (!target) throw E.noCommitsYet();

    if (sub === 'good') {
      if (!b.good.includes(target)) b.good.push(target);
    } else {
      b.bad = target;
    }
    b.remaining = b.remaining.filter((c) => c !== target);
    advanceBisect(repo, out);
  },
};

/** walkHistory without importing it at the top twice. */
function walk(repo: Repository, head: Oid): Oid[] {
  const out: Oid[] = [];
  const seen = new Set<Oid>();
  const stack = [head];
  while (stack.length) {
    const oid = stack.pop()!;
    if (seen.has(oid) || !repo.objects[oid]) continue;
    seen.add(oid);
    out.push(oid);
    stack.push(...readCommit(repo, oid).parents);
  }
  return out.sort((a, b) => readCommit(repo, b).committer.timestamp - readCommit(repo, a).committer.timestamp);
}

register(blame, describe, shortlog, fsck, bisect);
