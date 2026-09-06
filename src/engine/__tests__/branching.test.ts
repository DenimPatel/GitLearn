import { describe, expect, it } from 'vitest';
import { exec, fileLines, graph, oneCommit, run } from './helpers';
import { currentBranchName, headOid, isDetached } from '../refs';
import { mergeBase, isAncestor, mergeBases } from '../merge/mergeBase';
import { unmergedPaths } from '../gitIndex';
import { emptyRepo } from '../world';
import { writeObject } from '../objects';
import type { Oid } from '../types';

describe('branches and the working directory', () => {
  it('switching branches actually changes your files', () => {
    // The single most important thing a branch does, and the thing the old
    // engine did not model at all.
    let w = oneCommit();
    w = run([
      'git switch -c feature',
      'echo "feature work" > feature.txt',
      'git add feature.txt',
      'git commit -m "add feature file"',
    ], w);
    expect(w.local.worktree.files['feature.txt']).toBeDefined();

    w = run(['git switch main'], w);
    expect(w.local.worktree.files['feature.txt']).toBeUndefined();

    w = run(['git switch feature'], w);
    expect(w.local.worktree.files['feature.txt']).toBeDefined();
  });

  it('refuses to switch when it would overwrite local changes', () => {
    let w = oneCommit();
    w = run(['git switch -c feature', 'echo "v2" > README.md', 'git commit -am "change readme"',
             'git switch main', 'echo "uncommitted" > README.md'], w);
    const r = exec(w, 'git switch feature');
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toContain('Your local changes to the following files would be overwritten');
    expect(r.world.local.worktree.files['README.md']).toBe('uncommitted\n');
  });

  it('detaches HEAD when you check out a commit', () => {
    let w = oneCommit();
    w = run(['echo "second" > b.txt', 'git add .', 'git commit -m "second"'], w);
    const first = w.local.reflogs['HEAD'].at(-1)!.after;

    w = run([`git checkout ${first.slice(0, 7)}`], w);
    expect(isDetached(w.local)).toBe(true);
    expect(currentBranchName(w.local)).toBeNull();
    expect(headOid(w.local)).toBe(first);

    w = run(['git switch main'], w);
    expect(isDetached(w.local)).toBe(false);
  });

  it('will not delete an unmerged branch without -D', () => {
    let w = oneCommit();
    w = run(['git switch -c feature', 'echo x > x.txt', 'git add .', 'git commit -m "wip"',
             'git switch main'], w);
    expect(exec(w, 'git branch -d feature').exitCode).toBe(1);
    expect(exec(w, 'git branch -D feature').exitCode).toBe(0);
  });
});

describe('merge base', () => {
  const linear = () => {
    const repo = emptyRepo({ initialized: true });
    const sig = { name: 'T', email: 't@e', timestamp: 0, tzOffset: '+0000' };
    const tree = writeObject(repo, { type: 'tree', entries: [] });
    const mk = (parents: Oid[], message: string) =>
      writeObject(repo, { type: 'commit', tree, parents, author: sig, committer: sig, message });
    return { repo, mk };
  };

  it('finds the fork point of a diamond', () => {
    const { repo, mk } = linear();
    const a = mk([], 'a');
    const b = mk([a], 'b');
    const c = mk([a], 'c');
    expect(mergeBase(repo, b, c)).toBe(a);
    expect(isAncestor(repo, a, b)).toBe(true);
    expect(isAncestor(repo, b, c)).toBe(false);
  });

  it('treats an ancestor as its own base in a linear history', () => {
    const { repo, mk } = linear();
    const a = mk([], 'a');
    const b = mk([a], 'b');
    expect(mergeBase(repo, a, b)).toBe(a);
  });

  it('returns nothing for unrelated histories', () => {
    const { repo, mk } = linear();
    const a = mk([], 'a');
    const b = mk([], 'b-root');
    expect(mergeBase(repo, a, b)).toBeNull();
  });

  it('reports both bases of a criss-cross', () => {
    const { repo, mk } = linear();
    const root = mk([], 'root');
    const a = mk([root], 'a');
    const b = mk([root], 'b');
    const m1 = mk([a, b], 'm1');
    const m2 = mk([b, a], 'm2');
    expect(mergeBases(repo, m1, m2).sort()).toEqual([a, b].sort());
  });
});

describe('merging', () => {
  const diverged = () => run([
    'git init',
    'echo "line one" > file.txt',
    'git add .', 'git commit -m "base"',
    'git switch -c feature',
  ]);

  it('fast-forwards when the branch has no commits of its own', () => {
    let w = diverged();
    w = run(['echo "line one\nfeature" > file.txt', 'git commit -am "feature work"', 'git switch main'], w);
    const r = exec(w, 'git merge feature');
    expect(r.stdout.join('\n')).toContain('Fast-forward');
    expect(r.events.some((e) => e.type === 'merged' && e.strategy === 'fast-forward')).toBe(true);
    // A fast-forward creates no commit — the label just slides.
    expect(graph(r.world).length).toBe(2);
  });

  it('makes a real merge commit with --no-ff', () => {
    let w = diverged();
    w = run(['echo "line one\nfeature" > file.txt', 'git commit -am "feature work"', 'git switch main'], w);
    const r = exec(w, 'git merge --no-ff feature');
    expect(r.exitCode).toBe(0);
    const head = headOid(r.world.local)!;
    expect(r.world.local.objects[head]).toMatchObject({ type: 'commit' });
    expect((r.world.local.objects[head] as { parents: string[] }).parents).toHaveLength(2);
  });

  it('does a three-way merge of independent changes', () => {
    let w = diverged();
    w = run(['echo "line one\nfrom feature" > file.txt', 'git commit -am "feature"',
             'git switch main', 'echo "from main\nline one" > file.txt', 'git commit -am "main"'], w);
    const r = exec(w, 'git merge feature');
    expect(r.exitCode).toBe(0);
    expect(fileLines(r.world, 'file.txt')).toEqual(['from main', 'line one', 'from feature']);
  });

  it('conflicts when both sides change the same line, and keeps the evidence', () => {
    let w = diverged();
    w = run(['echo "theirs" > file.txt', 'git commit -am "feature edit"',
             'git switch main', 'echo "ours" > file.txt', 'git commit -am "main edit"'], w);

    const r = exec(w, 'git merge feature');
    expect(r.exitCode).toBe(1);
    expect(r.stdout.join('\n')).toContain('CONFLICT (content): Merge conflict in file.txt');

    // The conflicted state must survive a failed command.
    const after = r.world;
    expect(unmergedPaths(after.local.index)).toEqual(['file.txt']);
    expect(after.local.index.entries.filter((e) => e.path === 'file.txt').map((e) => e.stage).sort())
      .toEqual([1, 2, 3]);
    expect(fileLines(after, 'file.txt')).toEqual([
      '<<<<<<< HEAD', 'ours', '=======', 'theirs', '>>>>>>> feature',
    ]);
    expect(after.local.operation.kind).toBe('merge');

    // Committing is blocked until the stages collapse to stage 0.
    expect(exec(after, 'git commit -m "nope"').exitCode).toBe(1);

    const resolved = run(['echo "both" > file.txt', 'git add file.txt'], after);
    expect(unmergedPaths(resolved.local.index)).toEqual([]);

    const committed = run(['git commit -m "resolve"'], resolved);
    const head = headOid(committed.local)!;
    expect((committed.local.objects[head] as { parents: string[] }).parents).toHaveLength(2);
    expect(committed.local.operation.kind).toBe('none');
  });

  it('restores the pre-merge state on --abort', () => {
    let w = diverged();
    w = run(['echo "theirs" > file.txt', 'git commit -am "feature edit"',
             'git switch main', 'echo "ours" > file.txt', 'git commit -am "main edit"'], w);
    const conflicted = exec(w, 'git merge feature').world;
    const aborted = run(['git merge --abort'], conflicted);
    expect(aborted.local.operation.kind).toBe('none');
    expect(fileLines(aborted, 'file.txt')).toEqual(['ours']);
    expect(unmergedPaths(aborted.local.index)).toEqual([]);
  });
});
