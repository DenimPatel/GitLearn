
export type Command = 'INIT' | 'CREATE_FILE' | 'MODIFY_FILE' | 'ADD' | 'COMMIT' | 'BRANCH' | 'CHECKOUT' | 'MERGE' | 'RESET';

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

export interface RepoState {
  isInitialized: boolean;
  workingDirectory: Record<string, File>;
  stagingArea: Record<string, File>;
  commits: Record<string, Commit>;
  branches: Record<string, string>; // branch name -> commit id
  HEAD: Head;
}

export interface Lesson {
  id: string;
  title: string;
  explanation: string;
  allowedCommands: Command[];
  completionCondition: (state: RepoState) => boolean;
  setupCommands?: Action[];
}
