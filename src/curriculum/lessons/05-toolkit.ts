import type { Lesson } from '../types';
import * as c from '../checks';

export const TOOLKIT_LESSONS: Lesson[] = [
  {
    id: 'stash',
    module: 'toolkit',
    title: 'Stash: parking unfinished work',
    idea: 'Stash saves your uncommitted changes and gives you a clean tree.',
    intro: `You're halfway through something when an urgent fix lands on your plate.
Your work isn't ready to commit, but Git won't let you switch branches while it
would overwrite those changes.

\`git stash\` takes everything uncommitted, saves it aside, and resets your
working tree to the last commit. \`git stash pop\` puts it back.

Under the hood a stash entry is an ordinary commit that just isn't on any branch,
which is why restoring it can conflict like any other merge.`,
    scenario: 'dirty-history',
    concepts: ['stash', 'three-trees'],
    steps: [
      {
        id: 'see',
        goal: 'Confirm you have uncommitted work with `git status`.',
        suggested: ['git status'],
        hints: ['`git status`'],
        check: c.ranCommand(/git status/),
      },
      {
        id: 'stash',
        goal: 'Stash it.',
        detail: 'Your working tree is clean now, and the edit is safe.',
        suggested: ['git stash'],
        hints: ['`git stash`'],
        check: c.all(c.stashCount(1), c.isClean()),
      },
      {
        id: 'list',
        goal: 'Check what is stashed with `git stash list`.',
        suggested: ['git stash list'],
        hints: ['`git stash list`'],
        check: c.ranCommand(/git stash list/),
      },
      {
        id: 'pop',
        goal: 'Bring the work back with `git stash pop`.',
        suggested: ['git stash pop'],
        hints: ['`git stash pop`'],
        check: c.all(c.stashCount(0), c.not(c.isClean())),
      },
    ],
  },
  {
    id: 'tags',
    module: 'toolkit',
    title: 'Tags: permanent names for commits',
    idea: 'A tag is a label that does not move — usually marking a release.',
    intro: `Branches move as you commit. Tags do not. That's the whole difference, and
it makes tags the right tool for "this exact commit is version 1.0".

There are two kinds:

- **Lightweight** — just a ref pointing at a commit, like a branch that never moves.
- **Annotated** (\`-a\`) — a real object in the database with its own id, a
  tagger, a date and a message. This is what you want for releases, because it
  records *who* tagged it and *why*.`,
    scenario: 'small-history',
    concepts: ['tag', 'annotated-tag', 'ref'],
    steps: [
      {
        id: 'lightweight',
        goal: 'Create a lightweight tag called v0.1.',
        suggested: ['git tag v0.1'],
        hints: ['`git tag v0.1`'],
        check: c.tagExists('v0.1'),
      },
      {
        id: 'annotated',
        goal: 'Create an annotated tag v1.0 with a message.',
        detail: 'This one creates a real object, not just a ref.',
        suggested: ['git tag -a v1.0 -m "First stable release"'],
        hints: ['`git tag -a v1.0 -m "First stable release"`'],
        check: c.tagExists('v1.0'),
      },
      {
        id: 'inspect',
        goal: 'Inspect the annotated tag with `git cat-file -p v1.0`.',
        detail:
          'Compare with `git cat-file -p v0.1`: the lightweight one resolves straight to a commit; the annotated one is its own object that *points* at a commit.',
        suggested: ['git cat-file -p v1.0'],
        hints: ['`git cat-file -p v1.0`'],
        check: c.ranCommand(/git cat-file/),
      },
    ],
  },
  {
    id: 'interactive-rebase',
    module: 'toolkit',
    title: 'Tidying a branch before review',
    idea: 'Interactive rebase lets you squash, reword and drop commits before anyone sees them.',
    intro: `Working commits are messy: "wip", "fix", "actually fix", "typo". That's fine
while you work, and unhelpful for whoever reviews it.

\`git rebase -i <base>\` replays your commits but lets you edit the plan first:

- **pick** — keep it
- **squash** — fold it into the previous commit
- **reword** — keep the change, change the message
- **drop** — discard it entirely

It is the same replay machinery as an ordinary rebase, so the same rule applies:
only do this to commits you have not shared.`,
    scenario: 'small-history',
    concepts: ['interactive-rebase', 'rebase-rewrites-history', 'shared-history'],
    steps: [
      {
        id: 'messy',
        goal: 'Make two scrappy commits on a new branch.',
        suggested: [
          'git switch -c tidy-me',
          'echo "attempt one" > work.txt',
          'git add work.txt',
          'git commit -m "wip"',
          'echo "attempt two" > work.txt',
          'git commit -am "fix"',
        ],
        hints: ['Branch first, then make two quick commits.'],
        check: c.all(c.onBranch('tidy-me'), c.commitCountAtLeast(5)),
      },
      {
        id: 'squash',
        goal: 'Squash them into one with `git rebase -i HEAD~2`.',
        detail:
          'In this simulator the two commits are folded together automatically. On a real machine an editor opens for you to mark which is which.',
        suggested: ['git rebase -i HEAD~2'],
        hints: ['`git rebase -i HEAD~2`'],
        check: c.ranCommand(/git rebase -i/),
      },
      {
        id: 'check',
        goal: 'Look at the result with `git log --oneline`.',
        suggested: ['git log --oneline'],
        hints: ['`git log --oneline`'],
        check: c.ranCommand(/git log/),
      },
    ],
  },
];
