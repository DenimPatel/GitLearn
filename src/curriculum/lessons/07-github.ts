import type { Lesson } from '../types';
import * as c from '../checks';

export const GITHUB_LESSONS: Lesson[] = [
  {
    id: 'feature-branch-flow',
    module: 'github',
    title: 'The feature-branch workflow',
    idea: 'Never commit straight to main: branch, push the branch, propose it.',
    intro: `Almost every team works the same way, and it is built entirely from things
you already know:

1. \`git switch -c my-feature\` — branch off main
2. work, committing as you go
3. \`git push -u origin my-feature\` — publish the branch
4. open a pull request
5. review, adjust, merge
6. pull main, delete the branch

The value is that main always stays working, and every change gets looked at
before it lands. Steps 1–3 are this lesson.`,
    scenario: 'published',
    concepts: ['github-flow', 'branch', 'push'],
    steps: [
      {
        id: 'branch',
        goal: 'Create a branch for the work.',
        suggested: ['git switch -c add-login'],
        hints: ['`git switch -c add-login`'],
        check: c.onBranch('add-login'),
      },
      {
        id: 'commit',
        goal: 'Add login.js and commit it.',
        suggested: [
          'echo "function login() {}" > login.js',
          'git add login.js',
          'git commit -m "Add a login function"',
        ],
        hints: ['Create the file, stage it, commit it.'],
        check: c.fileInHead('login.js'),
      },
      {
        id: 'push',
        goal: 'Publish the branch to origin.',
        detail: 'The remote panel now shows a branch that main does not have.',
        suggested: ['git push -u origin add-login'],
        hints: ['`git push -u origin add-login`'],
        check: c.pushed('add-login'),
      },
    ],
  },
  {
    id: 'pull-request',
    module: 'github',
    title: 'Opening a pull request',
    idea: 'A pull request is a request to merge one branch into another, with a discussion attached.',
    intro: `A pull request is not a Git concept. Git has no idea what one is.

It is a feature of the hosting provider — GitHub, GitLab, whatever you use — that
wraps a merge in a process: here are the commits, here is the diff, here is a
place to argue about it, and here is a button that does the merge once people
agree.

The Git part is just "merge this branch into that one". Everything else is
process built around it.

Here you'll use \`gh pr\` commands, which stand in for clicking around the
website.`,
    scenario: 'feature-pushed',
    concepts: ['pull-request', 'code-review', 'github-flow'],
    steps: [
      {
        id: 'open',
        goal: 'Open a pull request for the add-login branch.',
        suggested: ['gh pr create --title "Add a login function"'],
        hints: ['`gh pr create --title "Add a login function"`'],
        check: c.prOpen(),
      },
      {
        id: 'list',
        goal: 'Confirm it exists with `gh pr list`.',
        suggested: ['gh pr list'],
        hints: ['`gh pr list`'],
        check: c.ranCommand(/gh pr list/),
      },
    ],
  },
  {
    id: 'updating-a-pr',
    module: 'github',
    title: 'Responding to review',
    idea: 'A pull request tracks a branch. Push more commits and it updates itself.',
    intro: `A reviewer asks for a change. You do not open a new pull request — you push
another commit to the same branch.

The pull request points at the *branch*, not at a fixed set of commits, so it
follows along automatically. The review conversation stays in one place, and the
new commits appear in it.`,
    scenario: 'feature-pushed',
    concepts: ['code-review', 'pull-request', 'push'],
    steps: [
      {
        id: 'open',
        goal: 'Open the pull request.',
        suggested: ['gh pr create --title "Add a login function"'],
        hints: ['`gh pr create --title "Add a login function"`'],
        check: c.prOpen(),
      },
      {
        id: 'respond',
        goal: 'A reviewer wants error handling. Add it and commit.',
        suggested: [
          'echo "function login() { /* validates input */ }" > login.js',
          'git commit -am "Validate login input"',
        ],
        hints: ['Edit login.js, then `git commit -am "Validate login input"`.'],
        check: c.commitCountAtLeast(3),
      },
      {
        id: 'push',
        goal: 'Push the new commit — the PR picks it up.',
        suggested: ['git push'],
        hints: ['Plain `git push`: the upstream is already set.'],
        check: c.pushed('add-login'),
      },
    ],
  },
  {
    id: 'merging-a-pr',
    module: 'github',
    title: 'Merging, and syncing back up',
    idea: 'The merge happens on the server. Your local main learns nothing until you pull.',
    intro: `When the pull request is merged, the merge happens **on the server**. A new
commit appears on origin's main.

Your local main has no idea. This trips up nearly everyone once: the PR is
merged, the website shows the change, and \`git log\` on your machine shows
nothing. Of course — you haven't fetched.

So the last two steps of the workflow are: pull main, and delete the branch that
has now done its job.

There are three ways a PR can land, and they produce different histories:

- **Merge commit** — keeps every commit plus a merge commit. Full record.
- **Squash** — collapses the branch into one commit on main. Tidy, loses detail.
- **Rebase merge** — replays the commits onto main, linear, no merge commit.`,
    scenario: 'feature-pushed',
    concepts: ['pull-request', 'merge-strategies', 'github-flow', 'pull'],
    steps: [
      {
        id: 'open',
        goal: 'Open the pull request.',
        suggested: ['gh pr create --title "Add a login function"'],
        hints: ['`gh pr create --title "Add a login function"`'],
        check: c.prOpen(),
      },
      {
        id: 'merge',
        goal: 'Merge it.',
        detail: 'Read the output: it tells you your local main is now out of date.',
        suggested: ['gh pr merge'],
        hints: ['`gh pr merge`'],
        check: c.prMerged(),
      },
      {
        id: 'observe',
        goal: 'Switch to main and confirm it does NOT have the change yet.',
        detail: 'Run `ls`. login.js is absent. The merge happened somewhere else.',
        suggested: ['git switch main', 'ls'],
        hints: ['`git switch main`, then `ls`.'],
        check: c.all(c.onBranch('main'), c.not(c.fileExists('login.js'))),
      },
      {
        id: 'sync',
        goal: 'Now pull to catch up.',
        suggested: ['git pull origin main'],
        hints: ['`git pull origin main`'],
        check: c.fileExists('login.js'),
      },
      {
        id: 'cleanup',
        goal: 'Delete the merged branch.',
        detail: 'Its commits are on main now. The label has done its job.',
        suggested: ['git branch -d add-login'],
        hints: ['`git branch -d add-login`'],
        check: c.branchMissing('add-login'),
      },
    ],
    outro: 'That is the complete loop. Everything else is a variation on it.',
  },
  {
    id: 'squash-merging-a-pr',
    module: 'github',
    title: 'Squash-merging a pull request',
    idea: 'Three noisy commits become one clean commit on main — chosen at merge time.',
    intro: `This branch has three commits that tell the story of writing the code
(\`add login\`, \`fix\`, \`wip\`) but are not a useful history for main.

Squash-merging collapses all three into a single commit on main, titled after the
pull request. The branch’s own commits never land. Compare with a merge commit,
which would keep all three plus a merge; and with a rebase merge, which would keep
all three but replay them linearly.

The choice is made at merge time, and it is what makes main readable.`,
    scenario: 'feature-pushed-messy',
    concepts: ['squash-merge', 'pull-request', 'merge-strategies'],
    steps: [
      {
        id: 'open',
        goal: 'Open the pull request for add-login.',
        suggested: ['gh pr create --title "Add login"'],
        hints: ['`gh pr create --title "Add login"`.'],
        check: c.prOpen(),
      },
      {
        id: 'merge',
        goal: 'Land it with a squash merge.',
        detail: 'Read the output: main on the server now has exactly one new commit.',
        suggested: ['gh pr merge --squash'],
        hints: ['Add `--squash` to `gh pr merge`.'],
        check: c.prMergedSquash(),
      },
      {
        id: 'sync',
        goal: 'Pull the squashed commit into your local main.',
        suggested: ['git switch main', 'git pull'],
        hints: ['`git switch main`, then `git pull`.'],
        check: c.all(c.onBranch('main'), c.commitCount(2)),
      },
      {
        id: 'compare',
        goal: 'See the tidy main against the still-messy branch.',
        suggested: ['git log --oneline --all'],
        hints: ['`git log --oneline --all` shows the branch commits that did not land.'],
        check: c.ranCommand(/^git log --oneline --all/),
      },
    ],
    outro: 'main gets one comprehensible commit; the branch’s working history is discarded.',
  },
];
