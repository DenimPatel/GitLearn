import { Badge, Card, Empty } from '../primitives';
import { status, type FileState } from '../../engine/status';
import { indexFlat, unmergedPaths } from '../../engine/gitIndex';
import { flatTreeOfCommit } from '../../engine/trees';
import { headOid } from '../../engine/refs';
import type { World } from '../../engine/types';

const STATE_STYLE: Record<string, string> = {
  untracked: 'border-fg-subtle/40 text-fg-subtle',
  modified: 'border-warning/50 text-warning',
  deleted: 'border-danger/50 text-danger',
  staged: 'border-success/50 text-success',
  committed: 'border-accent/40 text-accent',
  conflict: 'border-danger text-danger gl-pulse',
};

function Column({ title, hint, files, tone }: {
  title: string; hint: string; files: { name: string; state: string }[]; tone: string;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="mb-1.5 px-0.5">
        <h3 className={`text-[11px] font-semibold uppercase tracking-[0.07em] ${tone}`}>{title}</h3>
        <p className="text-[10px] leading-tight text-fg-subtle">{hint}</p>
      </div>
      <div className="gl-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {files.length === 0
          ? <p className="px-1 py-2 text-[10.5px] italic text-fg-subtle">empty</p>
          : files.map((f) => (
            <div key={f.name}
              className={`gl-enter truncate rounded-md border bg-surface-raised px-1.5 py-1 font-mono text-[11px] ${STATE_STYLE[f.state] ?? 'border-border text-fg-muted'}`}
              title={`${f.name} — ${f.state}`}>
              {f.name}
            </div>
          ))}
      </div>
    </div>
  );
}

/**
 * The three trees, side by side and always visible. Nearly every command in the
 * curriculum is explained as moving a file from one of these columns to the
 * next, so the picture has to be on screen while the command runs.
 */
export function ThreeTrees({ world }: { world: World }) {
  const repo = world.local;
  if (!repo.initialized) {
    return (
      <Card title="Working directory">
        <Empty>Not a repository yet — run <span className="font-mono text-accent">git init</span>.</Empty>
      </Card>
    );
  }

  const s = status(repo);
  const conflicts = new Set(unmergedPaths(repo.index));
  const stateOf = (path: string): FileState | 'clean' =>
    s.unstaged.find((f) => f.path === path)?.state
    ?? (s.untracked.includes(path) ? 'untracked' : 'clean');

  const working = Object.keys(repo.worktree.files).sort().map((name) => ({
    name,
    state: conflicts.has(name) ? 'conflict'
      : stateOf(name) === 'untracked' ? 'untracked'
      : stateOf(name) === 'modified' ? 'modified'
      : 'committed',
  }));

  const staged = Object.keys(indexFlat(repo.index)).sort().map((name) => ({
    name,
    state: s.staged.some((f) => f.path === name) ? 'staged' : 'committed',
  }));

  const head = Object.keys(flatTreeOfCommit(repo, headOid(repo))).sort()
    .map((name) => ({ name, state: 'committed' }));

  return (
    <Card
      title="The three trees"
      subtitle="where each file currently lives"
      right={conflicts.size
        ? <Badge tone="danger">{conflicts.size} conflicted</Badge>
        : s.clean ? <Badge tone="success">clean</Badge> : null}
      bodyClass="flex gap-2 p-2.5"
    >
      <Column title="Working dir" hint="files you can edit" tone="text-warning" files={working} />
      <Arrow label="git add" />
      <Column title="Index" hint="your next commit" tone="text-success" files={staged} />
      <Arrow label="git commit" />
      <Column title="HEAD" hint="last commit" tone="text-accent" files={head} />
    </Card>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex w-11 shrink-0 flex-col items-center justify-center gap-1 pt-4 text-fg-subtle">
      <svg viewBox="0 0 24 8" className="w-full" aria-hidden>
        <path d="M0 4h19M15 1l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.2"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-center font-mono text-[9px] leading-tight">{label}</span>
    </div>
  );
}
