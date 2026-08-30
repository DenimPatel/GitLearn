
import React from 'react';
import type { RemoteState, RepoState } from '../types';
import { CommitGraph } from './GitVisualization';

interface RemotePanelProps {
  remote: RemoteState;
}

/** Renders the simulated GitHub-hosted copy of the repo: its commit graph and any pull requests. */
export const RemotePanel: React.FC<RemotePanelProps> = ({ remote }) => {
  const pullRequests = Object.values(remote.pullRequests).sort((a, b) => {
    if (a.status === b.status) return 0;
    return a.status === 'open' ? -1 : 1;
  });

  // CommitGraph only reads commits/branches/HEAD, so a minimal stand-in RepoState lets us
  // reuse it to render the remote's graph without duplicating the layout logic.
  const remoteAsRepoState: RepoState = {
    isInitialized: true,
    workingDirectory: {},
    stagingArea: {},
    commits: remote.commits,
    branches: remote.branches,
    HEAD: { type: 'branch', name: '' },
    remote: { url: null, branches: {}, commits: {}, pullRequests: {} },
    commandsRun: [],
    ignoredPatterns: [],
    mergeInProgress: null,
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {pullRequests.length > 0 && (
        <div className="bg-git-surface border border-git-border rounded-lg p-4">
          <h3 className="font-bold text-git-text-primary mb-3 text-center border-b border-git-border pb-2">Pull Requests</h3>
          <div className="space-y-2">
            {pullRequests.map(pr => (
              <div key={pr.id} className="p-2 rounded-md font-mono text-xs flex justify-between items-center gap-2 bg-git-bg border border-git-border">
                <span className="truncate">
                  <span className="text-git-accent">{pr.id}</span>: {pr.title}{' '}
                  <span className="text-git-text-secondary">({pr.sourceBranch} → {pr.targetBranch})</span>
                </span>
                <span
                  className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full ${
                    pr.status === 'open' ? 'bg-git-warning/20 text-git-warning' : 'bg-git-success/20 text-git-success'
                  }`}
                >
                  {pr.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <CommitGraph
        repoState={remoteAsRepoState}
        title="GitHub (origin)"
        emptyMessage={remote.url ? 'No commits pushed yet.' : "Not connected. Run 'git remote add origin <url>'."}
      />
    </div>
  );
};
