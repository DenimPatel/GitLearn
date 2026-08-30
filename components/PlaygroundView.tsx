
import React from 'react';
import type { RepoState, Command } from '../types';
import { CommandButton } from './CommandButton';
import { CommitGraph, FilePill, getFileStatus } from './GitVisualization';
import { RemotePanel } from './RemotePanel';

interface PlaygroundViewProps {
  repoState: RepoState;
  onCommand: (command: Command, payload?: any) => void;
  feedbackMessage: string | null;
}

export const PlaygroundView: React.FC<PlaygroundViewProps> = ({ repoState, onCommand, feedbackMessage }) => {

  const allFiles = Object.keys(repoState.workingDirectory);
  const stagedFiles = Object.keys(repoState.stagingArea);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full min-h-[600px]">
      {/* Pane 1: Command Center */}
      <div className="bg-git-surface border border-git-border rounded-lg p-4 flex flex-col gap-4 overflow-y-auto">
        <h2 className="text-lg font-bold text-git-text-primary border-b border-git-border pb-2 flex items-center gap-2">
            <span className="text-git-accent">›</span> Command Center
        </h2>
        
        <div className="flex flex-col gap-3">
             <CommandButton command="INIT" onClick={() => onCommand('INIT')} commandPreview={() => 'git init'} className="bg-blue-500/10 text-blue-300 border border-blue-500/30 hover:bg-blue-500/20">init</CommandButton>

             <div className="border-t border-git-border my-1"></div>

             <CommandButton command="CREATE_FILE" onClick={(p) => onCommand('CREATE_FILE', {name: p, content: `Content of ${p}`})} requiresPayload payloadLabel="filename" payloadDefault="file.txt" isGitCommand={false} commandPreview={(p) => `create ${p || 'filename'} in your editor`} className="bg-gray-500/10 text-gray-300 border border-gray-500/30 hover:bg-gray-500/20">create-file</CommandButton>

             <CommandButton command="MODIFY_FILE" onClick={(p) => onCommand('MODIFY_FILE', p)} requiresPayload payloadLabel="filename" payloadDefault="file.txt" isGitCommand={false} commandPreview={(p) => `edit ${p || 'filename'} in your editor`} className="bg-yellow-500/10 text-yellow-300 border border-yellow-500/30 hover:bg-yellow-500/20">modify-file</CommandButton>

             <div className="border-t border-git-border my-1"></div>

             <CommandButton command="ADD" onClick={(p) => onCommand('ADD', p)} requiresPayload payloadLabel="filename" payloadDefault="file.txt" commandPreview={(p) => `git add ${p || '<filename>'}`} className="bg-green-500/10 text-green-300 border border-green-500/30 hover:bg-green-500/20">add</CommandButton>

             <CommandButton command="COMMIT" onClick={(p) => onCommand('COMMIT', p)} requiresPayload payloadLabel="message" payloadDefault="my commit" commandPreview={(p) => `git commit -m "${p || '<message>'}"`} className="bg-purple-500/10 text-purple-300 border border-purple-500/30 hover:bg-purple-500/20">commit -m</CommandButton>

             <div className="border-t border-git-border my-1"></div>

             <CommandButton command="BRANCH" onClick={(p) => onCommand('BRANCH', p)} requiresPayload payloadLabel="branch" payloadDefault="new-branch" commandPreview={(p) => `git branch ${p || '<branch>'}`} className="bg-teal-500/10 text-teal-300 border border-teal-500/30 hover:bg-teal-500/20">branch</CommandButton>

             <CommandButton command="CHECKOUT" onClick={(p) => onCommand('CHECKOUT', p)} requiresPayload payloadLabel="branch" payloadDefault="main" commandPreview={(p) => `git checkout ${p || '<branch>'}`} className="bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20">checkout</CommandButton>

             <CommandButton command="MERGE" onClick={(p) => onCommand('MERGE', p)} requiresPayload payloadLabel="branch" payloadDefault="feature" commandPreview={(p) => `git merge ${p || '<branch>'}`} className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/20">merge</CommandButton>

             <div className="border-t border-git-border my-1"></div>
             <h3 className="text-xs uppercase tracking-wider font-semibold text-git-text-secondary">GitHub (origin)</h3>

             <CommandButton command="REMOTE_ADD" onClick={(p) => onCommand('REMOTE_ADD', p)} requiresPayload payloadLabel="remote url" payloadDefault="https://github.com/you/repo.git" commandPreview={(p) => `git remote add origin ${p || '<url>'}`} className="bg-orange-500/10 text-orange-300 border border-orange-500/30 hover:bg-orange-500/20">remote add origin</CommandButton>

             <CommandButton command="PUSH" onClick={(p) => onCommand('PUSH', p)} requiresPayload payloadLabel="branch" payloadDefault="main" commandPreview={(p) => `git push origin ${p || '<branch>'}`} className="bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20">push origin</CommandButton>

             <CommandButton command="PULL" onClick={(p) => onCommand('PULL', p)} requiresPayload payloadLabel="branch" payloadDefault="main" commandPreview={(p) => `git pull origin ${p || '<branch>'}`} className="bg-sky-500/10 text-sky-300 border border-sky-500/30 hover:bg-sky-500/20">pull origin</CommandButton>

             <CommandButton command="OPEN_PR" onClick={(p) => onCommand('OPEN_PR', p)} requiresPayload payloadLabel="PR title" payloadDefault="Add awesome feature" isGitCommand={false} commandPreview={(p) => `On GitHub: Compare & pull request → "${p || '<title>'}"`} className="bg-violet-500/10 text-violet-300 border border-violet-500/30 hover:bg-violet-500/20">open pull request</CommandButton>

             <CommandButton command="MERGE_PR" onClick={() => onCommand('MERGE_PR')} isGitCommand={false} commandPreview={() => 'On GitHub: click "Merge pull request"'} className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20">merge pull request</CommandButton>

             <div className="border-t border-git-border my-1"></div>
             <h3 className="text-xs uppercase tracking-wider font-semibold text-git-text-secondary">Inspect</h3>

             <CommandButton command="STATUS" onClick={() => onCommand('STATUS')} commandPreview={() => 'git status'} className="bg-slate-500/10 text-slate-300 border border-slate-500/30 hover:bg-slate-500/20">status</CommandButton>

             <CommandButton command="LOG" onClick={() => onCommand('LOG')} commandPreview={() => 'git log'} className="bg-slate-500/10 text-slate-300 border border-slate-500/30 hover:bg-slate-500/20">log</CommandButton>

             <CommandButton command="DIFF" onClick={() => onCommand('DIFF')} commandPreview={() => 'git diff'} className="bg-slate-500/10 text-slate-300 border border-slate-500/30 hover:bg-slate-500/20">diff</CommandButton>

             <div className="border-t border-git-border my-1"></div>
             <h3 className="text-xs uppercase tracking-wider font-semibold text-git-text-secondary">Undo Mistakes</h3>

             <CommandButton command="DISCARD" onClick={(p) => onCommand('DISCARD', p)} requiresPayload payloadLabel="filename" payloadDefault="file.txt" commandPreview={(p) => `git restore ${p || '<filename>'}`} className="bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20">restore</CommandButton>

             <CommandButton command="UNSTAGE" onClick={(p) => onCommand('UNSTAGE', p)} requiresPayload payloadLabel="filename" payloadDefault="file.txt" commandPreview={(p) => `git restore --staged ${p || '<filename>'}`} className="bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20">restore --staged</CommandButton>

             <CommandButton command="AMEND" onClick={(p) => onCommand('AMEND', p)} requiresPayload payloadLabel="commit message" payloadDefault="fix: correct the typo" commandPreview={(p) => `git commit --amend -m "${p || '<message>'}"`} className="bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/30 hover:bg-fuchsia-500/20">commit --amend</CommandButton>

             <CommandButton command="REVERT" onClick={() => onCommand('REVERT')} commandPreview={() => 'git revert HEAD'} className="bg-pink-500/10 text-pink-300 border border-pink-500/30 hover:bg-pink-500/20">revert HEAD</CommandButton>

             <div className="border-t border-git-border my-1"></div>
             <h3 className="text-xs uppercase tracking-wider font-semibold text-git-text-secondary">.gitignore</h3>

             <CommandButton command="IGNORE" onClick={(p) => onCommand('IGNORE', p)} requiresPayload payloadLabel="pattern, e.g. *.log" payloadDefault="*.log" isGitCommand={false} commandPreview={(p) => `echo "${p || '<pattern>'}" >> .gitignore`} className="bg-lime-500/10 text-lime-300 border border-lime-500/30 hover:bg-lime-500/20">ignore</CommandButton>

             <div className="border-t border-git-border my-1"></div>
             <h3 className="text-xs uppercase tracking-wider font-semibold text-git-text-secondary">Merge Conflicts</h3>

             <CommandButton command="RESOLVE" onClick={(p) => onCommand('RESOLVE', p)} requiresPayload payloadLabel="'ours' or 'theirs'" payloadDefault="theirs" isGitCommand={false} commandPreview={(p) => `(edit the file, keeping '${p || "ours/theirs"}'s version)`} className="bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20">resolve conflict</CommandButton>
        </div>

        <div className="mt-auto pt-4 border-t border-git-border">
             {feedbackMessage && (
                <div className="font-mono text-xs bg-git-bg p-3 rounded-md text-git-text-secondary border-l-2 border-git-accent break-words whitespace-pre-wrap max-h-64 overflow-y-auto">
                  <span className="text-git-accent font-bold mr-1">$</span>{feedbackMessage}
                </div>
              )}
        </div>
      </div>

      {/* Pane 2: File Structure */}
      <div className="bg-git-surface border border-git-border rounded-lg p-4 flex flex-col gap-4 overflow-y-auto">
        <h2 className="text-lg font-bold text-git-text-primary border-b border-git-border pb-2 flex items-center gap-2">
            <svg className="w-5 h-5 text-git-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
            File System
        </h2>
        
        {!repoState.isInitialized ? (
             <div className="flex-grow flex items-center justify-center text-git-text-secondary italic text-sm">
                Repository not initialized
             </div>
        ) : (
        <>
            <div className="flex-1">
                <h3 className="text-xs uppercase tracking-wider font-semibold text-git-text-secondary mb-2">Working Directory</h3>
                <div className="space-y-2">
                    {allFiles.length === 0 && <p className="text-sm text-git-text-secondary italic">Empty</p>}
                    {allFiles.map(name => {
                        const file = repoState.workingDirectory[name];
                        const { status, bgColor } = getFileStatus(name, repoState);
                        // In playground file explorer, we want to see the file even if it's committed (unmodified)
                        // But we still want to know its status.
                        return (
                            <FilePill key={name} file={file} status={status} bgColor={bgColor === 'bg-git-bg' ? 'bg-git-bg border border-git-border' : bgColor} />
                        );
                    })}
                </div>
            </div>

            <div className="border-t border-git-border pt-4 flex-1">
                <h3 className="text-xs uppercase tracking-wider font-semibold text-git-text-secondary mb-2">Staging Area</h3>
                <div className="space-y-2">
                    {stagedFiles.length === 0 && <p className="text-sm text-git-text-secondary italic">Empty</p>}
                    {stagedFiles.map(name => {
                         const file = repoState.stagingArea[name];
                         return <FilePill key={`staged-${name}`} file={file} status="staged" bgColor="bg-green-500/20 text-green-300" />;
                    })}
                </div>
            </div>
        </>
        )}
      </div>

      {/* Pane 3: Git Graph */}
      <div className="flex flex-col h-full">
         <CommitGraph repoState={repoState} />
      </div>

      {/* Pane 4: Remote (GitHub) */}
      <div className="flex flex-col h-full">
         <RemotePanel remote={repoState.remote} />
      </div>
    </div>
  );
};
