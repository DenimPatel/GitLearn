
import type { RepoState, Action, File, Commit } from '../types';
import { produce } from 'immer';

const createCommitId = () => Math.random().toString(36).substring(2, 8);

/** Walks a commit and all of its ancestors (following every parent, so merge commits are included). */
const collectCommitChain = (tipId: string, commits: Record<string, Commit>): string[] => {
  const chain: string[] = [];
  const stack = [tipId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const commit = commits[id];
    if (!commit) continue;
    chain.push(id);
    commit.parents.forEach(parentId => stack.push(parentId));
  }
  return chain;
};

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

      case 'REMOTE_ADD': {
        const url: string = action.payload || 'https://github.com/you/your-repo.git';
        if (draft.remote.url) {
          message = `Remote 'origin' already exists. (Currently: ${draft.remote.url})`;
        } else {
          draft.remote.url = url;
          message = `Added remote 'origin' -> ${url}`;
        }
        break;
      }

      case 'PUSH': {
        const branchToPush: string = action.payload || draft.HEAD.name;
        if (!draft.remote.url) {
          message = `No remote 'origin'. Run 'git remote add origin <url>' first.`;
          break;
        }
        const localTipId = draft.branches[branchToPush];
        if (!localTipId) {
          message = `Branch '${branchToPush}' not found locally.`;
          break;
        }
        const chain = collectCommitChain(localTipId, draft.commits);
        chain.forEach(id => { draft.remote.commits[id] = draft.commits[id]; });
        draft.remote.branches[branchToPush] = localTipId;
        message = `Pushed '${branchToPush}' to origin (${chain.length} commit${chain.length === 1 ? '' : 's'}).`;
        break;
      }

      case 'PULL': {
        const branchToPull: string = action.payload || draft.HEAD.name;
        if (!draft.remote.url) {
          message = `No remote 'origin'. Run 'git remote add origin <url>' first.`;
          break;
        }
        const remoteTipId = draft.remote.branches[branchToPull];
        if (!remoteTipId) {
          message = `Branch '${branchToPull}' not found on origin.`;
          break;
        }
        if (draft.branches[branchToPull] === remoteTipId) {
          message = `Already up to date.`;
          break;
        }
        const chain = collectCommitChain(remoteTipId, draft.remote.commits);
        chain.forEach(id => { draft.commits[id] = draft.remote.commits[id]; });
        draft.branches[branchToPull] = remoteTipId;
        if (draft.HEAD.type === 'branch' && draft.HEAD.name === branchToPull) {
          draft.workingDirectory = { ...draft.commits[remoteTipId].files };
          draft.stagingArea = {};
        }
        message = `Pulled '${branchToPull}' from origin (fast-forward, ${chain.length} commit${chain.length === 1 ? '' : 's'}).`;
        break;
      }

      case 'OPEN_PR': {
        const title: string = action.payload || `Update from ${draft.HEAD.name}`;
        const sourceBranch = draft.HEAD.name;
        const targetBranch = 'main';
        if (sourceBranch === targetBranch) {
          message = `Cannot open a pull request from 'main' into itself. Checkout a feature branch first.`;
          break;
        }
        if (!draft.remote.branches[sourceBranch]) {
          message = `Branch '${sourceBranch}' hasn't been pushed to origin yet. Run 'git push origin ${sourceBranch}' first.`;
          break;
        }
        if (!draft.remote.branches[targetBranch]) {
          message = `Branch '${targetBranch}' hasn't been pushed to origin yet. Run 'git push origin ${targetBranch}' first.`;
          break;
        }
        const alreadyOpen = Object.values(draft.remote.pullRequests).some(
          pr => pr.status === 'open' && pr.sourceBranch === sourceBranch && pr.targetBranch === targetBranch
        );
        if (alreadyOpen) {
          message = `A pull request from '${sourceBranch}' into '${targetBranch}' is already open.`;
          break;
        }
        const prId = `PR-${Object.keys(draft.remote.pullRequests).length + 1}`;
        draft.remote.pullRequests[prId] = { id: prId, title, sourceBranch, targetBranch, status: 'open' };
        message = `Opened pull request ${prId}: '${sourceBranch}' → '${targetBranch}'.`;
        break;
      }

      case 'MERGE_PR': {
        const prId: string | undefined = action.payload;
        const targetPr = prId
          ? draft.remote.pullRequests[prId]
          : Object.values(draft.remote.pullRequests).find(pr => pr.status === 'open');
        if (!targetPr) {
          message = `No open pull request to merge.`;
          break;
        }
        const sourceCommitId = draft.remote.branches[targetPr.sourceBranch];
        const targetCommitId = draft.remote.branches[targetPr.targetBranch];
        if (!sourceCommitId || !targetCommitId) {
          message = `Cannot merge pull request: a branch is missing on origin.`;
          break;
        }
        const mergeCommitId = createCommitId();
        const sourceCommitFiles = draft.remote.commits[sourceCommitId].files;
        const targetCommitFiles = draft.remote.commits[targetCommitId].files;
        const mergedFiles = { ...targetCommitFiles, ...sourceCommitFiles };

        draft.remote.commits[mergeCommitId] = {
          id: mergeCommitId,
          parents: [targetCommitId, sourceCommitId],
          message: `Merge pull request ${targetPr.id} from '${targetPr.sourceBranch}'`,
          files: mergedFiles,
        };
        draft.remote.branches[targetPr.targetBranch] = mergeCommitId;
        targetPr.status = 'merged';
        message = `Merged pull request ${targetPr.id} on GitHub. Run 'git pull origin ${targetPr.targetBranch}' to sync locally.`;
        break;
      }

      default:
        message = `Unknown command: ${action.type}`;
        break;
    }
  });
  
  return { newState, message };
};
