import type {
  BlobObject, CommitObject, GitObject, Oid, Repository, Signature,
  TagObject, TreeEntry, TreeObject,
} from './types';
import { sha1, utf8Bytes, type Bytes } from './sha1';

/** Serializes an object into git's exact on-disk payload (minus zlib), so the
 *  hashes we produce are the hashes real git produces. */
function payloadBytes(o: Omit<BlobObject, 'oid'> | Omit<TreeObject, 'oid'> |
                         Omit<CommitObject, 'oid'> | Omit<TagObject, 'oid'>): Bytes {
  switch (o.type) {
    case 'blob':
      return utf8Bytes(o.content);
    case 'tree': {
      // mode<space>name\0<20 raw bytes of oid>, entries sorted git-style.
      const out: Bytes = [];
      for (const e of sortTreeEntries(o.entries)) {
        out.push(...utf8Bytes(`${e.mode} ${e.name}`), 0);
        for (let i = 0; i < 40; i += 2) out.push(parseInt(e.oid.slice(i, i + 2), 16));
      }
      return out;
    }
    case 'commit': {
      const lines: string[] = [`tree ${o.tree}`];
      for (const p of o.parents) lines.push(`parent ${p}`);
      lines.push(`author ${sigText(o.author)}`);
      lines.push(`committer ${sigText(o.committer)}`);
      lines.push('');
      lines.push(o.message.endsWith('\n') ? o.message : o.message + '\n');
      return utf8Bytes(lines.join('\n'));
    }
    case 'tag': {
      const lines = [
        `object ${o.object}`, `type ${o.objectType}`, `tag ${o.tag}`,
        `tagger ${sigText(o.tagger)}`, '',
        o.message.endsWith('\n') ? o.message : o.message + '\n',
      ];
      return utf8Bytes(lines.join('\n'));
    }
  }
}

const sigText = (s: Signature) => `${s.name} <${s.email}> ${s.timestamp} ${s.tzOffset}`;

/** Git sorts tree entries by name, with directory names compared as if they
 *  ended in '/'. Getting this wrong changes every tree hash. */
export function sortTreeEntries(entries: TreeEntry[]): TreeEntry[] {
  const key = (e: TreeEntry) => (e.mode === '40000' ? e.name + '/' : e.name);
  return [...entries].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

export type ObjectInput =
  | { type: 'blob'; content: string }
  | { type: 'tree'; entries: TreeEntry[] }
  | { type: 'commit'; tree: Oid; parents: Oid[]; author: Signature; committer: Signature; message: string }
  | { type: 'tag'; object: Oid; objectType: 'commit'; tag: string; tagger: Signature; message: string };

/** hash = sha1("<type> <bytelen>\0" + payload) — git's real format. */
export function hashObject(input: ObjectInput): Oid {
  const body = payloadBytes(input as never);
  const header = utf8Bytes(`${input.type} ${body.length}\0`);
  // utf8Bytes turns \0 into a 0 byte, which is what we want.
  return sha1([...header, ...body]);
}

/** Interns an object into the database and returns its id. Writing the same
 *  content twice yields the same oid and stores one object — which is exactly
 *  the blob-dedup behavior Lesson 7 demonstrates. */
export function writeObject(repo: Repository, input: ObjectInput): Oid {
  const oid = hashObject(input);
  if (!repo.objects[oid]) {
    repo.objects[oid] = { ...(input as object), oid } as GitObject;
    if (input.type === 'tree') {
      (repo.objects[oid] as TreeObject).entries = sortTreeEntries(input.entries);
    }
  }
  return oid;
}

export function readObject(repo: Repository, oid: Oid): GitObject | undefined {
  return repo.objects[oid];
}

export function readCommit(repo: Repository, oid: Oid): CommitObject {
  const o = repo.objects[oid];
  if (!o || o.type !== 'commit') throw new Error(`not a commit: ${oid}`);
  return o;
}

export function readTree(repo: Repository, oid: Oid): TreeObject {
  const o = repo.objects[oid];
  if (!o || o.type !== 'tree') throw new Error(`not a tree: ${oid}`);
  return o;
}

export function readBlob(repo: Repository, oid: Oid): BlobObject {
  const o = repo.objects[oid];
  if (!o || o.type !== 'blob') throw new Error(`not a blob: ${oid}`);
  return o;
}

export const short = (oid: Oid): string => oid.slice(0, 7);

export function firstLine(message: string): string {
  return message.split('\n')[0];
}

/** Renders an object the way `git cat-file -p` does. */
export function prettyPrint(repo: Repository, oid: Oid): string[] {
  const o = readObject(repo, oid);
  if (!o) return [];
  switch (o.type) {
    case 'blob':
      return o.content.split('\n');
    case 'tree':
      return o.entries.map((e) =>
        `${e.mode === '40000' ? '040000 tree' : '100644 blob'} ${e.oid}\t${e.name}`);
    case 'commit':
      return [
        `tree ${o.tree}`,
        ...o.parents.map((p) => `parent ${p}`),
        `author ${sigText(o.author)}`,
        `committer ${sigText(o.committer)}`,
        '',
        ...o.message.split('\n'),
      ];
    case 'tag':
      return [
        `object ${o.object}`, `type ${o.objectType}`, `tag ${o.tag}`,
        `tagger ${sigText(o.tagger)}`, '', ...o.message.split('\n'),
      ];
  }
}
