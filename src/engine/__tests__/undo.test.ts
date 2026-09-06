import { describe, expect, it } from 'vitest';
import { exec, fileLines, run } from './helpers';
import { headOid } from '../refs';
import { indexFlat } from '../gitIndex';
import { flatTreeOfCommit } from '../trees';
import { status } from '../status';
import type { World } from '../types';

/** main with three commits, each adding a line to file.txt. */
const threeCommits = (): World => run([
  'git init',
  'echo "one" > file.txt', 'git add .', 'git commit -m "one"',
  'echo "two" > file.txt', 'git commit -am "two"',
  'echo "three" > file.txt', 'git commit -am "three"',
]);

describe('restore', () => {
  it('discards a working-directory change', () => {
    let w = threeCommits();
    w = run(['echo "oops" > file.txt'], w);
    w = run(['git restore file.txt'], w);
    expect(fileLines(w, 'file.txt')).toEqual(['three']);
  });

  it('--staged unstages without touching your file', () => {
    let w = threeCommits();
    w = run(['echo "wip" > file.txt', 'git add file.txt'], w);
    expect(status(w.local).staged).toHaveLength(1);

    w = run(['git restore --staged file.txt'], w);
    expect(status(w.local).staged).toHaveLength(0);
    expect(status(w.local).unstaged).toHaveLength(1);
    expect(fileLines(w, 'file.txt')).toEqual(['wip']); // the edit is still there
  });
});

describe('reset: the three-tree matrix', () => {
  // Each mode moves HEAD, then optionally drags the index and working tree.
  const cases: [string, { head: string; index: string; worktree: string }][] = [
    ['--soft',  { head: 'two', index: 'three', worktree: 'three' }],
    ['--mixed', { head: 'two', index: 'two',   worktree: 'three' }],
    ['--hard',  { head: 'two', index: 'two',   worktree: 'two' }],
  ];

  for (const [mode, expected] of cases) {
    it(`${mode} moves exactly the right trees`, () => {
      const w = run([`git reset ${mode} HEAD~1`], threeCommits());
      const repo = w.local;
      const headContent = (repo.objects[flatTreeOfCommit(repo, headOid(repo))['file.txt']] as { content: string }).content;
      const indexContent = (repo.objects[indexFlat(repo.index)['file.txt']] as { content: string }).content;
      expect(headContent.trim()).toBe(expected.head);
      expect(indexContent.trim()).toBe(expected.index);
      expect(repo.worktree.files['file.txt'].trim()).toBe(expected.worktree);
    });
  }

  it('leaves the old commit reachable through the reflog', () => {
    const before = threeCommits();
    const lost = headOid(before.local)!;

    const after = run(['git reset --hard HEAD~2'], before);
    expect(headOid(after.local)).not.toBe(lost);
    expect(fileLines(after, 'file.txt')).toEqual(['one']);

    // Nothing is deleted — only unreferenced. The reflog is how you get back.
    const log = exec(after, 'git reflog');
    expect(log.stdout.join('\n')).toContain(lost.slice(0, 7));

    const recovered = run([`git reset --hard ${lost}`], after);
    expect(headOid(recovered.local)).toBe(lost);
    expect(fileLines(recovered, 'file.txt')).toEqual(['three']);
  });
});

describe('revert', () => {
  it('undoes a commit by adding a new one', () => {
    let w = threeCommits();
    const before = headOid(w.local)!;
    w = run(['git revert HEAD --no-edit'], w);

    expect(fileLines(w, 'file.txt')).toEqual(['two']);
    // History grew; it was not rewritten.
    const head = headOid(w.local)!;
    expect(head).not.toBe(before);
    expect((w.local.objects[head] as { parents: string[] }).parents).toEqual([before]);
  });
});

describe('amend', () => {
  it('replaces the tip commit rather than editing it', () => {
    let w = threeCommits();
    const before = headOid(w.local)!;
    const beforeParents = (w.local.objects[before] as { parents: string[] }).parents;

    w = run(['git commit --amend -m "three, reworded"'], w);
    const after = headOid(w.local)!;

    expect(after).not.toBe(before);
    expect((w.local.objects[after] as { parents: string[] }).parents).toEqual(beforeParents);
    expect(w.local.objects[before]).toBeDefined(); // the old one still exists, just unreferenced
  });
});

describe('stash', () => {
  it('parks work, cleans the tree, and gives it back', () => {
    let w = threeCommits();
    w = run(['echo "in progress" > file.txt'], w);

    w = run(['git stash'], w);
    expect(fileLines(w, 'file.txt')).toEqual(['three']);
    expect(w.local.stash).toHaveLength(1);
    expect(status(w.local).clean).toBe(true);

    w = run(['git stash pop'], w);
    expect(fileLines(w, 'file.txt')).toEqual(['in progress']);
    expect(w.local.stash).toHaveLength(0);
  });

  it('says so when there is nothing to stash', () => {
    const r = exec(threeCommits(), 'git stash');
    expect(r.stdout.join('\n')).toContain('No local changes to save');
  });
});
