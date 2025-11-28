
import type { RepoState, Action, File, Commit } from '../types';
import { produce } from 'immer';

const createCommitId = () => Math.random().toString(36).substring(2, 8);

export const gitReducer = (state: RepoState, action: Action): { newState: RepoState, message: string } => {
  // Handle RESET separately as it replaces the entire state
  if (action.type === 'RESET') {
     return { newState: action.payload, message: 'State has been reset.' };
  }

  let message = 'Command executed successfully.';

  const newState = produce(state, (draft) => {
    switch (action.type) {
      case 'INIT':
        if (draft.isInitialized) {
          message = 'Repository is already initialized.';
        } else {
          draft.isInitialized = true;
          message = 'Initialized empty Git repository.';
        }
        break;

      case 'CREATE_FILE':
        const newFile: File = action.payload || { name: 'new-file.txt', content: 'content' };
        if (draft.workingDirectory[newFile.name]) {
          message = `File '${newFile.name}' already exists.`;
        } else {
          draft.workingDirectory[newFile.name] = newFile;
          message = `Created file '${newFile.name}' in working directory.`;
        }
        break;

      case 'MODIFY_FILE':
        const fileNameToModify: string = action.payload || 'index.html';
        if (draft.workingDirectory[fileNameToModify]) {
          draft.workingDirectory[fileNameToModify].content += '\n// modified';
          message = `Modified file '${fileNameToModify}'.`;
        } else {
          message = `File '${fileNameToModify}' not found in working directory.`;
        }
        break;

      case 'ADD':
        const fileNameToAdd: string = action.payload || 'index.html';
        const fileToAdd = draft.workingDirectory[fileNameToAdd];
        if (fileToAdd) {
          draft.stagingArea[fileNameToAdd] = { ...fileToAdd };
          message = `Staged changes for '${fileNameToAdd}'.`;
        } else {
          message = `File '${fileNameToAdd}' not found.`;
        }
        break;

      case 'COMMIT':
        if (Object.keys(draft.stagingArea).length === 0) {
          message = 'Nothing to commit, staging area is empty.';
          break;
        }
        const commitId = createCommitId();
        const parentCommitId = draft.branches[draft.HEAD.name] || null;
        
        const parentFiles = parentCommitId ? draft.commits[parentCommitId].files : {};
        const newCommitFiles = { ...parentFiles, ...draft.stagingArea };

        const newCommit: Commit = {
          id: commitId,
          parents: parentCommitId ? [parentCommitId] : [],
          message: action.payload || `Commit ${commitId}`,
          files: newCommitFiles
        };

        draft.commits[commitId] = newCommit;
        draft.branches[draft.HEAD.name] = commitId;
        draft.stagingArea = {};
        
        // Update working directory files to reflect committed state
        Object.keys(newCommit.files).forEach(name => {
            draft.workingDirectory[name] = newCommit.files[name];
        });
        
        message = `Committed changes with ID [${commitId}].`;
        break;

      case 'BRANCH':
        const newBranchName: string = action.payload || 'new-branch';
        if (draft.branches[newBranchName]) {
          message = `Branch '${newBranchName}' already exists.`;
        } else {
          const currentCommitId = draft.branches[draft.HEAD.name];
          if (!currentCommitId) {
             message = `Cannot create branch. No commits yet.`;
             break;
          }
          draft.branches[newBranchName] = currentCommitId;
          message = `Created new branch '${newBranchName}'.`;
        }
        break;

      case 'CHECKOUT':
        const branchToCheckout: string = action.payload;
        if (draft.branches[branchToCheckout]) {
          draft.HEAD = { type: 'branch', name: branchToCheckout };
          message = `Switched to branch '${branchToCheckout}'.`;
        } else {
          message = `Branch '${branchToCheckout}' not found.`;
        }
        break;
      
      case 'MERGE':
        const sourceBranchName: string = action.payload;
        if (!draft.branches[sourceBranchName]) {
          message = `Branch '${sourceBranchName}' not found.`;
          break;
        }

        const targetBranchName = draft.HEAD.name;
        if (sourceBranchName === targetBranchName) {
          message = 'Cannot merge a branch into itself.';
          break;
        }

        const sourceCommitId = draft.branches[sourceBranchName];
        const targetCommitId = draft.branches[targetBranchName];

        if (sourceCommitId === targetCommitId) {
            message = `Branch '${targetBranchName}' is already up to date with '${sourceBranchName}'.`;
            break;
        }
        
        // This simplified merge assumes no conflicts and source branch's file versions take precedence.
        const sourceCommitFiles = draft.commits[sourceCommitId].files;
        const targetCommitFiles = draft.commits[targetCommitId].files;
        const mergedFiles = { ...targetCommitFiles, ...sourceCommitFiles };

        const mergeCommitId = createCommitId();
        const mergeCommit: Commit = {
          id: mergeCommitId,
          parents: [targetCommitId, sourceCommitId],
          message: `Merge branch '${sourceBranchName}' into '${targetBranchName}'`,
          files: mergedFiles
        };

        draft.commits[mergeCommitId] = mergeCommit;
        draft.branches[targetBranchName] = mergeCommitId;
        draft.workingDirectory = { ...mergedFiles };
        draft.stagingArea = {};

        message = `Merged branch '${sourceBranchName}' into '${targetBranchName}'.`;
        break;

      default:
        message = `Unknown command: ${action.type}`;
        break;
    }
  });
  
  return { newState, message };
};
