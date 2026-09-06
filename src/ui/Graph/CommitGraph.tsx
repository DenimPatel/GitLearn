import { useMemo, useState } from 'react';
import { readCommit, firstLine, short } from '../../engine/objects';
import {
  currentBranchName, headOid, headsPrefix, isDetached, remotesPrefix, tagsPrefix,
  shortenRef, walkHistory,
} from '../../engine/refs';
import { colorForLane } from '../../design/tokens';
import { relativeDate } from '../../engine/clock';
import type { Oid, Repository } from '../../engine/types';

const ROW = 46;
const LANE = 26;
const LEFT = 18;

interface Node { oid: Oid; x: number; y: number; lane: number; color: string }

/**
 * Lays history out as a DAG: newest at the top, one lane per concurrent line of
 * work. Lanes are assigned by walking each tip's first-parent chain, and a lane
 * is released once its line merges — so a long-finished branch stops reserving
 * horizontal space, which the old fixed branch-index layout never did.
 */
function layout(repo: Repository) {
  const tips = Object.entries(repo.refs)
    .filter(([n, r]) => n !== 'HEAD' && r.kind === 'direct' && repo.objects[r.target]?.type === 'commit')
    .map(([n, r]) => ({ name: n, oid: (r as { target: Oid }).target }));

  const head = headOid(repo);
  if (head && !tips.some((t) => t.oid === head)) tips.push({ name: 'HEAD', oid: head });

  // main first, then branches, then everything else — keeps main in lane 0.
  tips.sort((a, b) => {
    const rank = (n: string) =>
      n === `${headsPrefix}main` ? 0 : n.startsWith(headsPrefix) ? 1 : n.startsWith(remotesPrefix) ? 3 : 2;
    return rank(a.name) - rank(b.name) || (a.name < b.name ? -1 : 1);
  });

  const order = walkHistory(repo, tips.map((t) => t.oid));
  const rowOf = new Map<Oid, number>(order.map((oid, i) => [oid, i]));

  const laneOf = new Map<Oid, number>();
  let nextLane = 0;
  for (const tip of tips) {
    if (laneOf.has(tip.oid)) continue;
    const lane = nextLane++;
    let cursor: Oid | undefined = tip.oid;
    while (cursor && !laneOf.has(cursor)) {
      laneOf.set(cursor, lane);
      cursor = readCommit(repo, cursor).parents[0];
    }
  }

  const nodes: Node[] = order.map((oid) => {
    const lane = laneOf.get(oid) ?? 0;
    return {
      oid, lane,
      x: LEFT + lane * LANE,
      y: (rowOf.get(oid) ?? 0) * ROW + ROW / 2,
      color: colorForLane(lane),
    };
  });
  const byOid = new Map(nodes.map((n) => [n.oid, n]));

  const edges: { from: Node; to: Node; color: string }[] = [];
  for (const node of nodes) {
    for (const parent of readCommit(repo, node.oid).parents) {
      const target = byOid.get(parent);
      if (target) edges.push({ from: node, to: target, color: node.color });
    }
  }

  const laneCount = Math.max(1, nextLane);
  return { nodes, edges, byOid, order, height: order.length * ROW, width: LEFT + laneCount * LANE + 10 };
}

const edgePath = (from: Node, to: Node): string =>
  from.x === to.x
    ? `M ${from.x} ${from.y} L ${to.x} ${to.y}`
    : `M ${from.x} ${from.y} C ${from.x} ${(from.y + to.y) / 2}, ${to.x} ${(from.y + to.y) / 2}, ${to.x} ${to.y}`;

function RefLabel({ label, kind }: { label: string; kind: string }) {
  const styles: Record<string, string> = {
    head: 'bg-accent text-[#04121f] border-accent font-semibold',
    branch: 'bg-accent/15 text-accent border-accent/50',
    tag: 'bg-warning/15 text-warning border-warning/50',
    remote: 'bg-fg-subtle/10 text-fg-subtle border-fg-subtle/40',
  };
  return (
    <span className={`gl-ref gl-pop shrink-0 whitespace-nowrap rounded-full border px-1.5 py-[1px] font-mono text-[10px] leading-4 ${styles[kind]}`}>
      {kind === 'tag' ? `⌂ ${label}` : label}
    </span>
  );
}

export function CommitGraph({ repo, dim = false, showHead = true, emptyLabel = 'No commits yet' }: {
  repo: Repository; dim?: boolean; showHead?: boolean; emptyLabel?: string;
}) {
  const [selected, setSelected] = useState<Oid | null>(null);
  const { nodes, edges, order, height, width } = useMemo(() => layout(repo), [repo]);

  if (!order.length) {
    return <p className="px-3 py-6 text-center text-[11px] italic text-fg-subtle">{emptyLabel}</p>;
  }

  const head = headOid(repo);
  const branch = currentBranchName(repo);
  const detached = isDetached(repo);

  const labelsFor = (oid: Oid) => {
    const out: { label: string; kind: string }[] = [];
    if (showHead && head === oid) out.push({ label: detached ? 'HEAD (detached)' : `HEAD → ${branch}`, kind: 'head' });
    for (const [name, ref] of Object.entries(repo.refs)) {
      if (name === 'HEAD' || ref.kind !== 'direct' || ref.target !== oid) continue;
      const shortName = shortenRef(name);
      if (name.startsWith(headsPrefix)) {
        if (!(showHead && head === oid && !detached && shortName === branch)) out.push({ label: shortName, kind: 'branch' });
      } else if (name.startsWith(tagsPrefix)) out.push({ label: shortName, kind: 'tag' });
      else if (name.startsWith(remotesPrefix)) out.push({ label: shortName, kind: 'remote' });
    }
    return out;
  };

  return (
    <div className={`gl-scroll h-full overflow-auto ${dim ? 'opacity-70' : ''}`}>
      <div className="relative" style={{ height, minWidth: '100%' }}>
        <svg className="pointer-events-none absolute left-0 top-0" width={width} height={height} aria-hidden>
          {edges.map((e, i) => (
            <path key={i} d={edgePath(e.from, e.to)} stroke={e.color} strokeWidth={1.6} fill="none" opacity={0.75} />
          ))}
        </svg>

        {nodes.map((node) => {
          const commit = readCommit(repo, node.oid);
          const isHead = showHead && head === node.oid;
          const isMerge = commit.parents.length > 1;
          const isOpen = selected === node.oid;
          return (
            <div key={node.oid} className="absolute left-0 right-0" style={{ top: node.y - ROW / 2, height: ROW }}>
              <button type="button"
                onClick={() => setSelected(isOpen ? null : node.oid)}
                className="group flex h-full w-full items-center gap-2 rounded-md pr-2 text-left transition-colors hover:bg-surface-hover"
                style={{ paddingLeft: width }}
                title="Show this commit’s details">
                <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{short(node.oid)}</span>
                <span className="flex shrink-0 gap-1">
                  {labelsFor(node.oid).map((l) => <RefLabel key={l.kind + l.label} {...l} />)}
                </span>
                <span className="truncate text-[12px] text-fg-muted group-hover:text-fg">
                  {firstLine(commit.message)}
                </span>
                {isMerge && <span className="ml-auto shrink-0 font-mono text-[9.5px] text-fg-subtle">merge</span>}
              </button>

              <svg className="pointer-events-none absolute top-0" style={{ left: 0 }} width={width} height={ROW} aria-hidden>
                <circle cx={node.x} cy={ROW / 2} r={isHead ? 6 : 4.5}
                  fill={isMerge ? '#0d1117' : node.color} stroke={node.color} strokeWidth={2} />
              </svg>

              {isOpen && (
                <div className="gl-enter absolute left-0 right-2 z-10 mt-0.5 rounded-lg border border-border bg-surface-raised p-2.5 font-mono text-[10.5px] leading-relaxed shadow-xl"
                  style={{ top: ROW, marginLeft: width }}>
                  <Row k="commit" v={node.oid} />
                  <Row k="tree" v={commit.tree} />
                  {commit.parents.length
                    ? commit.parents.map((p) => <Row key={p} k="parent" v={p} />)
                    : <Row k="parent" v="(root commit)" />}
                  <Row k="author" v={`${commit.author.name} <${commit.author.email}>`} />
                  <Row k="date" v={relativeDate(commit.author.timestamp, repo.clock)} />
                  <p className="mt-1.5 whitespace-pre-wrap border-t border-border pt-1.5 text-fg">{commit.message}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex gap-2">
    <span className="w-12 shrink-0 text-fg-subtle">{k}</span>
    <span className="truncate text-fg-muted">{v}</span>
  </div>
);
