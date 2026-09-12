import { describe, expect, it } from 'vitest';
import { exec, run } from './helpers';
import { currentBranchName } from '../refs';

describe('config', () => {
  it('sets and reads a value, and works outside a repository', () => {
    const w = run(['git config user.name "Ada Lovelace"']);
    expect(w.local.config['user.name']).toBe('Ada Lovelace');
    const r = exec(w, 'git config user.name');
    expect(r.stdout).toEqual(['Ada Lovelace']);
  });

  it('reads back a set username with a plain get', () => {
    const w = run(['git config alias.st status']);
    expect(exec(w, 'git config alias.st').stdout).toEqual(['status']);
  });

  it('--list prints key=value lines', () => {
    const w = run(['git config user.email "ada@example.com"']);
    const r = exec(w, 'git config --list');
    expect(r.stdout).toContain('user.email=ada@example.com');
  });

  it('init.defaultBranch decides the branch git init creates', () => {
    const w = run(['git config init.defaultBranch trunk', 'git init']);
    expect(currentBranchName(w.local)).toBe('trunk');
  });

  it('--unset removes a key, and a missing key get exits non-zero', () => {
    let w = run(['git config custom.key value']);
    w = exec(w, 'git config --unset custom.key').world;
    expect(w.local.config['custom.key']).toBeUndefined();
    expect(exec(w, 'git config custom.key').exitCode).toBe(1);
  });

  it('refuses to commit when identity is unknown', () => {
    let w = run(['git config --unset user.name']);
    w = run(['git init', 'echo x > a.txt', 'git add a.txt'], w);
    const r = exec(w, 'git commit -m "x"');
    expect(r.exitCode).toBe(128);
    expect(r.stderr.join('\n')).toContain('tell me who you are');
  });
});
