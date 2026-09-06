import { Badge, Card, Empty } from '../primitives';
import { CommitGraph } from '../Graph/CommitGraph';
import { status } from '../../engine/status';
import type { World } from '../../engine/types';

/** origin shown as what it is: a second repository, side by side with yours.
 *  The ahead/behind readout is the visible consequence of remote-tracking refs
 *  being a cached memory rather than a live view. */
export function RemotePanel({ world }: { world: World }) {
  const { origin, local, hosting } = world;
  const url = local.remotes.origin?.url;

  if (!origin || !url) {
    return (
      <Card title="origin" subtitle="no remote yet">
        <Empty>
          Add one with <span className="font-mono text-accent">git remote add origin &lt;url&gt;</span>
        </Empty>
      </Card>
    );
  }

  const s = status(local);
  const prs = hosting.pullRequests;

  return (
    <Card
      title="origin"
      subtitle={url.replace('https://', '')}
      right={
        <div className="flex gap-1">
          {s.ahead > 0 && <Badge tone="warning">↑{s.ahead} ahead</Badge>}
          {s.behind > 0 && <Badge tone="accent">↓{s.behind} behind</Badge>}
          {s.upstream && s.ahead === 0 && s.behind === 0 && <Badge tone="success">in sync</Badge>}
        </div>
      }
      bodyClass="flex min-h-0 flex-col"
    >
      <div className="min-h-0 flex-1">
        <CommitGraph repo={origin} dim showHead={false} emptyLabel="Nothing pushed yet" />
      </div>

      {prs.length > 0 && (
        <div className="shrink-0 border-t border-border p-2">
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
            Pull requests
          </h3>
          <ul className="space-y-1">
            {prs.map((pr) => (
              <li key={pr.id} className="flex items-center gap-2 text-[11px]">
                <Badge tone={pr.status === 'merged' ? 'accent' : pr.status === 'open' ? 'success' : 'muted'}>
                  #{pr.id} {pr.status}
                </Badge>
                <span className="truncate text-fg-muted">{pr.title}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-fg-subtle">
                  {pr.sourceBranch} → {pr.targetBranch}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
