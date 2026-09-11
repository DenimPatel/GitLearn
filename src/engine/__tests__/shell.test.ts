import { describe, expect, it } from 'vitest';
import { exec, run } from './helpers';
import { emptyWorld } from '../world';

describe('pwd', () => {
  it('prints the project root', () => {
    const r = exec(emptyWorld(), 'pwd');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toEqual(['/project']);
  });
});

describe('cd', () => {
  it('accepts the project root, ~, . and .. with no argument required', () => {
    for (const cmd of ['cd', 'cd ~', 'cd .', 'cd ..', 'cd /project']) {
      expect(exec(emptyWorld(), cmd).exitCode).toBe(0);
    }
  });

  it('accepts a path that is a prefix of an existing file', () => {
    const w = run(['mkdir src', 'touch src/app.js']);
    const r = exec(w, 'cd src');
    expect(r.exitCode).toBe(0);
  });

  it('accepts a directory that mkdir just created and is still empty', () => {
    // Regression: mkdir used to be a pure no-op, so cd right after it always
    // failed with "No such file or directory" even though mkdir had just "succeeded".
    const w = run(['mkdir a']);
    const r = exec(w, 'cd a');
    expect(r.exitCode).toBe(0);
  });

  it('refuses a plain file', () => {
    const w = run(['touch notes.md']);
    const r = exec(w, 'cd notes.md');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr.join('\n')).toContain('Not a directory');
  });

  it('refuses a path that does not exist', () => {
    const r = exec(emptyWorld(), 'cd nowhere');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr.join('\n')).toContain('No such file or directory');
  });
});

describe('mkdir', () => {
  it('shows up in ls, with a trailing slash, while still empty', () => {
    const w = run(['mkdir a']);
    const r = exec(w, 'ls');
    expect(r.stdout).toEqual(['a/']);
  });

  it('is idempotent', () => {
    const w = run(['mkdir a']);
    const r = exec(w, 'mkdir a');
    expect(r.exitCode).toBe(0);
  });

  it('refuses a name already taken by a file', () => {
    const w = run(['touch a']);
    const r = exec(w, 'mkdir a');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr.join('\n')).toContain('File exists');
  });

  it('stops showing up on its own in ls once a file exists inside it', () => {
    const w = run(['mkdir a', 'touch a/file.txt']);
    const r = exec(w, 'ls');
    expect(r.stdout).toEqual(['a/file.txt']);
  });
});

describe('rm and directories', () => {
  it('refuses to remove an empty directory without -r', () => {
    const w = run(['mkdir a']);
    const r = exec(w, 'rm a');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr.join('\n')).toContain('Is a directory');
  });

  it('removes an empty directory with -r, and cd into it fails afterward', () => {
    let w = run(['mkdir a']);
    const removed = exec(w, 'rm -r a');
    expect(removed.exitCode).toBe(0);
    w = removed.world;
    const r = exec(w, 'cd a');
    expect(r.exitCode).not.toBe(0);
  });
});

describe('cp', () => {
  it('copies a file, leaving the source intact', () => {
    let w = run(['echo "hi" > a.txt']);
    w = run(['cp a.txt b.txt'], w);
    expect(w.local.worktree.files['a.txt']).toBe('hi\n');
    expect(w.local.worktree.files['b.txt']).toBe('hi\n');
  });

  it('refuses a missing source', () => {
    const r = exec(emptyWorld(), 'cp missing.txt b.txt');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr.join('\n')).toContain('No such file or directory');
  });
});

describe('mv', () => {
  it('renames a file', () => {
    let w = run(['echo "hi" > a.txt']);
    w = run(['mv a.txt b.txt'], w);
    expect(w.local.worktree.files['a.txt']).toBeUndefined();
    expect(w.local.worktree.files['b.txt']).toBe('hi\n');
  });

  it('refuses a missing source', () => {
    const r = exec(emptyWorld(), 'mv missing.txt b.txt');
    expect(r.exitCode).not.toBe(0);
  });
});

describe('less', () => {
  it('shows a file’s contents, like cat', () => {
    const w = run(['echo "line one" > notes.md']);
    const r = exec(w, 'less notes.md');
    expect(r.stdout).toEqual(['line one']);
  });

  it('refuses a missing file', () => {
    const r = exec(emptyWorld(), 'less missing.txt');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr.join('\n')).toContain('No such file or directory');
  });
});

describe('grep', () => {
  const withLogs = () => run([
    'echo "starting up" > server.log',
    'echo "connection error" >> server.log',
    'echo "all good" >> server.log',
    'echo "another error here" > other.log',
  ]);

  it('finds matching lines in a single file', () => {
    const r = exec(withLogs(), 'grep error server.log');
    expect(r.stdout).toEqual(['connection error']);
  });

  it('prefixes with the filename when searching multiple files', () => {
    const r = exec(withLogs(), 'grep error server.log other.log');
    expect(r.stdout).toEqual(['server.log:connection error', 'other.log:another error here']);
  });

  it('supports -n for line numbers', () => {
    const r = exec(withLogs(), 'grep -n error server.log');
    expect(r.stdout).toEqual(['2:connection error']);
  });

  it('supports -i for case-insensitive matching', () => {
    const r = exec(withLogs(), 'grep -i ERROR server.log');
    expect(r.stdout).toEqual(['connection error']);
  });

  it('supports -r to search every file under a path prefix', () => {
    const w = run(['mkdir logs', 'echo "boom error" > logs/a.log', 'echo "fine" > logs/b.log']);
    const r = exec(w, 'grep -r error logs');
    expect(r.stdout).toEqual(['logs/a.log:boom error']);
  });

  it('refuses a missing file outside recursive mode', () => {
    const r = exec(emptyWorld(), 'grep foo missing.txt');
    expect(r.exitCode).not.toBe(0);
  });
});

describe('history', () => {
  it('lists commands run so far, numbered from 1', () => {
    const w = run(['git init', 'echo "hi" > a.txt', 'git add a.txt']);
    const r = exec(w, 'history');
    expect(r.stdout).toEqual([
      '1  git init',
      '2  echo "hi" > a.txt',
      '3  git add a.txt',
    ]);
  });

  it('does not record a command that failed', () => {
    let w = run(['git init']);
    w = exec(w, 'git this-is-not-a-command').world;
    const r = exec(w, 'history');
    expect(r.stdout).toEqual(['1  git init']);
  });

  it('clears with -c, which itself becomes the only entry afterward', () => {
    let w = run(['git init', 'git status']);
    w = exec(w, 'history -c').world;
    const r = exec(w, 'history');
    expect(r.stdout).toEqual(['1  history -c']);
  });
});
