import type { Lesson } from '../types';
import * as c from '../checks';

export const BRANCHING_LESSONS: Lesson[] = [
  {
    id: 'branch-is-a-label',
    module: 'branching',
    title: 'A branch is a movable label',
    idea: 'Creating a branch writes one line: a name and a commit id.',
    intro: `In most tools, "branching" copies the whole project. In Git it does not.

A branch is a file containing one commit id. That's the entire implementation.
Creating one is instant and costs nothing regardless of how big your project is,
which is *why* the Git workflow leans on branches so heavily.

The thing that makes a branch feel alive is that it **moves**. When you commit,
Git updates the branch HEAD is on to point at the new commit. The branch follows
you.`,
    scenario: 'small-history',
    concepts: ['branch', 'ref', 'dag'],
    steps: [
      {
        id: 'create',
        goal: 'Create a branch called feature.',
        detail:
          '`git branch <name>` creates the label at your current commit — but does not move you onto it.',
        suggested: ['git branch feature'],
        hints: ['`git branch feature`'],
        check: c.branchExists('feature'),
      },
      {
        id: 'list',
        goal: 'List your branches with `git branch`.',
        detail: 'The asterisk marks the one you are on. You are still on main.',
        suggested: ['git branch'],
        hints: ['Run `git branch` with no arguments.'],
        check: c.all(c.ranCommand(/git branch$/), c.onBranch('main')),
      },
      {
        id: 'inspect',
        goal: 'See that both labels point at the same commit: `git log --oneline`.',
        detail:
          'Two names, one commit. Nothing was copied. The graph on the right shows both labels stacked on one node.',
        suggested: ['git log --oneline'],
        hints: ['`git log --oneline`'],
        check: c.ranCommand(/git log/),
      },
    ],
  },
  {
    id: 'switching',
    module: 'branching',
    title: 'Switching rewrites your working directory',
    idea: 'Changing branch changes which snapshot is checked out — your files really change.',
    intro: `This is the part that is easiest to describe and hardest to believe until
you watch it happen.

When you switch branches, Git replaces the contents of your working directory
with the snapshot that branch points at. Files that exist only on the other
branch **appear**. Files that exist only on this one **disappear**.

They are not deleted — they are in the object database, reachable from the other
branch. But your folder genuinely changes on disk.`,
    scenario: 'two-branches',
    concepts: ['branch', 'working-directory', 'three-trees'],
    steps: [
      {
        id: 'switch',
        goal: 'Switch to the feature branch.',
        suggested: ['git switch feature'],
        hints: ['`git switch feature`'],
        check: c.onBranch('feature'),
      },
      {
        id: 'commit-there',
        goal: 'Create feature.txt and commit it on this branch.',
        suggested: [
          'echo "the new feature" > feature.txt',
          'git add feature.txt',
          'git commit -m "Add the feature"',
        ],
        hints: ['Create the file, add it, commit it.'],
        check: c.all(c.onBranch('feature'), c.fileInHead('feature.txt')),
      },
      {
        id: 'switch-back',
        goal: 'Switch back to main — and watch feature.txt vanish.',
        detail:
          'Run `ls` to confirm. The file is not lost: it is reachable from the feature branch.',
        suggested: ['git switch main', 'ls'],
        hints: ['`git switch main`, then `ls`.'],
        check: c.all(c.onBranch('main'), c.not(c.fileExists('feature.txt'))),
      },
      {
        id: 'switch-again',
        goal: 'Switch to feature once more and confirm the file is back.',
        suggested: ['git switch feature', 'ls'],
        hints: ['`git switch feature`, then `ls`.'],
        check: c.all(c.onBranch('feature'), c.fileExists('feature.txt')),
      },
    ],
    prediction: {
      question: 'You switch from feature to main. Where did feature.txt go?',
      options: [
        'Deleted permanently',
        'Still in the object database, reachable from the feature branch',
        'Moved to the staging area',
      ],
      answerIndex: 1,
      explanation:
        'Your working directory shows one snapshot at a time. The file is stored in a commit that the feature branch points at, so switching back restores it.',
    },
  },
  {
    id: 'branch-and-switch',
    module: 'branching',
    title: 'Branch and switch in one move',
    idea: '`git switch -c <name>` creates the branch and moves you onto it.',
    intro: `In practice you almost always want to create a branch *and* start working
on it. \`git switch -c <name>\` does both.

This is the first command of nearly every task you'll ever do: you're about to
start something new, so you branch off main and work there. The old spelling was
\`git checkout -b\`, which you will still see everywhere — they do the same thing.`,
    scenario: 'small-history',
    concepts: ['branch', 'github-flow'],
    steps: [
      {
        id: 'create-switch',
        goal: 'Create and switch to a branch called fix-typo.',
        suggested: ['git switch -c fix-typo'],
        hints: ['`git switch -c fix-typo`'],
        check: c.all(c.branchExists('fix-typo'), c.onBranch('fix-typo')),
      },
      {
        id: 'work',
        goal: 'Make a commit on it.',
        suggested: [
          'echo "# My Project\\n\\nSpelled correctly." > README.md',
          'git commit -am "Fix typo in README"',
        ],
        hints: ['Edit README.md, then `git commit -am "Fix typo in README"`.'],
        check: c.branchesDiverged('fix-typo', 'main'),
      },
    ],
  },
  {
    id: 'diverging',
    module: 'branching',
    title: 'Diverging: two lines of history',
    idea: 'Once both branches have their own commits, the graph forks.',
    intro: `Up to now your branches have been in a line. Commit on two different
branches and the history genuinely forks: two children of one parent.

That fork is the shape that makes merging necessary — and the commit where they
split is the **merge base**, which every merge operation starts by finding.`,
    scenario: 'two-branches',
    concepts: ['dag', 'merge-base', 'branch-advance'],
    steps: [
      {
        id: 'feature-work',
        goal: 'Commit something on the feature branch.',
        suggested: [
          'git switch feature',
          'echo "the new feature" > feature.txt',
          'git add feature.txt',
          'git commit -m "Add the feature"',
        ],
        hints: ['Switch to feature first, then create and commit a file.'],
        check: c.branchesDiverged('feature', 'main'),
      },
      {
        id: 'main-work',
        goal: 'Now commit something different on main.',
        detail: 'This is the moment the history forks.',
        suggested: [
          'git switch main',
          'echo "some docs" > docs.md',
          'git add docs.md',
          'git commit -m "Add docs"',
        ],
        hints: ['Switch to main, then create and commit a different file.'],
        check: c.all(c.onBranch('main'), c.fileInHead('docs.md')),
      },
      {
        id: 'see-fork',
        goal: 'See the fork with `git log --oneline --graph --all`.',
        detail:
          '`--all` shows every branch, not just the one you are on. Compare it with the graph panel.',
        suggested: ['git log --oneline --graph --all'],
        hints: ['`git log --oneline --graph --all`'],
        check: c.ranCommand(/git log.*--all/),
      },
    ],
  },
  {
    id: 'fast-forward',
    module: 'branching',
    title: 'Fast-forward: when no merge is needed',
    idea: 'If your branch has no commits of its own, merging just slides the label forward.',
    intro: `Not every merge creates a merge commit.

If main hasn't moved since you branched off it, then feature's history already
*contains* main's history. There is nothing to reconcile — Git only has to move
the main label forward to where feature is. That's a **fast-forward**.

You can spot the situation before merging: the branches have not diverged, one is
simply ahead of the other.`,
    scenario: 'two-branches',
    concepts: ['fast-forward', 'merge', 'merge-base'],
    steps: [
      {
        id: 'work',
        goal: 'Commit on feature, leaving main untouched.',
        suggested: [
          'git switch feature',
          'echo "the new feature" > feature.txt',
          'git add feature.txt',
          'git commit -m "Add the feature"',
        ],
        hints: ['Switch to feature, then create and commit a file.'],
        check: c.branchesDiverged('feature', 'main'),
      },
      {
        id: 'merge',
        goal: 'Switch to main and merge feature into it.',
        detail:
          'Read the output: it says "Fast-forward". Count the commits — no new one was created.',
        suggested: ['git switch main', 'git merge feature'],
        hints: ['`git switch main`, then `git merge feature`.'],
        check: c.all(c.branchesEqual('main', 'feature'), c.mergedFastForward()),
      },
    ],
    prediction: {
      question: 'A fast-forward merge creates how many new commits?',
      options: ['One merge commit', 'None — the branch label just moves', 'One per commit merged'],
      answerIndex: 1,
      explanation:
        'There is nothing to combine: feature already contains everything main had. Git only updates where the main label points.',
    },
  },
  {
    id: 'three-way-merge',
    module: 'branching',
    title: 'Three-way merge',
    idea: 'When both branches moved, Git compares both against their merge base.',
    intro: `Once both branches have their own commits, one label cannot simply slide —
each has work the other lacks.

So Git does a **three-way merge**. It finds the merge base (where they split),
then compares each branch against it:

- changed on one side only → take that change
- changed on both sides identically → take it once
- changed on both sides differently → **conflict** (the next lesson)

The result is a new commit with **two parents**, which is what makes it visibly a
merge in the graph.`,
    scenario: 'diverged-branches',
    concepts: ['three-way-merge', 'merge', 'merge-base', 'dag'],
    steps: [
      {
        id: 'merge',
        goal: 'On main, merge the feature branch.',
        detail:
          'The two branches changed different files, so Git combines them with no help from you.',
        suggested: ['git merge feature'],
        hints: ['You are already on main. Run `git merge feature`.'],
        check: c.all(c.headIsMerge(), c.mergedThreeWay()),
      },
      {
        id: 'inspect',
        goal: 'Confirm the merge commit has two parents with `git show HEAD`.',
        detail: 'Look for the "Merge:" line listing both parent ids.',
        suggested: ['git show HEAD'],
        hints: ['`git show HEAD`'],
        check: c.all(c.headIsMerge(), c.ranCommand(/git show/)),
      },
      {
        id: 'files',
        goal: 'Run `ls` — both branches’ files are present.',
        suggested: ['ls'],
        hints: ['`ls`'],
        check: c.all(c.fileExists('feature.txt'), c.fileExists('docs.md')),
      },
    ],
  },
  {
    id: 'conflicts',
    module: 'branching',
    title: 'Merge conflicts',
    idea: 'A conflict is Git saying "both of you changed this line; I will not guess".',
    intro: `A conflict is not a failure. It is Git refusing to silently pick a winner.

When both branches change the same lines differently, Git stops mid-merge and
hands you the decision. It marks the disputed region in the file:

\`\`\`
<<<<<<< HEAD
what your branch says
=======
what their branch says
>>>>>>> feature
\`\`\`

Underneath, the index holds **three versions** of that file side by side — the
base, yours, and theirs — and no resolved version. That missing resolved entry is
exactly why \`git commit\` refuses until you fix it.

The resolution is always the same three steps: **edit the file, \`git add\` it,
\`git commit\`.** \`git add\` is what tells Git "I have decided".`,
    scenario: 'conflicting-branches',
    concepts: ['conflict-resolution', 'merge-stages', 'three-way-merge'],
    steps: [
      {
        id: 'conflict',
        goal: 'Merge feature into main and trigger the conflict.',
        detail: 'Read the output. It names the file and tells you what to do next.',
        suggested: ['git merge feature'],
        hints: ['`git merge feature`'],
        check: c.conflicted(),
      },
      {
        id: 'look',
        goal: 'Open the conflicted file with `cat config.txt`.',
        detail: 'Those markers are ordinary text now sitting in your file.',
        suggested: ['cat config.txt'],
        hints: ['`cat config.txt`'],
        check: c.all(c.conflicted(), c.ranCommand(/cat config/)),
      },
      {
        id: 'stages',
        goal: 'See the three versions in the index: `git ls-files -u`.',
        detail:
          'Stage 1 is the merge base, stage 2 is yours, stage 3 is theirs. There is no stage 0 — that is the missing resolution.',
        suggested: ['git ls-files -u'],
        hints: ['`git ls-files -u` lists unmerged index entries.'],
        check: c.ranCommand(/git ls-files/),
      },
      {
        id: 'try-commit',
        goal: 'Try to commit, and watch Git refuse.',
        detail: 'The error names the reason: unmerged files.',
        suggested: ['git commit -m "merge"'],
        hints: ['Just try `git commit -m "merge"`. It is supposed to fail.'],
        check: c.ranCommandFailing(/git commit/),
      },
      {
        id: 'resolve',
        goal: 'Decide the outcome: write the final content into config.txt.',
        detail:
          'Pick one side, or write something new — it is your call. Remove the marker lines entirely.',
        suggested: ['echo "colour = purple" > config.txt'],
        hints: [
          'Overwrite the file with the content you actually want.',
          'echo "colour = purple" > config.txt',
        ],
        check: c.fileLacks('config.txt', '<<<<<<<'),
      },
      {
        id: 'mark',
        goal: 'Mark it resolved with `git add`.',
        detail:
          'This collapses the three staged versions into one. Check `git status` — the conflict is gone.',
        suggested: ['git add config.txt'],
        hints: ['`git add config.txt`'],
        check: c.not(c.conflicted()),
      },
      {
        id: 'commit',
        goal: 'Now complete the merge with a commit.',
        suggested: ['git commit -m "Merge feature, settling on purple"'],
        hints: ['`git commit -m "Merge feature, settling on purple"`'],
        check: c.all(c.headIsMerge(), c.conflictResolved()),
      },
    ],
    outro:
      'You can also back out at any point with `git merge --abort`, which returns you to exactly where you started.',
  },
  {
    id: 'deleting-branches',
    module: 'branching',
    title: 'Deleting a branch',
    idea: 'Deleting a branch removes a label. The commits are unaffected.',
    intro: `Once a feature is merged, its branch has done its job. Deleting it removes
one line from a file — the commits stay exactly where they are, now reachable
through main.

\`git branch -d\` is the safe version: it refuses if the branch has commits that
aren't merged anywhere, because deleting *that* label really would leave the
commits unreferenced. \`-D\` forces it anyway.`,
    scenario: 'diverged-branches',
    concepts: ['branch', 'ref', 'nothing-is-lost'],
    steps: [
      {
        id: 'try-delete',
        goal: 'Try deleting the unmerged feature branch with `git branch -d feature`.',
        detail: 'Git refuses, and explains why. This is a guard rail, not a bug.',
        suggested: ['git branch -d feature'],
        hints: ['`git branch -d feature` — expect it to fail.'],
        check: c.ranCommandFailing(/git branch -d/),
      },
      {
        id: 'merge',
        goal: 'Merge feature into main first.',
        suggested: ['git merge feature'],
        hints: ['`git merge feature`'],
        check: c.headIsMerge(),
      },
      {
        id: 'delete',
        goal: 'Now delete it.',
        detail:
          'It works this time. Check `git log --oneline` — the commits are all still there.',
        suggested: ['git branch -d feature'],
        hints: ['`git branch -d feature`'],
        check: c.branchMissing('feature'),
      },
    ],
  },
  {
    id: 'rebase',
    module: 'branching',
    title: 'Rebase: replaying your commits elsewhere',
    idea: 'Rebase re-applies your commits onto a new base, producing new commits.',
    intro: `Merging preserves the fork in the history. Sometimes you would rather the
history read as a straight line — as though you had started from the latest main
all along.

\`git rebase main\` takes each of your commits, works out the change it
introduced, and applies that change on top of main. The result looks linear.

The critical detail: **these are new commits with new ids.** Same changes, same
author, same messages — different objects. Your original commits still exist, but
your branch no longer points at them.

That is why rebase has a rule attached, in the next lesson.`,
    scenario: 'diverged-branches',
    concepts: ['rebase', 'rebase-rewrites-history', 'linear-history'],
    steps: [
      {
        id: 'note',
        goal: 'Switch to feature and note its commit id.',
        suggested: ['git switch feature', 'git log --oneline'],
        hints: ['`git switch feature`, then `git log --oneline`.'],
        check: c.all(c.onBranch('feature'), c.ranCommand(/git log/)),
      },
      {
        id: 'rebase',
        goal: 'Rebase feature onto main.',
        detail:
          'Compare the id afterwards with the one you just noted. Same change, different commit.',
        suggested: ['git rebase main'],
        hints: ['`git rebase main`'],
        check: c.all(c.onBranch('feature'), c.commitCountAtLeast(3)),
      },
      {
        id: 'look',
        goal: 'Look at the shape now: `git log --oneline --graph --all`.',
        detail: 'No fork. It reads as though you branched off the current main.',
        suggested: ['git log --oneline --graph --all'],
        hints: ['`git log --oneline --graph --all`'],
        check: c.ranCommand(/git log.*--all/),
      },
    ],
    prediction: {
      question: 'After rebasing, are your commits the same objects as before?',
      options: [
        'Yes, they were moved',
        'No — they are new commits with new ids',
        'Only the most recent one changes',
      ],
      answerIndex: 1,
      explanation:
        'A commit id is a hash of its content, and content includes the parent. Give a commit a new parent and it is necessarily a different commit.',
    },
  },
  {
    id: 'cherry-pick-and-golden-rule',
    module: 'branching',
    title: 'Cherry-pick, and the golden rule',
    idea: 'Copy a single commit anywhere — and never rewrite history other people have.',
    intro: `\`git cherry-pick <commit>\` applies the change from one commit onto your
current branch, as a new commit. It's the tool for "that one bug fix on the
release branch needs to be on main too".

It uses the same machinery as rebase: work out what a commit changed, apply that
change here.

And now the rule that governs all of this:

> **Never rewrite history that other people have already pulled.**

Rebase, amend and hard reset all replace commits with new ones. If someone else's
clone points at the originals, their history and yours have silently disagreed,
and merging the two produces duplicates and confusion. On your own unpublished
branch, rewrite freely. On shared main, use \`revert\`.`,
    scenario: 'diverged-branches',
    concepts: ['cherry-pick', 'shared-history', 'rebase-rewrites-history'],
    steps: [
      {
        id: 'pick',
        goal: 'On main, cherry-pick the feature branch’s commit.',
        detail:
          'You get the change without merging the branch, and without the fork appearing in history.',
        suggested: ['git cherry-pick feature'],
        hints: ['You are on main. Run `git cherry-pick feature`.'],
        check: c.all(c.onBranch('main'), c.fileInHead('feature.txt')),
      },
      {
        id: 'compare',
        goal: 'Compare the two commits with `git log --oneline --all`.',
        detail:
          'The same change now exists twice, under two different ids — on feature and on main.',
        suggested: ['git log --oneline --all'],
        hints: ['`git log --oneline --all`'],
        check: c.ranCommand(/git log.*--all/),
      },
    ],
  },
];
