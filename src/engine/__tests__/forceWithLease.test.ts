import { describe, expect, it } from 'vitest';
import { exec, run } from './helpers';
import { headOid, resolveRefToOid } from '../refs';
import type { World } from '../types';

/** A local repo with one commit, pushed to origin — where a teammate has since moved main. */
const divergedWithTeammate = (): World => {
  let w = run([
    'git init',
    'echo "hello" > README.md', 'git add .', 'git commit -m "initial"',
    'git remote add origin https://github.com/you/project.git',
    'git push -u origin main',
    'teammate push main README.md "their work" "teammate commit"',
  ]);
  w = run(['echo "my work" > README.md', 'git commit -am "my commit"'], w);
  return w;
};

describe('push --force-with-lease', () => {
  it('refuses when the remote moved since your last fetch', () => {
    const w = divergedWithTeammate();
    const r = exec(w, 'git push --force-with-lease');
    expect(r.exitCode).toBe(1);
    expect(r.stderr.join('\n')).toContain('stale info');
    // The teammate's commit on the server is untouched.
    expect(resolveRefToOid(r.world.origin!, 'refs/heads/main'))
      .toBe(resolveRefToOid(w.origin!, 'refs/heads/main'));
    expect(r.events.some((e) => e.type === 'pushed')).toBe(false);
  });

  it('succeeds once a fetch refreshes the tracking ref', () => {
    let w = divergedWithTeammate();
    w = run(['git fetch'], w);
    const r = exec(w, 'git push --force-with-lease');
    expect(r.exitCode).toBe(0);
    expect(resolveRefToOid(r.world.origin!, 'refs/heads/main')).toBe(headOid(w.local));
    expect(r.events.some((e) => e.type === 'pushed' && e.forced)).toBe(true);
  });

  it('--force overwrites without any lease check and reports a forced push', () => {
    const r = exec(divergedWithTeammate(), 'git push --force');
    expect(r.exitCode).toBe(0);
    expect(r.events.some((e) => e.type === 'pushed' && e.forced)).toBe(true);
  });
});
