/** Core data model for the Git simulator. Everything here is plain JSON-serializable
 *  data: no Map, no Set, no class instances. That is deliberate — it lets a whole
 *  world be snapshotted, persisted, and deep-compared for free. */

export type Oid = string; // 40-char lowercase hex

export interface BlobObject { type: 'blob'; oid: Oid; content: string }

export type TreeEntryMode = '100644' | '40000';
export interface TreeEntry { mode: TreeEntryMode; name: string; oid: Oid }
export interface TreeObject { type: 'tree'; oid: Oid; entries: TreeEntry[] }

export interface Signature { name: string; email: string; timestamp: number; tzOffset: string }

export interface CommitObject {
  type: 'commit';
  oid: Oid;
  tree: Oid;
  parents: Oid[];
  author: Signature;
  committer: Signature;
  message: string;
}

export interface TagObject {
  type: 'tag';
  oid: Oid;
  object: Oid;
  objectType: 'commit';
  tag: string;
  tagger: Signature;
  message: string;
}

export type GitObject = BlobObject | TreeObject | CommitObject | TagObject;
export type ObjectDb = Record<Oid, GitObject>;

/** Refs are always stored under their FULL name: refs/heads/main, refs/tags/v1,
 *  refs/remotes/origin/main. HEAD lives in the same store under the key 'HEAD'. */
export type RefName = string;
export type Ref =
  | { kind: 'direct'; target: Oid }
  | { kind: 'symbolic'; target: RefName };
export type RefStore = Record<RefName, Ref>;

/** 0 = merged. 1/2/3 = merge base / ours / theirs, present only while conflicted. */
export type Stage = 0 | 1 | 2 | 3;
export interface IndexEntry { path: string; oid: Oid; mode: TreeEntryMode; stage: Stage }
export interface Index { entries: IndexEntry[] }

/** path -> content. A deleted file is an absent key. */
export interface WorkTree { files: Record<string, string> }

export interface Config {
  'user.name': string;
  'user.email': string;
  'init.defaultBranch': string;
  [k: string]: string;
}

export interface ReflogEntry {
  before: Oid | null;
  after: Oid;
  who: Signature;
  message: string;
}

export interface RebaseStep { action: 'pick' | 'squash' | 'drop' | 'reword'; oid: Oid; label: string }

/** What real git keeps in .git/MERGE_HEAD, CHERRY_PICK_HEAD, rebase-merge/ etc. */
export type Operation =
  | { kind: 'none' }
  | { kind: 'merge'; theirs: Oid; theirsLabel: string; base: Oid | null; message: string }
  | { kind: 'cherry-pick'; picking: Oid; remaining: Oid[] }
  | { kind: 'revert'; reverting: Oid; message: string }
  | {
      kind: 'rebase';
      onto: Oid;
      origHead: Oid;
      origBranch: RefName | null;
      todo: RebaseStep[];
      done: Oid[];
      current: RebaseStep | null;
    };

export interface StashEntry { oid: Oid; message: string }

export interface RemoteConfig { url: string }

export interface Repository {
  initialized: boolean;
  bare: boolean;
  objects: ObjectDb;
  refs: RefStore;
  index: Index;
  worktree: WorkTree;
  reflogs: Record<RefName, ReflogEntry[]>; // newest first
  stash: StashEntry[]; // top of stack = index 0
  operation: Operation;
  config: Config;
  remotes: Record<string, RemoteConfig>;
  upstream: Record<RefName, RefName>; // refs/heads/main -> refs/remotes/origin/main
  clock: number; // virtual seconds
}

export interface PullRequest {
  id: number;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  status: 'open' | 'merged' | 'closed';
  commits: Oid[];
}

export interface World {
  local: Repository;
  origin: Repository | null;
  hosting: { pullRequests: PullRequest[] };
  /** Every command line that has run successfully, oldest first — what `history` reads. */
  history: string[];
}

/** Emitted by handlers so the UI can animate exactly what moved, and so lesson
 *  validators can assert on actions rather than only on end state. */
export type EngineEvent =
  | { type: 'repo-initialized' }
  | { type: 'file-written'; path: string }
  | { type: 'file-staged'; path: string }
  | { type: 'file-unstaged'; path: string }
  | { type: 'commit-created'; oid: Oid; parents: Oid[] }
  | { type: 'ref-moved'; ref: RefName; from: Oid | null; to: Oid }
  | { type: 'ref-created'; ref: RefName; at: Oid }
  | { type: 'ref-deleted'; ref: RefName }
  | { type: 'head-moved'; to: string; detached: boolean }
  | { type: 'merged'; strategy: 'fast-forward' | 'three-way'; from: string }
  | { type: 'conflict'; paths: string[] }
  | { type: 'conflict-resolved'; path: string }
  | { type: 'stash-pushed'; oid: Oid }
  | { type: 'stash-popped'; oid: Oid }
  | { type: 'rebase-started'; count: number }
  | { type: 'rebase-finished' }
  | { type: 'pushed'; ref: RefName; forced: boolean }
  | { type: 'fetched'; refs: RefName[] }
  | { type: 'cloned' }
  | { type: 'pr-opened'; id: number }
  | { type: 'pr-merged'; id: number };

export interface CommandResult {
  world: World;
  command: string;
  stdout: string[];
  stderr: string[];
  exitCode: number;
  events: EngineEvent[];
}
