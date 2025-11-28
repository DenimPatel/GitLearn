
import React, { useMemo } from 'react';
import type { RepoState, Commit, File } from '../types';

interface GitVisualizationProps {
  repoState: RepoState;
}

export const getFileStatus = (fileName: string, repoState: RepoState): { status: 'untracked' | 'modified' | 'staged' | 'committed' | 'unstaged', bgColor: string } => {
  const headCommitId = repoState.HEAD.type === 'branch' ? repoState.branches[repoState.HEAD.name] : null;
  const lastCommit = headCommitId ? repoState.commits[headCommitId] : null;
  const isTrackedInLastCommit = lastCommit?.files[fileName];
  const lastCommitFileContent = isTrackedInLastCommit ? lastCommit.files[fileName].content : undefined;

  const isInWD = !!repoState.workingDirectory[fileName];
  const isInStaging = !!repoState.stagingArea[fileName];
  
  const wdContent = repoState.workingDirectory[fileName]?.content;
  const stagingContent = repoState.stagingArea[fileName]?.content;
  
  if (isInStaging && stagingContent !== lastCommitFileContent) {
    return { status: 'staged', bgColor: 'bg-green-500/20 text-green-300' };
  }
  if(isInWD && wdContent !== stagingContent && isInStaging) {
      return { status: 'unstaged', bgColor: 'bg-yellow-500/20 text-yellow-300' };
  }
  if (isInWD && wdContent !== lastCommitFileContent && isTrackedInLastCommit) {
    return { status: 'modified', bgColor: 'bg-yellow-500/20 text-yellow-300' };
  }
  if (isInWD && !isTrackedInLastCommit && !isInStaging) {
    return { status: 'untracked', bgColor: 'bg-gray-500/20 text-gray-300' };
  }
  
  return { status: 'committed', bgColor: 'bg-git-bg' };
};

const AreaCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-git-surface border border-git-border rounded-lg p-4 flex-1 min-w-[200px]">
        <h3 className="font-bold text-git-text-primary mb-3 text-center border-b border-git-border pb-2">{title}</h3>
        <div className="space-y-2">{children}</div>
    </div>
);

export const FilePill: React.FC<{ file: File, status: string, bgColor: string }> = ({ file, status, bgColor }) => (
    <div className={`p-2 rounded-md font-mono text-sm flex justify-between items-center ${bgColor}`}>
        <span>{file.name}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-black/20">{status}</span>
    </div>
);

// Configuration for the new graph visualization
const COMMIT_V_SPACE = 60;
const COMMIT_H_SPACE = 40;
const COMMIT_RADIUS = 5;
const BRANCH_COLORS = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#a371f7', '#da4a91', '#1f6feb'];

const getEdgePath = (startX: number, startY: number, endX: number, endY: number): string => {
  const midY = (startY + endY) / 2;
  return `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
};

export const CommitGraph: React.FC<{ repoState: RepoState }> = ({ repoState }) => {
    const graphLayout = useMemo(() => {
        const commits = repoState.commits;
        const commitIds = Object.keys(commits);
        if (commitIds.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };

        // 1. Topological sort (newest first)
        const childrenOf: Record<string, string[]> = Object.fromEntries(commitIds.map(id => [id, []]));
        const inDegree: Record<string, number> = Object.fromEntries(commitIds.map(id => [id, 0]));

        for (const id of commitIds) {
            inDegree[id] = commits[id].parents.length;
            for (const parentId of commits[id].parents) {
                if (childrenOf[parentId]) childrenOf[parentId].push(id);
            }
        }
        const queue = commitIds.filter(id => inDegree[id] === 0);
        const sorted: Commit[] = [];
        while (queue.length > 0) {
            const uId = queue.shift()!;
            sorted.push(commits[uId]);
            (childrenOf[uId] || []).forEach(vId => {
                inDegree[vId]--;
                if (inDegree[vId] === 0) queue.push(vId);
            });
        }
        const sortedCommits = sorted.reverse();

        // 2. Assign stable colors and lanes to branches
        const branchNames = Object.keys(repoState.branches).sort((a, b) => a === 'main' ? -1 : b === 'main' ? 1 : a.localeCompare(b));
        const branchLayout = new Map<string, { lane: number, color: string }>();
        branchNames.forEach((name, i) => {
            branchLayout.set(name, { lane: i, color: BRANCH_COLORS[i % BRANCH_COLORS.length] });
        });
        
        // 3. Determine "owning" branch for each commit for layout
        const commitOwners = new Map<string, string>();
        branchNames.forEach(branchName => {
            let currentId = repoState.branches[branchName];
            while (currentId && !commitOwners.has(currentId)) {
                commitOwners.set(currentId, branchName);
                currentId = commits[currentId]?.parents[0];
            }
        });

        // 4. Calculate node positions
        const nodes = new Map<string, { commit: Commit, x: number, y: number, color: string }>();
        let maxLane = 0;
        sortedCommits.forEach((commit, i) => {
            const owningBranch = commitOwners.get(commit.id) || repoState.HEAD.name;
            const layout = branchLayout.get(owningBranch) || { lane: 0, color: '#c9d1d9' };
            const y = i * COMMIT_V_SPACE + COMMIT_V_SPACE / 2;
            const x = layout.lane * COMMIT_H_SPACE + COMMIT_H_SPACE / 2;
            if (layout.lane > maxLane) maxLane = layout.lane;
            nodes.set(commit.id, { commit, x, y, color: layout.color });
        });

        // 5. Create edges
        const edges: { key: string, path: string, color: string }[] = [];
        nodes.forEach((childNode, childId) => {
            childNode.commit.parents.forEach(parentId => {
                const parentNode = nodes.get(parentId);
                if (parentNode) {
                    edges.push({
                        key: `${childId}-${parentId}`,
                        path: getEdgePath(childNode.x, childNode.y, parentNode.x, parentNode.y),
                        color: childNode.color
                    });
                }
            });
        });
        
        return {
            nodes: Array.from(nodes.values()),
            edges,
            width: (maxLane + 1) * COMMIT_H_SPACE,
            height: sortedCommits.length * COMMIT_V_SPACE
        };
    }, [repoState.commits, repoState.branches, repoState.HEAD]);

    return (
        <div className="bg-git-surface border border-git-border rounded-lg p-4 flex-grow relative overflow-auto">
            <h3 className="font-bold text-git-text-primary mb-4 text-center border-b border-git-border pb-2">Local Repository (.git)</h3>
            <div className="relative" style={{ width: graphLayout.width, height: graphLayout.height }}>
                <svg className="absolute top-0 left-0 w-full h-full" aria-hidden="true">
                    {graphLayout.edges.map(edge => (
                        <path key={edge.key} d={edge.path} stroke={edge.color} strokeWidth="2" fill="none" />
                    ))}
                </svg>
                {graphLayout.nodes.map(({ commit, x, y, color }) => {
                    const branchesOnThisCommit = Object.entries(repoState.branches)
                        .filter(([, commitId]) => commitId === commit.id)
                        .map(([name]) => name);
                    const isHeadOnThisCommit = repoState.HEAD.type === 'branch' && repoState.branches[repoState.HEAD.name] === commit.id;
                    
                    return (
                        <div key={commit.id} className="absolute flex items-center" style={{ transform: `translate(${x}px, ${y}px)` }}>
                            <div className="absolute flex items-center" style={{ transform: `translateX(-50%) translateY(-50%)`}}>
                               <svg width={COMMIT_RADIUS * 2 + 4} height={COMMIT_RADIUS * 2 + 4}>
                                    <circle cx={COMMIT_RADIUS + 2} cy={COMMIT_RADIUS + 2} r={COMMIT_RADIUS} fill={color} stroke="#0d1117" strokeWidth="2" />
                               </svg>
                            </div>
                            <div className="pl-6 flex items-center gap-2 whitespace-nowrap">
                                <span className="font-mono text-xs text-git-accent">{commit.id}</span>
                                <span className="text-sm text-git-text-primary truncate">{commit.message}</span>
                                {isHeadOnThisCommit && (
                                    <span className="text-xs font-bold bg-blue-800 text-blue-200 px-2 py-0.5 rounded-full">HEAD → {repoState.HEAD.name}</span>
                                )}
                                {branchesOnThisCommit.map(b => (
                                    (!isHeadOnThisCommit || b !== repoState.HEAD.name) && (
                                        <span key={b} className="text-xs font-bold bg-green-800 text-green-200 px-2 py-0.5 rounded-full">{b}</span>
                                    )
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
            {graphLayout.nodes.length === 0 && <p className="text-center text-sm text-git-text-secondary w-full">No commits yet</p>}
        </div>
    );
};

export const GitVisualization: React.FC<GitVisualizationProps> = ({ repoState }) => {
    if (!repoState.isInitialized) {
        return <div className="bg-git-surface border border-dashed border-git-border rounded-lg p-6 h-full flex items-center justify-center">
            <p className="text-git-text-secondary">Repository not initialized. Run 'git init'.</p>
        </div>
    }
    
    const allFiles = new Set([
      ...Object.keys(repoState.workingDirectory), 
      ...Object.keys(repoState.stagingArea)
    ]);

    const wdFiles = Array.from(allFiles).map(name => {
      if(!repoState.workingDirectory[name]) return null;
      const { status, bgColor } = getFileStatus(name, repoState);
      if (status === 'staged') return null; // In status view, pure staged changes don't show up in WD as duplicates usually
      return <FilePill key={name} file={repoState.workingDirectory[name]} status={status} bgColor={bgColor} />;
    }).filter(Boolean);

    const stagedFiles = Object.values(repoState.stagingArea).map((file: File) => (
      <FilePill key={file.name} file={file} status="staged" bgColor="bg-green-500/20 text-green-300" />
    ));
    
    return (
      <div className="flex flex-col gap-4 h-full">
        <div className="flex flex-col sm:flex-row gap-4">
          <AreaCard title="Working Directory">{wdFiles.length > 0 ? wdFiles : <p className="text-center text-sm text-git-text-secondary py-2">Clean</p>}</AreaCard>
          <AreaCard title="Staging Area">{stagedFiles.length > 0 ? stagedFiles : <p className="text-center text-sm text-git-text-secondary py-2">Empty</p>}</AreaCard>
        </div>
        <CommitGraph repoState={repoState} />
      </div>
    );
};
