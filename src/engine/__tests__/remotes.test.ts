import { describe, expect, it } from 'vitest';
import { exec, fileLines, graph, run } from './helpers';
import { headOid, resolveRefToOid } from '../refs';
import { status } from '../status';
import type { World } from '../types';

/** A local repo with one commit, pushed to origin. */
const published = (): World => run([
  'git init',
  'echo "hello" > README.md', 'git add .', 'git commit -m "initial"',
  'git remote add origin https://github.com/you/project.git',
  'git push -u origin main',
]);

describe('push', () => {
  it('copies the objects and moves both the remote ref and the tracking ref', () => {
    const w = published();
    const tip = headOid(w.local)!;
    expect(resolveRefToOid(w.origin!, 'refs/heads/main')).toBe(tip);
    expect(resolveRefToOid(w.local, 'refs/remotes/origin/main')).toBe(tip);
    expect(w.origin!.objects[tip]).toBeDefined();
  });

  it('demands an upstream before it will guess', () => {
    const w = run([
      'git init', 'echo x > a.txt', 'git add .', 'git commit -m "c"',
      'git remote add origin https://github.com/you/project.git',
    ]);
    const r = exec(w, 'git push');
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toContain('has no upstream branch');
    expect(r.stderr.join('\n')).toContain('git push --set-upstream origin main');
  });

  it('rejects a non-fast-forward push', () => {
    let w = published();
    w = run(['teammate push main README.md "their work" "teammate commit"'], w);
    w = run(['echo "my work" > README.md', 'git commit -am "my commit"'], w);

    const r = exec(w, 'git push');
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toContain('(fetch first)');
    expect(r.stderr.join('\n')).toContain('failed to push some refs');
    // Nothing moved on the server.
    expect(resolveRefToOid(r.world.origin!, 'refs/heads/main'))
      .toBe(resolveRefToOid(w.origin!, 'refs/heads/main'));
  });
});

describe('fetch vs pull', () => {
  it('fetch updates only the remote-tracking ref, never your branch', () => {
    let w = published();
    const mine = headOid(w.local)!;
    w = run(['teammate push main NOTES.md "notes" "teammate commit"'], w);

    w = run(['git fetch'], w);
    expect(headOid(w.local)).toBe(mine);                       // my branch is untouched
    expect(w.local.worktree.files['NOTES.md']).toBeUndefined(); // my files are untouched
    expect(resolveRefToOid(w.local, 'refs/remotes/origin/main'))
      .toBe(resolveRefToOid(w.origin!, 'refs/heads/main'));    // but I now know where they are

    const s = status(w.local);
    expect(s.behind).toBe(1);
    expect(s.ahead).toBe(0);
  });

  it('pull fast-forwards when you have no local commits', () => {
    let w = published();
    w = run(['teammate push main NOTES.md "notes" "teammate commit"'], w);
    const r = exec(w, 'git pull');
    expect(r.stdout.join('\n')).toContain('Fast-forward');
    expect(r.world.local.worktree.files['NOTES.md']).toBeDefined();
  });

  it('pull on diverged history merges and does NOT discard local work', () => {
    // The old engine silently threw the local commit away here.
    let w = published();
    w = run(['teammate push main THEIRS.md "theirs" "their commit"'], w);
    w = run(['echo "mine" > MINE.md', 'git add .', 'git commit -m "my commit"'], w);
    const mine = headOid(w.local)!;

    const r = exec(w, 'git pull');
    expect(r.exitCode).toBe(0);
    expect(r.stdout.join('\n')).toContain("Merge made by the 'ort' strategy");

    const head = headOid(r.world.local)!;
    expect((r.world.local.objects[head] as { parents: string[] }).parents).toContain(mine);
    expect(r.world.local.worktree.files['MINE.md']).toBeDefined();   // my work survived
    expect(r.world.local.worktree.files['THEIRS.md']).toBeDefined(); // and I got theirs
  });

  it('pull --rebase replays my commit on top of theirs', () => {
    let w = published();
    w = run(['teammate push main THEIRS.md "theirs" "their commit"'], w);
    w = run(['echo "mine" > MINE.md', 'git add .', 'git commit -m "my commit"'], w);

    const r = exec(w, 'git pull --rebase');
    expect(r.exitCode).toBe(0);
    const messages = graph(r.world).map((l) => l.replace(/^\w+ (\([^)]*\) )?/, ''));
    expect(messages).toEqual(['my commit', 'their commit', 'initial']);
    expect(r.world.local.worktree.files['MINE.md']).toBeDefined();
    expect(r.world.local.worktree.files['THEIRS.md']).toBeDefined();
  });
});

describe('clone', () => {
  it('brings down the whole history and sets up tracking', () => {
    const w = published();
    // Start over from an empty world that still has the same origin attached.
    const fresh = { local: { ...w.local }, origin: w.origin, hosting: w.hosting };
    const cloned = run(['git clone https://github.com/you/project.git'], fresh as typeof w);
    expect(cloned.local.worktree.files['README.md']).toBeDefined();
    expect(cloned.local.upstream['refs/heads/main']).toBe('refs/remotes/origin/main');
    expect(resolveRefToOid(cloned.local, 'refs/remotes/origin/main')).toBe(headOid(cloned.local));
  });
});

describe('pull requests', () => {
  it('merges on the server, leaving the local branch behind until you pull', () => {
    let w = published();
    w = run([
      'git switch -c feature',
      'echo "feature" > feature.txt', 'git add .', 'git commit -m "add feature"',
      'git push -u origin feature',
      'gh pr create --title "Add feature"',
    ], w);
    expect(w.hosting.pullRequests[0]).toMatchObject({ status: 'open', sourceBranch: 'feature', targetBranch: 'main' });

    w = run(['gh pr merge'], w);
    expect(w.hosting.pullRequests[0].status).toBe('merged');

    // The merge happened on origin; the local main knows nothing yet.
    expect(resolveRefToOid(w.local, 'refs/heads/main'))
      .not.toBe(resolveRefToOid(w.origin!, 'refs/heads/main'));

    w = run(['git switch main', 'git pull origin main'], w);
    expect(resolveRefToOid(w.local, 'refs/heads/main'))
      .toBe(resolveRefToOid(w.origin!, 'refs/heads/main'));
    expect(fileLines(w, 'feature.txt')).toEqual(['feature']);
  });

  it('refuses a pull request from a branch that was never pushed', () => {
    const w = run(['git switch -c local-only', 'echo x > x.txt', 'git add .', 'git commit -m "x"'], published());
    const r = exec(w, 'gh pr create --title "nope"');
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toContain('git push -u origin local-only');
  });
});
