/** One source of truth for a command's identity. Colour, label and syntax are
 *  defined here and consumed everywhere, rather than duplicated across views as
 *  in the old LessonView/PlaygroundView split. */

export type CommandTone = 'create' | 'stage' | 'commit' | 'branch' | 'merge' | 'undo' | 'remote' | 'inspect' | 'shell';

export const TONE_CLASS: Record<CommandTone, string> = {
  create:  'text-tone-create border-tone-create/40 bg-tone-create/10 hover:bg-tone-create/20',
  stage:   'text-tone-stage border-tone-stage/40 bg-tone-stage/10 hover:bg-tone-stage/20',
  commit:  'text-tone-commit border-tone-commit/40 bg-tone-commit/10 hover:bg-tone-commit/20',
  branch:  'text-tone-branch border-tone-branch/40 bg-tone-branch/10 hover:bg-tone-branch/20',
  merge:   'text-tone-merge border-tone-merge/40 bg-tone-merge/10 hover:bg-tone-merge/20',
  undo:    'text-tone-undo border-tone-undo/40 bg-tone-undo/10 hover:bg-tone-undo/20',
  remote:  'text-tone-remote border-tone-remote/40 bg-tone-remote/10 hover:bg-tone-remote/20',
  inspect: 'text-tone-inspect border-tone-inspect/40 bg-tone-inspect/10 hover:bg-tone-inspect/20',
  shell:   'text-fg-muted border-border bg-surface-raised hover:bg-surface-hover',
};

const TONES: Record<string, CommandTone> = {
  init: 'create', clone: 'remote',
  add: 'stage', rm: 'stage', restore: 'undo',
  commit: 'commit',
  branch: 'branch', switch: 'branch', checkout: 'branch', tag: 'branch',
  merge: 'merge', rebase: 'merge', 'cherry-pick': 'merge',
  reset: 'undo', revert: 'undo', reflog: 'undo', stash: 'undo',
  remote: 'remote', fetch: 'remote', push: 'remote', pull: 'remote', gh: 'remote',
  status: 'inspect', log: 'inspect', diff: 'inspect', show: 'inspect',
  'cat-file': 'inspect', 'hash-object': 'inspect', 'ls-files': 'inspect',
  'ls-tree': 'inspect', 'rev-parse': 'inspect', 'show-ref': 'inspect',
  'symbolic-ref': 'inspect',
};

/** The tone for a whole command line, picked from its subcommand. */
export function toneFor(command: string): CommandTone {
  const parts = command.trim().split(/\s+/);
  const name = parts[0] === 'git' ? parts[1] : parts[0];
  return TONES[name ?? ''] ?? 'shell';
}

/** Lane colours for branches in the graph. */
export const BRANCH_COLORS = [
  '#58a6ff', '#3fb950', '#d29922', '#bc8cff', '#f778ba', '#39c5cf', '#ff7b72',
];

export const colorForLane = (i: number): string => BRANCH_COLORS[i % BRANCH_COLORS.length];
