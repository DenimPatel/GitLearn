import { readCommit, short } from './objects';
import type { Oid, Ref, RefName, ReflogEntry, Repository } from './types';
import { signature } from './clock';

export const HEAD = 'HEAD';
export const headsPrefix = 'refs/heads/';
export const tagsPrefix = 'refs/tags/';
export const remotesPrefix = 'refs/remotes/';

export const branchRef = (name: string): RefName => headsPrefix + name;
export const tagRef = (name: string): RefName => tagsPrefix + name;
export const remoteRef = (remote: string, branch: string): RefName =>
  `${remotesPrefix}${remote}/${branch}`;

/** 'refs/heads/main' -> 'main', 'refs/remotes/origin/main' -> 'origin/main' */
export function shortenRef(ref: RefName): string {
  if (ref.startsWith(headsPrefix)) return ref.slice(headsPrefix.length);
  if (ref.startsWith(tagsPrefix)) return ref.slice(tagsPrefix.length);
  if (ref.startsWith(remotesPrefix)) return ref.slice(remotesPrefix.length);
  return ref;
}

export function getRef(repo: Repository, name: RefName): Ref | undefined {
  return repo.refs[name];
}

/** Follows symbolic refs to the ref that actually holds an oid.
 *  For a repo on an unborn branch this returns the branch ref that does not exist yet. */
export function resolveSymbolic(repo: Repository, name: RefName): RefName {
  let cur = name;
  for (let i = 0; i < 10; i++) {
    const r = repo.refs[cur];
    if (r && r.kind === 'symbolic') cur = r.target;
    else return cur;
  }
  return cur;
}

export function resolveRefToOid(repo: Repository, name: RefName): Oid | null {
  const target = resolveSymbolic(repo, name);
  const r = repo.refs[target];
  return r && r.kind === 'direct' ? r.target : null;
}

export const headOid = (repo: Repository): Oid | null => resolveRefToOid(repo, HEAD);

export function isDetached(repo: Repository): boolean {
  const r = repo.refs[HEAD];
  return !!r && r.kind === 'direct';
}

/** The branch HEAD is on, as a full ref name, or null when detached. */
export function currentBranchRef(repo: Repository): RefName | null {
  const r = repo.refs[HEAD];
  if (!r || r.kind !== 'symbolic') return null;
  return r.target;
}

export function currentBranchName(repo: Repository): string | null {
  const ref = currentBranchRef(repo);
  return ref ? shortenRef(ref) : null;
}

/** What `git status` and the prompt display: a branch name, or "HEAD detached at abc1234". */
export function headLabel(repo: Repository): string {
  const branch = currentBranchName(repo);
  if (branch) return branch;
  const oid = headOid(repo);
  return oid ? `HEAD detached at ${short(oid)}` : 'HEAD';
}

export function listRefs(repo: Repository, prefix: string): { name: RefName; short: string; oid: Oid }[] {
  return Object.entries(repo.refs)
    .filter(([n, r]) => n.startsWith(prefix) && r.kind === 'direct')
    .map(([n, r]) => ({ name: n, short: shortenRef(n), oid: (r as { target: Oid }).target }))
    .sort((a, b) => (a.short < b.short ? -1 : 1));
}

export const listBranches = (repo: Repository) => listRefs(repo, headsPrefix);
export const listTags = (repo: Repository) => listRefs(repo, tagsPrefix);
export const listRemoteRefs = (repo: Repository) => listRefs(repo, remotesPrefix);

function appendReflog(repo: Repository, ref: RefName, entry: ReflogEntry) {
  if (!repo.reflogs[ref]) repo.reflogs[ref] = [];
  repo.reflogs[ref].unshift(entry);
}

/** Writes a ref and appends a reflog entry to it — and, when the ref is what
 *  HEAD points at, to HEAD's reflog too. Every ref movement in the engine goes
 *  through here, which is what makes `git reflog` complete rather than partial. */
export function updateRef(repo: Repository, name: RefName, oid: Oid, message: string): void {
  const target = resolveSymbolic(repo, name);
  const before = resolveRefToOid(repo, target);
  repo.refs[target] = { kind: 'direct', target: oid };
  const who = { ...signature(repo), timestamp: repo.clock };
  appendReflog(repo, target, { before, after: oid, who, message });
  const headTarget = resolveSymbolic(repo, HEAD);
  if (headTarget === target && name !== HEAD) {
    appendReflog(repo, HEAD, { before, after: oid, who, message });
  }
  if (name === HEAD && headTarget !== HEAD) {
    appendReflog(repo, HEAD, { before, after: oid, who, message });
  }
}

/** Points HEAD at a branch without moving the branch (git switch / checkout <branch>). */
export function setHeadToBranch(repo: Repository, ref: RefName, message: string): void {
  const before = headOid(repo);
  repo.refs[HEAD] = { kind: 'symbolic', target: ref };
  const after = resolveRefToOid(repo, ref);
  if (after) {
    appendReflog(repo, HEAD, {
      before, after, who: { ...signature(repo), timestamp: repo.clock }, message,
    });
  }
}

/** Detaches HEAD at a commit (git checkout <oid>). */
export function setHeadDetached(repo: Repository, oid: Oid, message: string): void {
  const before = headOid(repo);
  repo.refs[HEAD] = { kind: 'direct', target: oid };
  appendReflog(repo, HEAD, {
    before, after: oid, who: { ...signature(repo), timestamp: repo.clock }, message,
  });
}

export function deleteRef(repo: Repository, name: RefName): void {
  delete repo.refs[name];
  delete repo.reflogs[name];
  delete repo.upstream[name];
}

/**
 * All commits reachable from a set of tips, in topological order: a commit is
 * never emitted before a commit that descends from it. Among commits that are
 * ready, the newest goes first, with the oid as a final tiebreak so the order
 * is fully deterministic.
 *
 * The topological guarantee matters: when a branch tip is also an ancestor of
 * another tip (a branch that is simply behind), a date-only sort can place the
 * parent above its own child, which draws a visibly wrong graph.
 */
export function walkHistory(repo: Repository, tips: Oid[]): Oid[] {
  const reachable = new Set<Oid>();
  const stack = tips.filter((t) => repo.objects[t]?.type === 'commit');
  while (stack.length) {
    const oid = stack.pop()!;
    if (reachable.has(oid) || repo.objects[oid]?.type !== 'commit') continue;
    reachable.add(oid);
    stack.push(...readCommit(repo, oid).parents);
  }

  // In-degree here counts children within the reachable set.
  const pendingChildren = new Map<Oid, number>();
  for (const oid of reachable) pendingChildren.set(oid, 0);
  for (const oid of reachable) {
    for (const p of readCommit(repo, oid).parents) {
      if (reachable.has(p)) pendingChildren.set(p, (pendingChildren.get(p) ?? 0) + 1);
    }
  }

  const newestFirst = (a: Oid, b: Oid) =>
    readCommit(repo, b).committer.timestamp - readCommit(repo, a).committer.timestamp
    || (a < b ? -1 : a > b ? 1 : 0);

  const ready = [...reachable].filter((oid) => pendingChildren.get(oid) === 0);
  const out: Oid[] = [];
  while (ready.length) {
    ready.sort(newestFirst);
    const oid = ready.shift()!;
    out.push(oid);
    for (const p of readCommit(repo, oid).parents) {
      if (!reachable.has(p)) continue;
      const remaining = (pendingChildren.get(p) ?? 0) - 1;
      pendingChildren.set(p, remaining);
      if (remaining === 0) ready.push(p);
    }
  }
  return out;
}

/** Every ref (and HEAD) that points at a given commit — used for graph labels. */
export function refsAt(repo: Repository, oid: Oid): { label: string; kind: 'head' | 'branch' | 'tag' | 'remote' }[] {
  const out: { label: string; kind: 'head' | 'branch' | 'tag' | 'remote' }[] = [];
  for (const [name, ref] of Object.entries(repo.refs)) {
    if (name === HEAD || ref.kind !== 'direct' || ref.target !== oid) continue;
    if (name.startsWith(headsPrefix)) out.push({ label: shortenRef(name), kind: 'branch' });
    else if (name.startsWith(tagsPrefix)) out.push({ label: shortenRef(name), kind: 'tag' });
    else if (name.startsWith(remotesPrefix)) out.push({ label: shortenRef(name), kind: 'remote' });
  }
  if (headOid(repo) === oid && isDetached(repo)) out.unshift({ label: 'HEAD', kind: 'head' });
  return out;
}
