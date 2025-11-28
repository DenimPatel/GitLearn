
import React from 'react';
import type { RepoState, Command } from '../types';
import { CommandButton } from './CommandButton';
import { CommitGraph, FilePill, getFileStatus } from './GitVisualization';

interface PlaygroundViewProps {
  repoState: RepoState;
  onCommand: (command: Command, payload?: any) => void;
  feedbackMessage: string | null;
}

export const PlaygroundView: React.FC<PlaygroundViewProps> = ({ repoState, onCommand, feedbackMessage }) => {

  const allFiles = Object.keys(repoState.workingDirectory);
  const stagedFiles = Object.keys(repoState.stagingArea);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full min-h-[600px]">
      {/* Pane 1: Command Center */}
      <div className="bg-git-surface border border-git-border rounded-lg p-4 flex flex-col gap-4 overflow-y-auto">
        <h2 className="text-lg font-bold text-git-text-primary border-b border-git-border pb-2 flex items-center gap-2">
            <span className="text-git-accent">›</span> Command Center
        </h2>
        
        <div className="flex flex-col gap-3">
             <CommandButton command="INIT" onClick={() => onCommand('INIT')} className="bg-blue-500/10 text-blue-300 border border-blue-500/30 hover:bg-blue-500/20">init</CommandButton>
             
             <div className="border-t border-git-border my-1"></div>
             
             <CommandButton command="CREATE_FILE" onClick={(p) => onCommand('CREATE_FILE', {name: p, content: `Content of ${p}`})} requiresPayload payloadLabel="filename" payloadDefault="file.txt" className="bg-gray-500/10 text-gray-300 border border-gray-500/30 hover:bg-gray-500/20">create-file</CommandButton>
             
             <CommandButton command="MODIFY_FILE" onClick={(p) => onCommand('MODIFY_FILE', p)} requiresPayload payloadLabel="filename" payloadDefault="file.txt" className="bg-yellow-500/10 text-yellow-300 border border-yellow-500/30 hover:bg-yellow-500/20">modify-file</CommandButton>
             
             <div className="border-t border-git-border my-1"></div>

             <CommandButton command="ADD" onClick={(p) => onCommand('ADD', p)} requiresPayload payloadLabel="filename" payloadDefault="file.txt" className="bg-green-500/10 text-green-300 border border-green-500/30 hover:bg-green-500/20">add</CommandButton>
             
             <CommandButton command="COMMIT" onClick={(p) => onCommand('COMMIT', p)} requiresPayload payloadLabel="message" payloadDefault="my commit" className="bg-purple-500/10 text-purple-300 border border-purple-500/30 hover:bg-purple-500/20">commit -m</CommandButton>

             <div className="border-t border-git-border my-1"></div>

             <CommandButton command="BRANCH" onClick={(p) => onCommand('BRANCH', p)} requiresPayload payloadLabel="branch" payloadDefault="new-branch" className="bg-teal-500/10 text-teal-300 border border-teal-500/30 hover:bg-teal-500/20">branch</CommandButton>

             <CommandButton command="CHECKOUT" onClick={(p) => onCommand('CHECKOUT', p)} requiresPayload payloadLabel="branch" payloadDefault="main" className="bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20">checkout</CommandButton>

             <CommandButton command="MERGE" onClick={(p) => onCommand('MERGE', p)} requiresPayload payloadLabel="branch" payloadDefault="feature" className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/20">merge</CommandButton>
        </div>

        <div className="mt-auto pt-4 border-t border-git-border">
             {feedbackMessage && (
                <div className="font-mono text-xs bg-git-bg p-3 rounded-md text-git-text-secondary border-l-2 border-git-accent break-words">
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
    </div>
  );
};
