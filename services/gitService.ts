
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

/** Finds a commit both tips descend from, by walking outward from `bId` until it hits an ancestor of `aId`. Not guaranteed to be the *lowest* common ancestor in exotic histories, but correct for the simple branch/merge shapes this simulator builds. */
const findMergeBase = (aId: string, bId: string, commits: Record<string, Commit>): string | null => {
  const ancestorsOfA = new Set(collectCommitChain(aId, commits));
  const stack = [bId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    if (ancestorsOfA.has(id)) return id;
    commits[id]?.parents.forEach(parentId => stack.push(parentId));
  }
  return null;
};

/** A simplified .gitignore matcher: exact names, "*.ext" suffix wildcards, and "dir/" prefix patterns. Not full glob semantics, but covers the common beginner cases. */
export const isIgnored = (fileName: string, patterns: string[]): boolean =>
  patterns.some(pattern => {
    if (pattern === fileName) return true;
    if (pattern.startsWith('*.')) return fileName.endsWith(pattern.slice(1));
    if (pattern.endsWith('/')) return fileName.startsWith(pattern);
    return false;
  });

/** A minimal line-based diff: skips matching lines at the start and end, and shows everything in between as removed/added. Good enough for this simulator's simple content mutations. */
const diffLines = (oldContent: string, newContent: string): string[] => {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start++;
  let endOld = oldLines.length - 1;
  let endNew = newLines.length - 1;
  while (endOld >= start && endNew >= start && oldLines[endOld] === newLines[endNew]) {
    endOld--;
    endNew--;
  }
  const out: string[] = [];
  oldLines.slice(start, endOld + 1).forEach(l => out.push(`- ${l}`));
  newLines.slice(start, endNew + 1).forEach(l => out.push(`+ ${l}`));
  return out;
};

export const gitReducer = (state: RepoState, action: Action): { newState: RepoState, message: string } => {
  // Handle RESET separately as it replaces the entire state
  if (action.type === 'RESET') {
     return { newState: action.payload, message: 'State has been reset.' };
  }

  let message = 'Command executed successfully.';

  const newState = produce(state, (draft) => {
    draft.commandsRun.push(action.type);
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
        if (!fileToAdd) {
          message = `File '${fileNameToAdd}' not found.`;
        } else if (fileNameToAdd !== '.gitignore' && isIgnored(fileNameToAdd, draft.ignoredPatterns)) {
          message = `The following path is ignored by .gitignore: '${fileNameToAdd}'. (Use 'git add -f' to force it, but that's rarely what you want.)`;
        } else {
          draft.stagingArea[fileNameToAdd] = { ...fileToAdd };
          message = `Staged changes for '${fileNameToAdd}'.`;
        }
        break;

      case 'COMMIT': {
        if (draft.mergeInProgress) {
          const { sourceBranch, targetBranch, sourceCommitId, targetCommitId, conflictedFiles } = draft.mergeInProgress;
          const unresolved = conflictedFiles.filter(
            name => !draft.stagingArea[name] || draft.stagingArea[name].content.includes('<<<<<<<')
          );
          if (unresolved.length > 0) {
            message = `error: you have not concluded your merge (MERGE_HEAD exists). Resolve conflicts in ${unresolved.join(', ')} and stage them before committing.`;
            break;
          }
          const sourceFiles = draft.commits[sourceCommitId].files;
          const targetFiles = draft.commits[targetCommitId].files;
          const mergedFiles = { ...targetFiles, ...sourceFiles, ...draft.stagingArea };
          const mergeCommitId = createCommitId();
          draft.commits[mergeCommitId] = {
            id: mergeCommitId,
            parents: [targetCommitId, sourceCommitId],
            message: action.payload || `Merge branch '${sourceBranch}' into '${targetBranch}'`,
            files: mergedFiles,
          };
          draft.branches[targetBranch] = mergeCommitId;
          draft.stagingArea = {};
          Object.keys(mergedFiles).forEach(name => { draft.workingDirectory[name] = mergedFiles[name]; });
          draft.mergeInProgress = null;
          message = `Merge completed: created merge commit [${mergeCommitId}].`;
          break;
        }

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
      }

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
      
      case 'MERGE': {
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
        if (draft.mergeInProgress) {
          message = `A merge is already in progress. Resolve it and commit before starting another.`;
          break;
        }

        const sourceCommitId = draft.branches[sourceBranchName];
        const targetCommitId = draft.branches[targetBranchName];

        if (sourceCommitId === targetCommitId) {
            message = `Branch '${targetBranchName}' is already up to date with '${sourceBranchName}'.`;
            break;
        }

        const sourceCommitFiles = draft.commits[sourceCommitId].files;
        const targetCommitFiles = draft.commits[targetCommitId].files;
        const mergeBaseId = findMergeBase(sourceCommitId, targetCommitId, draft.commits);
        const baseFiles = mergeBaseId ? draft.commits[mergeBaseId].files : {};

        const allNames = new Set([...Object.keys(sourceCommitFiles), ...Object.keys(targetCommitFiles)]);
        const mergedFiles: Record<string, File> = {};
        const conflictedFiles: string[] = [];
        allNames.forEach(name => {
          const sourceContent = sourceCommitFiles[name]?.content;
          const targetContent = targetCommitFiles[name]?.content;
          const baseContent = baseFiles[name]?.content;
          if (sourceContent === targetContent) {
            mergedFiles[name] = targetCommitFiles[name] ?? sourceCommitFiles[name];
          } else if (targetContent === baseContent) {
            // target unchanged since the common ancestor -> take source's version
            mergedFiles[name] = sourceCommitFiles[name];
          } else if (sourceContent === baseContent) {
            // source unchanged since the common ancestor -> keep target's version
            mergedFiles[name] = targetCommitFiles[name];
          } else {
            // both branches changed this file differently since the common ancestor
            conflictedFiles.push(name);
            mergedFiles[name] = {
              name,
              content: `<<<<<<< HEAD (${targetBranchName})\n${targetContent ?? ''}\n=======\n${sourceContent ?? ''}\n>>>>>>> ${sourceBranchName}`,
            };
          }
        });

        if (conflictedFiles.length > 0) {
          draft.mergeInProgress = { sourceBranch: sourceBranchName, targetBranch: targetBranchName, sourceCommitId, targetCommitId, conflictedFiles };
          Object.entries(mergedFiles).forEach(([name, file]) => {
            draft.workingDirectory[name] = file;
            if (!conflictedFiles.includes(name)) draft.stagingArea[name] = file;
          });
          message = `Auto-merging non-conflicting files... CONFLICT (content): Merge conflict in ${conflictedFiles.join(', ')}. Resolve it, then 'git add' and 'git commit' to finish the merge.`;
          break;
        }

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
      }

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

      case 'STATUS': {
        if (!draft.isInitialized) {
          message = 'fatal: not a git repository (or any of the parent directories): .git';
          break;
        }
        const headCommitId = draft.branches[draft.HEAD.name];
        const lastCommitFiles = headCommitId ? draft.commits[headCommitId].files : {};
        const staged: string[] = [];
        const modified: string[] = [];
        const untracked: string[] = [];
        const allNames = new Set([...Object.keys(draft.workingDirectory), ...Object.keys(draft.stagingArea)]);
        allNames.forEach(name => {
          if (draft.mergeInProgress?.conflictedFiles.includes(name)) return; // already listed under "Unmerged paths"
          const wd = draft.workingDirectory[name];
          const staging = draft.stagingArea[name];
          const committed = lastCommitFiles[name];
          if (staging && staging.content !== committed?.content) staged.push(name);
          if (wd && staging && wd.content !== staging.content) modified.push(name);
          else if (wd && !staging && committed && wd.content !== committed.content) modified.push(name);
          if (wd && !committed && !staging && !isIgnored(name, draft.ignoredPatterns)) untracked.push(name);
        });
        const lines: string[] = [`On branch ${draft.HEAD.name}`];
        if (draft.mergeInProgress) {
          lines.push('You have unmerged paths.');
          lines.push('  (fix conflicts and run "git commit" to conclude merge)');
          lines.push('Unmerged paths:');
          draft.mergeInProgress.conflictedFiles.forEach(f => lines.push(`  both modified:   ${f}`));
        }
        if (staged.length === 0 && modified.length === 0 && untracked.length === 0 && !draft.mergeInProgress) {
          lines.push('nothing to commit, working tree clean');
        } else {
          if (staged.length > 0) {
            lines.push('Changes to be committed:');
            staged.forEach(f => lines.push(`  staged:     ${f}`));
          }
          if (modified.length > 0) {
            lines.push('Changes not staged for commit:');
            modified.forEach(f => lines.push(`  modified:   ${f}`));
          }
          if (untracked.length > 0) {
            lines.push('Untracked files:');
            untracked.forEach(f => lines.push(`  ${f}`));
          }
        }
        message = lines.join('\n');
        break;
      }

      case 'LOG': {
        if (!draft.isInitialized) {
          message = 'fatal: not a git repository (or any of the parent directories): .git';
          break;
        }
        let cursor: string | undefined = draft.branches[draft.HEAD.name];
        if (!cursor) {
          message = "fatal: your current branch does not have any commits yet";
          break;
        }
        const lines: string[] = [];
        let isTip = true;
        while (cursor) {
          const commit: Commit | undefined = draft.commits[cursor];
          if (!commit) break;
          lines.push(`commit ${commit.id}${isTip ? ` (HEAD -> ${draft.HEAD.name})` : ''}`);
          lines.push(`    ${commit.message}`);
          lines.push('');
          isTip = false;
          cursor = commit.parents[0];
        }
        message = lines.join('\n').trimEnd();
        break;
      }

      case 'DIFF': {
        if (!draft.isInitialized) {
          message = 'fatal: not a git repository (or any of the parent directories): .git';
          break;
        }
        const headCommitId = draft.branches[draft.HEAD.name];
        const lastCommitFiles = headCommitId ? draft.commits[headCommitId].files : {};
        const lines: string[] = [];
        Object.keys(draft.workingDirectory).forEach(name => {
          const wdContent = draft.workingDirectory[name].content;
          const baseline = draft.stagingArea[name]?.content ?? lastCommitFiles[name]?.content;
          if (baseline === undefined || baseline === wdContent) return;
          lines.push(`diff --git a/${name} b/${name}`, `--- a/${name}`, `+++ b/${name}`);
          lines.push(...diffLines(baseline, wdContent));
        });
        message = lines.length > 0 ? lines.join('\n') : 'No changes.';
        break;
      }

      case 'DISCARD': {
        const fileName: string = action.payload;
        const headCommitId = draft.branches[draft.HEAD.name];
        const lastCommitFiles = headCommitId ? draft.commits[headCommitId].files : {};
        const baseline = draft.stagingArea[fileName] ?? lastCommitFiles[fileName];
        if (!baseline) {
          message = `'${fileName}' is untracked - there's nothing to discard. (git restore only works on files git already knows about.)`;
          break;
        }
        draft.workingDirectory[fileName] = { ...baseline };
        message = `Discarded uncommitted changes in '${fileName}'.`;
        break;
      }

      case 'UNSTAGE': {
        const fileName: string = action.payload;
        if (!draft.stagingArea[fileName]) {
          message = `'${fileName}' is not staged.`;
          break;
        }
        delete draft.stagingArea[fileName];
        message = `Unstaged '${fileName}' (still modified in your working directory).`;
        break;
      }

      case 'AMEND': {
        const branchName = draft.HEAD.name;
        const tipId = draft.branches[branchName];
        if (!tipId) {
          message = 'error: cannot amend, no commits yet on this branch.';
          break;
        }
        const tipCommit = draft.commits[tipId];
        const newMessage: string = action.payload || tipCommit.message;
        const amendedFiles = { ...tipCommit.files, ...draft.stagingArea };
        const newCommitId = createCommitId();
        draft.commits[newCommitId] = {
          id: newCommitId,
          parents: tipCommit.parents,
          message: newMessage,
          files: amendedFiles,
        };
        delete draft.commits[tipId];
        draft.branches[branchName] = newCommitId;
        draft.stagingArea = {};
        Object.keys(amendedFiles).forEach(name => { draft.workingDirectory[name] = amendedFiles[name]; });
        message = `Amended commit [${tipId}] -> [${newCommitId}]. The old commit ID is gone - never amend a commit you've already pushed and shared with others!`;
        break;
      }

      case 'REVERT': {
        const branchName = draft.HEAD.name;
        const tipId = draft.branches[branchName];
        if (!tipId) {
          message = 'error: nothing to revert, no commits yet on this branch.';
          break;
        }
        const targetCommit = draft.commits[tipId];
        const parentId = targetCommit.parents[0];
        if (!parentId) {
          message = 'Cannot revert the very first commit (it has no earlier version to restore).';
          break;
        }
        const parentFiles = draft.commits[parentId].files;
        const newCommitId = createCommitId();
        draft.commits[newCommitId] = {
          id: newCommitId,
          parents: [tipId],
          message: `Revert "${targetCommit.message}"`,
          files: { ...parentFiles },
        };
        draft.branches[branchName] = newCommitId;
        draft.stagingArea = {};
        Object.keys(parentFiles).forEach(name => { draft.workingDirectory[name] = parentFiles[name]; });
        message = `Reverted [${tipId}] with new commit [${newCommitId}]. Unlike amend, history stays intact - this is safe even after pushing.`;
        break;
      }

      case 'IGNORE': {
        const pattern: string = action.payload;
        if (!pattern) {
          message = 'Provide a pattern to ignore, e.g. "*.log".';
          break;
        }
        if (draft.ignoredPatterns.includes(pattern)) {
          message = `'${pattern}' is already in .gitignore.`;
          break;
        }
        draft.ignoredPatterns.push(pattern);
        draft.workingDirectory['.gitignore'] = { name: '.gitignore', content: draft.ignoredPatterns.join('\n') };
        message = `Added '${pattern}' to .gitignore. Remember: .gitignore is just a file - you still need to 'git add' and commit it.`;
        break;
      }

      case 'RESOLVE': {
        if (!draft.mergeInProgress) {
          message = 'No merge conflict in progress.';
          break;
        }
        const choice: string = action.payload;
        if (choice !== 'ours' && choice !== 'theirs') {
          message = `Type 'ours' to keep ${draft.mergeInProgress.targetBranch}'s version, or 'theirs' to take ${draft.mergeInProgress.sourceBranch}'s version.`;
          break;
        }
        const { sourceCommitId, targetCommitId, conflictedFiles } = draft.mergeInProgress;
        const sourceFiles = draft.commits[sourceCommitId].files;
        const targetFiles = draft.commits[targetCommitId].files;
        conflictedFiles.forEach(name => {
          const resolvedFile = choice === 'ours' ? targetFiles[name] : sourceFiles[name];
          if (resolvedFile) {
            draft.workingDirectory[name] = { ...resolvedFile };
            draft.stagingArea[name] = { ...resolvedFile };
          }
        });
        message = `Resolved conflict${conflictedFiles.length === 1 ? '' : 's'} in ${conflictedFiles.join(', ')} by keeping '${choice}'. Now run 'git commit' to complete the merge.`;
        break;
      }

      default:
        message = `Unknown command: ${action.type}`;
        break;
    }
  });
  
  return { newState, message };
};
