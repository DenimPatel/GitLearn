import { describe, expect, it } from 'vitest';
import { exec, fileLines, graph, run } from './helpers';
import { headOid } from '../refs';
import { firstLine, readCommit } from '../objects';
import { unmergedPaths } from '../gitIndex';
import type { World } from '../types';

/** main: base -> main work.  feature: base -> f1 -> f2, touching another file. */
const diverged = (): World => run([
  'git init',
  'echo "base" > base.txt', 'git add .', 'git commit -m "base"',
  'git switch -c feature',
  'echo "f1" > feature.txt', 'git add .', 'git commit -m "f1"',
  'echo "f2" > feature.txt', 'git commit -am "f2"',
  'git switch main',
  'echo "m1" > main.txt', 'git add .', 'git commit -m "m1"',
]);

describe('rebase', () => {
  it('replays commits onto a new base with new hashes', () => {
    const before = diverged();
    const featureCommits = ['f1', 'f2'].map((m) =>
      Object.values(before.local.objects).find(
        (o) => o.type === 'commit' && firstLine(o.message) === m) as { oid: string });

    const w = run(['git switch feature', 'git rebase main'], before);

    // Linear history: main's commit is now an ancestor of feature's.
    expect(graph(w).map((l) => l.replace(/^\w+ (\([^)]*\) )?/, ''))).toEqual(['f2', 'f1', 'm1', 'base']);

    // Same changes, different commits — the point of the lesson.
    const replayed = graph(w).map((l) => l.split(' ')[0]);
    for (const c of featureCommits) expect(replayed).not.toContain(c.oid.slice(0, 7));
    expect(fileLines(w, 'main.txt')).toEqual(['m1']);
    expect(fileLines(w, 'feature.txt')).toEqual(['f2']);
  });

  it('preserves the original author while giving the commit a new id', () => {
    const before = run(['git switch feature'], diverged());
    const original = readCommit(before.local, headOid(before.local)!);
    const after = run(['git rebase main'], before);
    const replayed = readCommit(after.local, headOid(after.local)!);
    expect(replayed.author).toEqual(original.author);
    expect(replayed.oid).not.toBe(original.oid);
  });

  it('stops on conflict, then continues', () => {
    let w = run([
      'git init',
      'echo "start" > f.txt', 'git add .', 'git commit -m "base"',
      'git switch -c feature', 'echo "feature" > f.txt', 'git commit -am "feature edit"',
      'git switch main', 'echo "main" > f.txt', 'git commit -am "main edit"',
      'git switch feature',
    ]);

    const r = exec(w, 'git rebase main');
    expect(r.exitCode).toBe(1);
    expect(r.stdout.join('\n')).toContain('CONFLICT');
    expect(r.world.local.operation.kind).toBe('rebase');
    expect(unmergedPaths(r.world.local.index)).toEqual(['f.txt']);

    w = run(['echo "resolved" > f.txt', 'git add f.txt', 'git rebase --continue'], r.world);
    expect(w.local.operation.kind).toBe('none');
    expect(fileLines(w, 'f.txt')).toEqual(['resolved']);
    expect(graph(w).map((l) => l.replace(/^\w+ (\([^)]*\) )?/, ''))).toEqual(['feature edit', 'main edit', 'base']);
  });

  it('--abort puts everything back exactly as it was', () => {
    const before = run(['git switch feature'], run([
      'git init',
      'echo "start" > f.txt', 'git add .', 'git commit -m "base"',
      'git switch -c feature', 'echo "feature" > f.txt', 'git commit -am "feature edit"',
      'git switch main', 'echo "main" > f.txt', 'git commit -am "main edit"',
    ]));

    const conflicted = exec(before, 'git rebase main').world;
    const aborted = run(['git rebase --abort'], conflicted);

    expect(aborted.local.operation.kind).toBe('none');
    expect(headOid(aborted.local)).toBe(headOid(before.local));
    expect(aborted.local.worktree).toEqual(before.local.worktree);
    expect(aborted.local.refs).toEqual(before.local.refs);
  });
});

describe('cherry-pick', () => {
  it('copies one commit onto another branch as a new commit', () => {
    const w = run(['git switch main', 'git cherry-pick feature~1'], diverged());
    expect(fileLines(w, 'feature.txt')).toEqual(['f1']);
    expect(graph(w).map((l) => l.replace(/^\w+ (\([^)]*\) )?/, '')).slice(0, 2)).toEqual(['f1', 'm1']);
    // main.txt is untouched: only the one commit's change came across.
    expect(fileLines(w, 'main.txt')).toEqual(['m1']);
  });
});
