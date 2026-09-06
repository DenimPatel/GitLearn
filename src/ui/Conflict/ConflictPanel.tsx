import { readBlob } from '../../engine/objects';
import { unmergedPaths } from '../../engine/gitIndex';
import { Button } from '../primitives';
import type { World } from '../../engine/types';

/** Shown only while a merge is unresolved. The buttons write plain file content
 *  and then ask the learner to run `git add` themselves — the panel never
 *  resolves anything behind the engine's back. */
export function ConflictPanel({ world, onFillCommand, onWriteFile }: {
  world: World;
  onFillCommand: (cmd: string) => void;
  onWriteFile: (path: string, content: string) => void;
}) {
  const repo = world.local;
  const paths = unmergedPaths(repo.index);
  if (!paths.length) return null;

  const version = (path: string, stage: 1 | 2 | 3) => {
    const entry = repo.index.entries.find((e) => e.path === path && e.stage === stage);
    return entry ? readBlob(repo, entry.oid).content : '';
  };

  return (
    <div className="gl-enter shrink-0 border-t border-danger/40 bg-danger/[0.06] px-3 py-2.5">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-danger">
        {paths.length} conflict{paths.length === 1 ? '' : 's'} — Git needs you to decide
      </p>

      {paths.map((path) => (
        <div key={path} className="mb-2 last:mb-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11.5px] text-fg">{path}</span>
            <Button size="sm" variant="ghost" onClick={() => onWriteFile(path, version(path, 2))}>
              Take ours
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onWriteFile(path, version(path, 3))}>
              Take theirs
            </Button>
            <Button size="sm" variant="subtle" onClick={() => onFillCommand(`git add ${path}`)}>
              Mark resolved
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
            {([['base', 1], ['ours', 2], ['theirs', 3]] as const).map(([label, stage]) => (
              <div key={label} className="min-w-0 rounded border border-border bg-surface p-1.5">
                <p className="mb-0.5 text-[9px] uppercase tracking-wider text-fg-subtle">{label}</p>
                <pre className="gl-scroll max-h-16 overflow-auto whitespace-pre-wrap break-words text-fg-muted">
                  {version(path, stage) || '(absent)'}
                </pre>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="mt-1.5 text-[11px] text-fg-subtle">
        Edit the file however you like, then <span className="font-mono text-fg-muted">git add</span> it and{' '}
        <span className="font-mono text-fg-muted">git commit</span>.
      </p>
    </div>
  );
}
