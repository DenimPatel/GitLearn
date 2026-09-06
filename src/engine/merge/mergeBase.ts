import { readCommit } from '../objects';
import type { Oid, Repository } from '../types';

function ancestors(repo: Repository, tip: Oid): Set<Oid> {
  const seen = new Set<Oid>();
  const stack = [tip];
  while (stack.length) {
    const oid = stack.pop()!;
    if (seen.has(oid) || !repo.objects[oid]) continue;
    seen.add(oid);
    for (const p of readCommit(repo, oid).parents) stack.push(p);
  }
  return seen;
}

export function isAncestor(repo: Repository, maybeAncestor: Oid, descendant: Oid): boolean {
  return ancestors(repo, descendant).has(maybeAncestor);
}

/** Common ancestors that are not themselves ancestors of another common ancestor. */
export function mergeBases(repo: Repository, a: Oid, b: Oid): Oid[] {
  const ra = ancestors(repo, a);
  const rb = ancestors(repo, b);
  const common = [...ra].filter((c) => rb.has(c));
  return common.filter((c) => !common.some((o) => o !== c && isAncestor(repo, c, o)));
}

/** Criss-cross histories have several bases; we take the first and never build a
 *  lesson on the difference. Real git would merge the bases recursively. */
export function mergeBase(repo: Repository, a: Oid, b: Oid): Oid | null {
  return mergeBases(repo, a, b)[0] ?? null;
}
