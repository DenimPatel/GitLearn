import { describe, expect, it } from 'vitest';
import { exec, graph, run } from './helpers';
import { autosquashSteps } from '../commands/rewrite';

const fixupHistory = () => run([
  'git init',
  'echo "# My Project" > README.md', 'git add README.md', 'git commit -m "Initial commit"',
  'echo "console.log(1)" > app.js', 'git add app.js', 'git commit -m "Add app.js"',
  'echo "TODO" > notes.txt', 'git add notes.txt', 'git commit -m "Add notes"',
]);

describe('autosquashSteps', () => {
  it('moves a fixup directly after its target and marks it fixup', () => {
    const steps = [
      { action: 'pick' as const, oid: 'a', label: 'Add app.js' },
      { action: 'pick' as const, oid: 'b', label: 'Add notes' },
      { action: 'pick' as const, oid: 'c', label: 'fixup! Add app.js' },
    ];
    expect(autosquashSteps(steps).map((s) => [s.oid, s.action])).toEqual([
      ['a', 'pick'], ['c', 'fixup'], ['b', 'pick'],
    ]);
  });

  it('leaves a fixup whose target is absent where it was', () => {
    const steps = [{ action: 'pick' as const, oid: 'c', label: 'fixup! Nowhere' }];
    expect(autosquashSteps(steps)).toEqual(steps);
  });
});

describe('commit --fixup and rebase --autosquash', () => {
  it('folds the fixup into its target and leaves a clean branch', () => {
    let w = fixupHistory();
    w = run(['echo "console.log(1) // patched" > app.js', 'git add app.js'], w);
    w = run(['git commit --fixup HEAD~1'], w);
    expect(graph(w)).toHaveLength(4);
    expect(graph(w)[0]).toContain('fixup! Add app.js');

    w = run(['git rebase -i --autosquash HEAD~3'], w);
    expect(graph(w)).toHaveLength(3);
    expect(graph(w).some((l) => l.includes('fixup!'))).toBe(false);
    expect(w.local.worktree.files['app.js']).toContain('patched');
  });

  it('refuses --fixup with an unknown revision', () => {
    const w = fixupHistory();
    expect(exec(w, 'git commit --fixup nope').exitCode).not.toBe(0);
  });
});
