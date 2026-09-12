import { describe, expect, it } from 'vitest';
import { exec, run } from './helpers';

/** One commit, plus an untracked scratch file and an ignored log file. */
const messy = () => run([
  'git init',
  'echo "# My Project" > README.md', 'git add README.md', 'git commit -m "Initial commit"',
  'echo "*.log" > .gitignore', 'git add .gitignore', 'git commit -m "Ignore logs"',
  'echo "scratch" > notes.txt',
  'echo "noisy" > debug.log',
]);

describe('clean', () => {
  it('refuses to run without -f', () => {
    const w = messy();
    const r = exec(w, 'git clean');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr.join('\n')).toContain('refusing to clean');
    expect(r.world.local.worktree.files['notes.txt']).toBeDefined();
  });

  it('-n lists but removes nothing; -f removes the untracked file', () => {
    let w = messy();
    const dry = exec(w, 'git clean -n');
    expect(dry.stdout).toEqual(['Would remove notes.txt']);
    expect(dry.world.local.worktree.files['notes.txt']).toBeDefined();

    w = run(['git clean -f'], w);
    expect(w.local.worktree.files['notes.txt']).toBeUndefined();
    // The ignored file is left alone without -x.
    expect(w.local.worktree.files['debug.log']).toBeDefined();
  });

  it('-x also removes ignored files', () => {
    const w = run(['git clean -fx'], messy());
    expect(w.local.worktree.files['debug.log']).toBeUndefined();
  });

  it('never removes tracked files', () => {
    const w = run(['git clean -fx'], messy());
    expect(w.local.worktree.files['README.md']).toBeDefined();
    expect(w.local.worktree.files['.gitignore']).toBeDefined();
  });
});
