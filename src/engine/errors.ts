/** Every failure in the engine is a GitError carrying real git stderr text.
 *  execute() catches it, discards the mutated draft, and returns the original
 *  world — so a command is atomic even when a handler fails halfway through. */
export class GitError extends Error {
  constructor(
    public lines: string[],
    public exitCode: number = 1,
    /** Rendered in git's dim hint style, and a hook for tutorial explainers. */
    public hint: string[] = [],
    public id: string = 'generic',
  ) {
    super(lines[0] ?? 'error');
    this.name = 'GitError';
  }
}

const e = (id: string, lines: string[], hint: string[] = [], code = 128) =>
  new GitError(lines, code, hint, id);

export const E = {
  notARepo: () =>
    e('not-a-repo', ['fatal: not a git repository (or any of the parent directories): .git']),

  pathspecNotMatch: (p: string) =>
    e('pathspec', [`fatal: pathspec '${p}' did not match any files`]),

  noCommitsYet: () => e('no-commits', ["fatal: your current branch 'main' does not have any commits yet"]),

  unknownRevision: (r: string) =>
    e('unknown-revision', [
      `fatal: ambiguous argument '${r}': unknown revision or path not in the working tree.`,
      "Use '--' to separate paths from revisions, like this:",
      "'git <command> [<revision>...] -- [<file>...]'",
    ]),

  ambiguousOid: (p: string) => e('ambiguous', [`fatal: ambiguous argument '${p}': multiple objects match`]),

  nothingToCommit: (branch: string, unborn: boolean) =>
    new GitError(
      [
        `On branch ${branch}`,
        ...(unborn ? ['', 'No commits yet'] : []),
        '',
        'nothing to commit, working tree clean',
      ],
      1,
      [],
      'nothing-to-commit',
    ),

  emptyCommitMessage: () =>
    new GitError(['Aborting commit due to empty commit message.'], 1, [], 'empty-message'),

  unmergedFiles: () =>
    new GitError(
      [
        'error: Committing is not possible because you have unmerged files.',
        'fatal: Exiting because of an unresolved conflict.',
      ],
      1,
      [
        "hint: Fix them up in the work tree, and then use 'git add/rm <file>'",
        'hint: as appropriate to mark resolution and make a commit.',
      ],
      'unmerged',
    ),

  branchExists: (b: string) => e('branch-exists', [`fatal: a branch named '${b}' already exists`]),

  branchNotFound: (b: string) => e('branch-not-found', [`error: branch '${b}' not found.`]),

  invalidRefName: (b: string) => e('invalid-ref', [`fatal: '${b}' is not a valid branch name`]),

  cannotDeleteCurrent: (b: string) =>
    e('delete-current', [
      `error: Cannot delete branch '${b}' checked out at '/project'`,
    ]),

  notFullyMerged: (b: string) =>
    new GitError(
      [`error: the branch '${b}' is not fully merged.`],
      1,
      [
        `hint: If you are sure you want to delete it, run 'git branch -D ${b}'.`,
      ],
      'not-merged',
    ),

  localChangesOverwritten: (paths: string[], verb = 'checkout') =>
    new GitError(
      [
        'error: Your local changes to the following files would be overwritten by ' + verb + ':',
        ...paths.map((p) => `\t${p}`),
        'Please commit your changes or stash them before you switch branches.',
        'Aborting',
      ],
      1,
      [],
      'local-changes',
    ),

  mergeInProgress: (cmd: string) =>
    e('merge-in-progress', [
      `fatal: You have not concluded your merge (MERGE_HEAD exists).`,
      `Please, commit your changes before you ${cmd}.`,
    ]),

  noMergeInProgress: () =>
    e('no-merge', ['fatal: There is no merge to abort (MERGE_HEAD missing).']),

  noRebaseInProgress: () =>
    e('no-rebase', ['fatal: No rebase in progress?']),

  rebaseInProgress: () =>
    e('rebase-in-progress', [
      'fatal: It seems that there is already a rebase directory.',
      'Use "git rebase --continue" or "git rebase --abort".',
    ]),

  cannotCommitDuringRebase: () =>
    e('commit-during-rebase', [
      'fatal: cannot commit during a rebase; use `git rebase --continue`',
    ]),

  noRemote: (name: string) => e('no-remote', [`fatal: '${name}' does not appear to be a git repository`]),

  remoteExists: (name: string) => e('remote-exists', [`error: remote ${name} already exists.`]),

  noUpstream: (branch: string) =>
    new GitError(
      ['fatal: The current branch ' + branch + ' has no upstream branch.'],
      1,
      [
        'hint: To push the current branch and set the remote as upstream, use',
        'hint:',
        `hint:     git push --set-upstream origin ${branch}`,
      ],
      'no-upstream',
    ),

  nonFastForward: (branch: string, url: string) =>
    new GitError(
      [
        `To ${url}`,
        ` ! [rejected]        ${branch} -> ${branch} (fetch first)`,
        `error: failed to push some refs to '${url}'`,
      ],
      1,
      [
        'hint: Updates were rejected because the remote contains work that you do not',
        'hint: have locally. This is usually caused by another repository pushing to',
        'hint: the same ref. If you want to integrate the remote changes, use',
        "hint: 'git pull' before pushing again.",
      ],
      'non-fast-forward',
    ),

  divergedNoStrategy: () =>
    new GitError(
      ['fatal: Need to specify how to reconcile divergent branches.'],
      1,
      [
        'hint: You have divergent branches and need to specify how to reconcile them.',
        "hint: Run 'git pull --rebase' or 'git pull --no-rebase'.",
      ],
      'diverged',
    ),

  noStash: () => new GitError(['No stash entries found.'], 1, [], 'no-stash'),

  stashDirtyConflict: () =>
    new GitError(['error: could not restore untracked files from stash'], 1, [], 'stash-conflict'),

  notSomethingWeCanMerge: (r: string) =>
    e('not-mergeable', [`merge: ${r} - not something we can merge`]),

  alreadyExistsTag: (t: string) => e('tag-exists', [`fatal: tag '${t}' already exists`]),

  unknownCommand: (c: string) =>
    new GitError(
      [`git: '${c}' is not a git command. See 'git help'.`],
      1,
      [],
      'unknown-command',
    ),

  unknownFlag: (cmd: string, f: string) =>
    e('unknown-flag', [`error: unknown option \`${f}'`, `usage: git ${cmd} ...`]),

  missingArg: (f: string) => e('missing-arg', [`error: option \`${f}' requires a value`]),

  shell: (msg: string) => new GitError([msg], 1, [], 'shell'),
};
