import { readCommit } from './objects';
import { E } from './errors';
import { HEAD, branchRef, headOid, remotesPrefix, resolveRefToOid, tagRef } from './refs';
import type { GitObject, Oid, Repository } from './types';

/**
 * Resolves a revision string to a commit id.
 * Supported grammar: HEAD, a branch/tag/remote-tracking name, a full or
 * abbreviated oid, ~n, ^n, @{n} (reflog), @{-1} (previous branch), stash@{n}.
 * Anything else gets git's real "unknown revision" error rather than a guess.
 */
export function revParse(repo: Repository, rev: string): Oid {
  const oid = tryRevParse(repo, rev);
  if (!oid) throw E.unknownRevision(rev);
  return oid;
}

export function tryRevParse(repo: Repository, rev: string): Oid | null {
  if (!rev) return null;

  // Trailing ~n / ^n suffixes, applied right to left.
  const m = rev.match(/^(.*?)((?:[~^]\d*)+)$/);
  if (m && m[1]) {
    let oid: Oid | null = tryRevParse(repo, m[1]);
    if (!oid) return null;
    const steps = m[2].match(/[~^]\d*/g) ?? [];
    for (const s of steps) {
      const n = s.length > 1 ? parseInt(s.slice(1), 10) : 1;
      if (s[0] === '~') {
        for (let i = 0; i < n; i++) {
          const c: GitObject | undefined = repo.objects[oid!];
          if (!c || c.type !== 'commit' || !c.parents.length) return null;
          oid = c.parents[0];
        }
      } else {
        const c: GitObject | undefined = repo.objects[oid!];
        if (!c || c.type !== 'commit') return null;
        const p: Oid | undefined = c.parents[n - 1];
        if (!p) return null;
        oid = p;
      }
    }
    return oid;
  }

  // Reflog and previous-branch syntax.
  const at = rev.match(/^(.*)@\{(-?\d+)\}$/);
  if (at) {
    const [, name, nRaw] = at;
    const n = parseInt(nRaw, 10);
    if (name === '' && n < 0) return null;
    if (name === 'stash') return repo.stash[n]?.oid ?? null;
    if (n < 0) {
      // @{-1}: the branch we were on before the current one.
      const log = repo.reflogs[HEAD] ?? [];
      let hops = -n;
      for (const entry of log) {
        const from = entry.message.match(/^checkout: moving from (\S+) to /);
        if (from && --hops === 0) return tryRevParse(repo, from[1]);
      }
      return null;
    }
    const full = name === '' || name === 'HEAD' ? HEAD : resolveRefName(repo, name);
    const log = full ? repo.reflogs[full] : undefined;
    return log?.[n]?.after ?? null;
  }

  if (rev === HEAD) return headOid(repo);

  const refName = resolveRefName(repo, rev);
  if (refName) {
    const oid = resolveRefToOid(repo, refName);
    if (oid) return derefTag(repo, oid);
  }

  // Full or abbreviated object id.
  if (/^[0-9a-f]{4,40}$/.test(rev)) {
    if (repo.objects[rev]) return derefTag(repo, rev);
    const matches = Object.keys(repo.objects).filter((o) => o.startsWith(rev));
    const commits = matches.filter((o) => repo.objects[o].type === 'commit');
    const pool = commits.length ? commits : matches;
    if (pool.length === 1) return derefTag(repo, pool[0]);
    if (pool.length > 1) throw E.ambiguousOid(rev);
  }

  return null;
}

/** An annotated tag resolves to the commit it points at. */
function derefTag(repo: Repository, oid: Oid): Oid {
  const o = repo.objects[oid];
  return o && o.type === 'tag' ? o.object : oid;
}

/** Maps a short name to a full ref name, in git's own precedence order. */
export function resolveRefName(repo: Repository, name: string): string | null {
  if (name === HEAD) return HEAD;
  for (const full of [name, tagRef(name), branchRef(name), remotesPrefix + name]) {
    if (repo.refs[full]) return full;
  }
  return null;
}

/** Commits reachable from `tip` but not from `exclude` — the `a..b` range. */
export function commitRange(repo: Repository, exclude: Oid | null, tip: Oid): Oid[] {
  const excluded = new Set<Oid>();
  if (exclude) {
    const stack = [exclude];
    while (stack.length) {
      const oid = stack.pop()!;
      if (excluded.has(oid) || !repo.objects[oid]) continue;
      excluded.add(oid);
      stack.push(...readCommit(repo, oid).parents);
    }
  }
  const out: Oid[] = [];
  const seen = new Set<Oid>();
  const stack = [tip];
  while (stack.length) {
    const oid = stack.pop()!;
    if (seen.has(oid) || excluded.has(oid) || !repo.objects[oid]) continue;
    seen.add(oid);
    out.push(oid);
    stack.push(...readCommit(repo, oid).parents);
  }
  // Oldest first, which is the order a rebase replays them in.
  return out.sort((a, b) => readCommit(repo, a).committer.timestamp - readCommit(repo, b).committer.timestamp);
}

export const isValidBranchName = (n: string): boolean =>
  /^[A-Za-z0-9._\-\/]+$/.test(n) && !n.startsWith('-') && !n.startsWith('/') && !n.endsWith('/') && !n.includes('..');
