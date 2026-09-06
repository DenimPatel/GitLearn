import { readTree, writeObject } from './objects';
import type { Index, Oid, Repository, TreeEntry } from './types';

/** A tree flattened to path -> blob oid, which is the shape every comparison
 *  in the engine (status, diff, merge) actually wants. */
export type FlatTree = Record<string, Oid>;

export function flattenTree(repo: Repository, treeOid: Oid | null, prefix = ''): FlatTree {
  if (!treeOid) return {};
  const out: FlatTree = {};
  for (const e of readTree(repo, treeOid).entries) {
    const p = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.mode === '40000') Object.assign(out, flattenTree(repo, e.oid, p));
    else out[p] = e.oid;
  }
  return out;
}

export function treeOfCommit(repo: Repository, commitOid: Oid | null): Oid | null {
  if (!commitOid) return null;
  const o = repo.objects[commitOid];
  return o && o.type === 'commit' ? o.tree : null;
}

export const flatTreeOfCommit = (repo: Repository, commitOid: Oid | null): FlatTree =>
  flattenTree(repo, treeOfCommit(repo, commitOid));

/** Builds nested tree objects from a flat path -> oid map and returns the root oid. */
export function writeFlatTree(repo: Repository, flat: FlatTree): Oid {
  interface Node { files: Record<string, Oid>; dirs: Record<string, Node> }
  const root: Node = { files: {}, dirs: {} };

  for (const [path, oid] of Object.entries(flat)) {
    const parts = path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      node.dirs[parts[i]] ??= { files: {}, dirs: {} };
      node = node.dirs[parts[i]];
    }
    node.files[parts[parts.length - 1]] = oid;
  }

  const build = (node: Node): Oid => {
    const entries: TreeEntry[] = [
      ...Object.entries(node.files).map(([name, oid]) => ({ mode: '100644' as const, name, oid })),
      ...Object.entries(node.dirs).map(([name, sub]) => ({ mode: '40000' as const, name, oid: build(sub) })),
    ];
    return writeObject(repo, { type: 'tree', entries });
  };
  return build(root);
}

/** The tree the next commit would have. Only stage-0 entries participate, which
 *  is why an unresolved conflict cannot be committed. */
export function writeTreeFromIndex(repo: Repository, index: Index = repo.index): Oid {
  const flat: FlatTree = {};
  for (const e of index.entries) if (e.stage === 0) flat[e.path] = e.oid;
  return writeFlatTree(repo, flat);
}
