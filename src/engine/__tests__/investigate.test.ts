import { describe, expect, it } from 'vitest';
import { exec, run } from './helpers';
import { revParse } from '../revparse';
import { unreachableCommits } from '../commands/investigate';
import type { World } from '../types';

/** A file with one line by You and one line by Sam. */
const twoAuthors = (): World => run([
  'git init',
  'echo "Line one" > story.txt', 'git add .', 'git commit -m "Start the story"',
  'git remote add origin https://github.com/you/project.git', 'git push -u origin main',
  'teammate push main story.txt "Line one\nLine two, by Sam" "Add a second line"',
  'git pull',
]);

const releaseTagged = (): World => run([
  'git init',
  'echo "version 1.0" > app.js', 'git add app.js', 'git commit -m "Release 1.0"',
  'git tag -a v1.0 -m "Release 1.0"',
  'echo "version 1.1" > app.js', 'git commit -am "Add the export feature"',
  'echo "version 1.2" > app.js', 'git commit -am "Fix the export crash"',
]);

const bisectable = (): World => run([
  'git init',
  'echo "status: OK v1" > app.txt', 'git add app.txt', 'git commit -m "c1"',
  'echo "status: OK v2" > app.txt', 'git commit -am "c2"',
  'echo "status: BROKEN v3" > app.txt', 'git commit -am "c3"',
  'echo "status: BROKEN v4" > app.txt', 'git commit -am "c4"',
]);

describe('blame', () => {
  it('attributes each line to the commit and author that wrote it', () => {
    const r = exec(twoAuthors(), 'git blame story.txt');
    expect(r.stdout).toHaveLength(2);
    expect(r.stdout[0]).toContain('You');
    expect(r.stdout[1]).toContain('Sam');
    expect(r.stdout[0]).toContain('Line one');
    expect(r.stdout[1]).toContain('Line two, by Sam');
  });

  it('refuses a path that does not exist', () => {
    const r = exec(twoAuthors(), 'git blame nope.txt');
    expect(r.exitCode).not.toBe(0);
  });
});

describe('log filters', () => {
  it('--author narrows to one person', () => {
    const w = twoAuthors();
    expect(exec(w, 'git log --author=Sam --oneline').stdout).toHaveLength(1);
    expect(exec(w, 'git log --author=You --oneline').stdout).toHaveLength(1);
  });

  it('-S finds the commit whose diff added a string', () => {
    const r = exec(twoAuthors(), 'git log -S "by Sam" --oneline');
    expect(r.stdout).toHaveLength(1);
    expect(r.stdout[0]).toContain('Add a second line');
  });

  it('parses revision ranges', () => {
    const w = run([
      'git init', 'echo a > a.txt', 'git add .', 'git commit -m "base"',
      'git switch -c feature', 'echo b > b.txt', 'git add .', 'git commit -m "feature work"',
    ]);
    const r = exec(w, 'git log --oneline main..feature');
    expect(r.stdout).toHaveLength(1);
    expect(r.stdout[0]).toContain('feature work');
  });
});

describe('describe and shortlog', () => {
  it('names a commit by the nearest tag and distance', () => {
    const r = exec(releaseTagged(), 'git describe');
    expect(r.stdout[0]).toMatch(/^v1\.0-2-g[0-9a-f]{7}$/);
  });

  it('--abbrev=0 prints only the tag', () => {
    expect(exec(releaseTagged(), 'git describe --abbrev=0').stdout).toEqual(['v1.0']);
  });

  it('shortlog -sn groups by author', () => {
    const r = exec(releaseTagged(), 'git shortlog -sn');
    expect(r.stdout.some((l) => l.includes('You') && l.includes('3'))).toBe(true);
  });
});

describe('fsck', () => {
  it('reports a reset-away commit as dangling', () => {
    const w = run([
      'git init', 'echo one > a.txt', 'git add .', 'git commit -m "First"',
      'echo two > a.txt', 'git commit -am "Second"', 'git reset --hard HEAD~1',
    ]);
    expect(unreachableCommits(w.local)).toHaveLength(1);
    const r = exec(w, 'git fsck');
    expect(r.stdout.some((l) => l.includes('dangling commit'))).toBe(true);
  });
});

describe('bisect', () => {
  it('refuses to mark before start', () => {
    const w = run(['git init', 'echo x > a.txt', 'git add .', 'git commit -m "c"']);
    const r = exec(w, 'git bisect good');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr.join('\n')).toContain('bisect start');
  });

  it('binary-searches to the first bad commit', () => {
    let w = bisectable();
    const culprit = revParse(w.local, 'HEAD~1');
    w = run([
      'git bisect start',
      'git bisect bad',
      'git bisect good HEAD~3',
      'git bisect bad',
      'git bisect good',
    ], w);
    expect(w.local.bisect.bad).toBe(culprit);
    expect(w.local.bisect.remaining).toEqual([]);
  });

  it('reset returns to the original branch', () => {
    let w = run([
      'git bisect start', 'git bisect bad', 'git bisect good HEAD~3', 'git bisect reset',
    ], bisectable());
    expect(w.local.refs['HEAD']).toEqual({ kind: 'symbolic', target: 'refs/heads/main' });
    expect(w.local.bisect.origHead).toBeNull();
  });
});
