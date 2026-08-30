
export type Command =
  | 'INIT' | 'CREATE_FILE' | 'MODIFY_FILE' | 'ADD' | 'COMMIT' | 'BRANCH' | 'CHECKOUT' | 'MERGE'
  | 'REMOTE_ADD' | 'PUSH' | 'PULL' | 'OPEN_PR' | 'MERGE_PR'
  | 'STATUS' | 'LOG' | 'DIFF'
  | 'DISCARD' | 'UNSTAGE' | 'AMEND' | 'REVERT'
  | 'IGNORE'
  | 'RESET';

export interface Action {
  type: Command;
  payload?: any;
}

export interface File {
  name: string;
  content: string;
}

export interface Commit {
  id: string;
  parents: string[];
  message: string;
  files: Record<string, File>;
}

export interface Head {
  type: 'branch' | 'commit'; // 'commit' for detached HEAD state
  name: string;
}

export interface PullRequest {
  id: string;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  status: 'open' | 'merged';
}

/** A simulated GitHub-hosted copy of the repo ("origin"). Only updated by push/pull/PR actions - it never changes on its own. */
export interface RemoteState {
  url: string | null;
  branches: Record<string, string>; // branch name -> commit id, as last pushed/merged
  commits: Record<string, Commit>;
  pullRequests: Record<string, PullRequest>;
}

export interface RepoState {
  isInitialized: boolean;
  workingDirectory: Record<string, File>;
  stagingArea: Record<string, File>;
  commits: Record<string, Commit>;
  branches: Record<string, string>; // branch name -> commit id
  HEAD: Head;
  remote: RemoteState;
  /** Every command type dispatched so far, in order. Lets lessons require a read-only command (e.g. STATUS) actually be run, since those don't otherwise change any state a completionCondition could observe. */
  commandsRun: Command[];
  /** Patterns from .gitignore (e.g. "*.log", "node_modules/"). Matching files are hidden from status/untracked listings and refused by ADD. */
  ignoredPatterns: string[];
}

export interface Lesson {
  id: string;
  title: string;
  explanation: string;
  allowedCommands: Command[];
  completionCondition: (state: RepoState) => boolean;
  setupCommands?: Action[];
}
