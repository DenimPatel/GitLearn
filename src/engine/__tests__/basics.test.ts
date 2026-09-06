import { describe, expect, it } from 'vitest';
import { exec, graph, oneCommit, run } from './helpers';
import { emptyWorld } from '../world';
import { headOid } from '../refs';
import { indexFlat, unmergedPaths } from '../gitIndex';
import { status } from '../status';

describe('init and the three trees', () => {
  it('refuses every command outside a repository', () => {
    const r = exec(emptyWorld(), 'git status');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr[0]).toContain('not a git repository');
  });

  it('leaves an unborn branch after init', () => {
    const w = run(['git init']);
    expect(w.local.refs['HEAD']).toEqual({ kind: 'symbolic', target: 'refs/heads/main' });
    expect(headOid(w.local)).toBeNull();
    expect(w.local.refs['refs/heads/main']).toBeUndefined();
  });

  it('moves a file working dir -> index -> commit', () => {
    let w = run(['git init', 'echo "hi" > a.txt']);
    expect(status(w.local).untracked).toEqual(['a.txt']);

    w = run(['git add a.txt'], w);
    expect(status(w.local).staged).toEqual([{ path: 'a.txt', state: 'staged-new' }]);
    expect(status(w.local).untracked).toEqual([]);

    w = run(['git commit -m "add a"'], w);
    expect(status(w.local).clean).toBe(true);
    expect(graph(w)).toEqual([expect.stringContaining('(HEAD -> main) add a')]);
  });

  it('refuses an empty commit and reports why', () => {
    const w = oneCommit();
    const r = exec(w, 'git commit -m "nothing"');
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toContain('nothing to commit, working tree clean');
  });

  it('does not copy the commit back over the working tree', () => {
    // The old engine did this, which hid the point of the index entirely.
    let w = oneCommit();
    w = run(['echo "edited" > README.md'], w);
    w = run(['git add README.md', 'git commit -m "edit"'], w);
    expect(w.local.worktree.files['README.md']).toBe('edited\n');
  });

  it('is deterministic: the same script yields the same object ids', () => {
    const a = oneCommit();
    const b = oneCommit();
    expect(headOid(a.local)).toBe(headOid(b.local));
    expect(Object.keys(a.local.objects).sort()).toEqual(Object.keys(b.local.objects).sort());
  });

  it('survives a JSON round trip unchanged', () => {
    const w = oneCommit();
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
  });

  it('dedups identical content into one blob', () => {
    const w = run(['git init', 'echo "same" > a.txt', 'echo "same" > b.txt', 'git add .']);
    const flat = indexFlat(w.local.index);
    expect(flat['a.txt']).toBe(flat['b.txt']);
  });

  it('honours .gitignore', () => {
    const w = run([
      'git init',
      'echo "secret.txt" > .gitignore',
      'echo "shh" > secret.txt',
      'echo "ok" > public.txt',
    ]);
    expect(status(w.local).untracked).toEqual(['.gitignore', 'public.txt']);
  });

  it('has no unmerged entries in ordinary use', () => {
    expect(unmergedPaths(oneCommit().local.index)).toEqual([]);
  });
});

describe('the diff matrix', () => {
  it('separates worktree-vs-index from index-vs-HEAD', () => {
    let w = oneCommit();
    w = run(['echo "staged" > README.md', 'git add README.md', 'echo "unstaged" > README.md'], w);

    const staged = exec(w, 'git diff --staged');
    expect(staged.stdout.join('\n')).toContain('+staged');

    const unstaged = exec(w, 'git diff');
    expect(unstaged.stdout.join('\n')).toContain('+unstaged');
    expect(unstaged.stdout.join('\n')).toContain('-staged');
  });
});
