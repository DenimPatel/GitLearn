import { execute, runScript } from '../execute';
import { emptyWorld } from '../world';
import { headOid, isDetached, currentBranchName, refsAt, walkHistory } from '../refs';
import { firstLine, readCommit, short } from '../objects';
import type { CommandResult, World } from '../types';

export const run = (script: string[], w: World = emptyWorld()): World => runScript(w, script);
export const exec = (w: World, cmd: string): CommandResult => execute(w, cmd);

/** A one-line-per-commit rendering of history, for readable snapshots. */
export function graph(w: World, which: 'local' | 'origin' = 'local'): string[] {
  const repo = which === 'local' ? w.local : w.origin!;
  const tips = Object.values(repo.refs)
    .filter((r): r is { kind: 'direct'; target: string } => r.kind === 'direct')
    .map((r) => r.target)
    .filter((t) => repo.objects[t]?.type === 'commit');
  return walkHistory(repo, tips).map((oid) => {
    const decorations = refsAt(repo, oid).map((r) => r.label);
    if (headOid(repo) === oid && !isDetached(repo)) {
      const b = currentBranchName(repo);
      decorations.splice(decorations.indexOf(b!), 1, `HEAD -> ${b}`);
    }
    const d = decorations.length ? ` (${decorations.join(', ')})` : '';
    return `${short(oid)}${d} ${firstLine(readCommit(repo, oid).message)}`;
  });
}

/** A repo with one commit on main, used as the starting point of most tests. */
export const oneCommit = (): World => run([
  'git init',
  'echo "hello" > README.md',
  'git add README.md',
  'git commit -m "Initial commit"',
]);

export const fileLines = (w: World, path: string): string[] =>
  (w.local.worktree.files[path] ?? '').replace(/\n$/, '').split('\n');
