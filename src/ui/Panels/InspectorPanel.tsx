import { useState } from 'react';
import { Card, Empty } from '../primitives';
import { unmergedPaths } from '../../engine/gitIndex';
import { listBranches, listRemoteRefs, listTags, headOid, shortenRef } from '../../engine/refs';
import { short } from '../../engine/objects';
import type { Repository, World } from '../../engine/types';

type Tab = 'objects' | 'refs' | 'reflog' | 'stash';

/** Makes the object database, the refs and the reflog directly inspectable.
 *  Several lessons ask the learner to look in here, because "nothing is lost"
 *  is much more convincing when you can see the unreferenced commit sitting
 *  in the database. */
export function InspectorPanel({ world }: { world: World }) {
  const [tab, setTab] = useState<Tab>('refs');
  const repo = world.local;

  if (!repo.initialized) return <Card title="Inspector"><Empty>No repository yet.</Empty></Card>;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'refs', label: 'Refs', count: listBranches(repo).length + listTags(repo).length + listRemoteRefs(repo).length },
    { id: 'objects', label: 'Objects', count: Object.keys(repo.objects).length },
    { id: 'reflog', label: 'Reflog', count: (repo.reflogs['HEAD'] ?? []).length },
    { id: 'stash', label: 'Stash', count: repo.stash.length },
  ];

  return (
    <Card
      title="Inspector"
      right={
        <div className="flex gap-0.5">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`rounded-md px-1.5 py-0.5 text-[10px] transition-colors ${
                tab === t.id ? 'bg-accent/20 text-accent' : 'text-fg-subtle hover:text-fg-muted'}`}>
              {t.label} <span className="opacity-60">{t.count}</span>
            </button>
          ))}
        </div>
      }
      bodyClass="gl-scroll overflow-y-auto p-2 font-mono text-[10.5px]"
    >
      {tab === 'refs' && <Refs repo={repo} />}
      {tab === 'objects' && <Objects repo={repo} />}
      {tab === 'reflog' && <Reflog repo={repo} />}
      {tab === 'stash' && <Stash repo={repo} />}
    </Card>
  );
}

function Refs({ repo }: { repo: Repository }) {
  const groups = [
    { label: 'heads', refs: listBranches(repo) },
    { label: 'tags', refs: listTags(repo) },
    { label: 'remotes', refs: listRemoteRefs(repo) },
  ].filter((g) => g.refs.length);

  if (!groups.length) return <Empty>No refs yet — make a commit.</Empty>;
  const head = headOid(repo);

  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-0.5 text-[9.5px] uppercase tracking-wider text-fg-subtle">{g.label}</p>
          {g.refs.map((r) => (
            <div key={r.name} className="flex gap-2 py-px">
              <span className={r.oid === head ? 'text-accent' : 'text-fg-subtle'}>{short(r.oid)}</span>
              <span className="truncate text-fg-muted">{r.name}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="border-t border-border pt-1.5">
        <span className="text-fg-subtle">HEAD → </span>
        <span className="text-accent">
          {repo.refs['HEAD']?.kind === 'symbolic'
            ? (repo.refs['HEAD'] as { target: string }).target
            : head ? `${short(head)} (detached)` : '(unborn)'}
        </span>
      </div>
    </div>
  );
}

function Objects({ repo }: { repo: Repository }) {
  const counts = { blob: 0, tree: 0, commit: 0, tag: 0 };
  for (const o of Object.values(repo.objects)) counts[o.type]++;
  const recent = Object.values(repo.objects).slice(-40).reverse();

  return (
    <div>
      <div className="mb-1.5 flex gap-3 border-b border-border pb-1.5 text-[10px] text-fg-subtle">
        {Object.entries(counts).map(([k, v]) => <span key={k}>{k} <span className="text-fg-muted">{v}</span></span>)}
      </div>
      {recent.map((o) => (
        <div key={o.oid} className="flex gap-2 py-px">
          <span className="w-14 shrink-0 text-fg-subtle">{o.type}</span>
          <span className="shrink-0 text-accent">{short(o.oid)}</span>
          <span className="truncate text-fg-subtle">
            {o.type === 'commit' ? o.message.split('\n')[0]
              : o.type === 'blob' ? JSON.stringify(o.content.slice(0, 32))
              : o.type === 'tree' ? `${o.entries.length} entries`
              : o.tag}
          </span>
        </div>
      ))}
    </div>
  );
}

function Reflog({ repo }: { repo: Repository }) {
  const entries = repo.reflogs['HEAD'] ?? [];
  if (!entries.length) return <Empty>Nothing yet. The reflog fills as HEAD moves.</Empty>;
  return (
    <div>
      {entries.map((e, i) => (
        <div key={i} className="flex gap-2 py-px">
          <span className="shrink-0 text-accent">{short(e.after)}</span>
          <span className="shrink-0 text-fg-subtle">HEAD@{`{${i}}`}</span>
          <span className="truncate text-fg-muted">{e.message}</span>
        </div>
      ))}
    </div>
  );
}

function Stash({ repo }: { repo: Repository }) {
  if (!repo.stash.length) return <Empty>Stash is empty.</Empty>;
  return (
    <div>
      {repo.stash.map((s, i) => (
        <div key={s.oid} className="flex gap-2 py-px">
          <span className="shrink-0 text-fg-subtle">stash@{`{${i}}`}</span>
          <span className="truncate text-fg-muted">{s.message}</span>
        </div>
      ))}
    </div>
  );
}

export const conflictCount = (repo: Repository): number => unmergedPaths(repo.index).length;
export const refName = shortenRef;
