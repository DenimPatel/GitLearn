import type { Lesson } from '../types';
import * as c from '../checks';

export const UNDO_LESSONS: Lesson[] = [
  {
    id: 'restore-worktree',
    module: 'undo',
    title: 'Throwing away a change you regret',
    idea: '`git restore <file>` overwrites your file with the version in the index.',
    intro: `You edited a file, and you want the edit gone.

\`git restore <file>\` copies the file back from the index (or from HEAD if it
isn't staged). This is the one genuinely destructive everyday command: the edit
was never committed, so **there is no way to get it back**.

Git says as much in \`git status\`, which offers this command by name under
"Changes not staged for commit".`,
    scenario: 'small-history',
    concepts: ['undo', 'three-trees', 'working-directory'],
    steps: [
      {
        id: 'break',
        goal: 'Make a mess of app.js.',
        suggested: ['echo "this was a mistake" > app.js'],
        hints: ['Overwrite it: `echo "this was a mistake" > app.js`'],
        check: c.fileContains('app.js', 'mistake'),
      },
      {
        id: 'restore',
        goal: 'Undo the edit with `git restore`.',
        detail: 'Watch the working-directory column in the panel snap back.',
        suggested: ['git restore app.js'],
        hints: ['`git restore app.js`'],
        check: c.all(c.fileLacks('app.js', 'mistake'), c.isClean()),
      },
    ],
  },
  {
    id: 'restore-staged',
    module: 'undo',
    title: 'Unstaging without losing your work',
    idea: '`git restore --staged` moves a change out of the index, leaving your file alone.',
    intro: `You ran \`git add\` and then realised that file shouldn't be in this commit.

\`git restore --staged <file>\` copies the version from HEAD back into the index.
Your working file is untouched — the edit is still there, it just isn't staged
any more.

This is the difference between the two flags in one sentence:
\`git restore <file>\` throws the edit away; \`git restore --staged <file>\` keeps
the edit and only un-stages it.`,
    scenario: 'small-history',
    concepts: ['undo', 'index', 'three-trees'],
    steps: [
      {
        id: 'stage',
        goal: 'Edit app.js and stage it.',
        suggested: ['echo "console.log(42)" > app.js', 'git add app.js'],
        hints: ['Edit, then `git add app.js`.'],
        check: c.staged('app.js'),
      },
      {
        id: 'unstage',
        goal: 'Unstage it — but keep the edit.',
        detail:
          'After this, `git status` should show the change as *not staged*, and your file should still say 42.',
        suggested: ['git restore --staged app.js'],
        hints: ['`git restore --staged app.js`'],
        check: c.all(c.fileContains('app.js', '42'), c.not(c.isClean())),
      },
    ],
    prediction: {
      question: 'After `git restore --staged app.js`, what happened to your edit?',
      options: ['It was thrown away', 'It is still in the file, just not staged', 'It was committed'],
      answerIndex: 1,
      explanation:
        '--staged only touches the index. Your working file is never modified by it, which is what makes it the safe half of restore.',
    },
  },
  {
    id: 'amend',
    module: 'undo',
    title: 'Amending the last commit',
    idea: 'Amend does not edit a commit — it builds a new one and moves the branch.',
    intro: `You committed, then immediately noticed a typo in the message, or a file
you meant to include.

\`git commit --amend\` looks like editing the last commit. It isn't. Commits are
immutable — their ids are hashes of their content, so editing one is a
contradiction in terms.

What actually happens: Git builds a **new** commit with the same parent, and
moves the branch label to it. The original commit is still in the database; it
just has nothing pointing at it any more.

That's the first sighting of a rule that runs through the rest of this module:
**nothing is deleted, only unreferenced.**`,
    scenario: 'small-history',
    concepts: ['amend', 'nothing-is-lost', 'commit-object'],
    steps: [
      {
        id: 'note-id',
        goal: 'Note the current commit id with `git log --oneline`.',
        suggested: ['git log --oneline'],
        hints: ['`git log --oneline` — remember the top line.'],
        check: c.ranCommand(/git log/),
      },
      {
        id: 'amend',
        goal: 'Reword that commit message with --amend.',
        detail: 'Compare the id afterwards: it is a different commit entirely.',
        suggested: ['git commit --amend -m "Update app.js with better logging"'],
        hints: [
          'Use `git commit --amend -m "new message"`.',
        ],
        check: c.all(c.commitCount(3), c.ranCommand(/git commit --amend/)),
      },
      {
        id: 'reflog',
        goal: 'Run `git reflog` and find the original commit, still there.',
        detail: 'It is unreferenced, not gone. The next lessons build on this.',
        suggested: ['git reflog'],
        hints: ['`git reflog`'],
        check: c.ranCommand(/git reflog/),
      },
    ],
  },
  {
    id: 'reset-modes',
    module: 'undo',
    title: 'reset: move HEAD, and choose what comes with it',
    idea: 'One command, three trees, three modes — that is the whole of reset.',
    intro: `\`git reset\` has a reputation for being frightening. It is only confusing
without the three-trees model, and you already have that.

Reset always moves the branch label to a commit you name. The flag decides how
many of the three trees come along:

| Mode | HEAD | Index | Working tree | Use it when |
|---|---|---|---|---|
| \`--soft\` | moves | untouched | untouched | you want to redo the commit, keeping everything staged |
| \`--mixed\` (default) | moves | reset | untouched | you want to un-commit *and* unstage, keeping your edits |
| \`--hard\` | moves | reset | reset | you want the changes gone |

Only \`--hard\` can lose work — and even then, the commits themselves survive.`,
    scenario: 'small-history',
    concepts: ['reset-modes', 'three-trees', 'undo'],
    steps: [
      {
        id: 'soft',
        goal: 'Un-commit the last commit with `git reset --soft HEAD~1`, keeping it staged.',
        detail:
          'HEAD~1 means "one commit before HEAD". Look at the panel: history shrank, but the index still holds the change.',
        suggested: ['git reset --soft HEAD~1'],
        hints: ['`git reset --soft HEAD~1`'],
        check: c.all(c.commitCount(2), c.not(c.isClean())),
      },
      {
        id: 'recommit',
        goal: 'Commit it again with a different message.',
        detail: 'Nothing was staged or unstaged in between — that is what --soft buys you.',
        suggested: ['git commit -m "Update app.js"'],
        hints: ['`git commit -m "Update app.js"`'],
        check: c.commitCount(3),
      },
      {
        id: 'mixed',
        goal: 'Now try `git reset HEAD~1` with no flag, and check status.',
        detail:
          'The default is --mixed: the commit is undone and the change is unstaged, but your file still has it.',
        suggested: ['git reset HEAD~1', 'git status'],
        hints: ['`git reset HEAD~1`, then `git status`.'],
        check: c.all(c.commitCount(2), c.ranCommand(/git status/)),
      },
    ],
    prediction: {
      question: 'You run `git reset --hard HEAD~1`. What happens to the commit you moved off?',
      options: [
        'It is permanently deleted immediately',
        'It still exists, just with nothing pointing at it',
        'It moves to the stash',
      ],
      answerIndex: 1,
      explanation:
        'The commit object stays in the database. Only the branch label moved. The reflog still records where it was, which is how you get it back.',
    },
  },
  {
    id: 'revert',
    module: 'undo',
    title: 'revert: undoing forwards',
    idea: 'Revert adds a new commit that reverses an old one, leaving history intact.',
    intro: `\`reset\` rewrites history. That is fine on your own machine, and dangerous
the moment someone else has pulled those commits — their history and yours no
longer agree, and Git has no way to reconcile that quietly.

\`git revert\` solves the same problem safely. Instead of removing a commit, it
computes the opposite change and commits *that*. History grows rather than
changes, so everyone else's clone stays valid.

The rule of thumb worth memorising: **reset for commits only you have; revert for
commits you have shared.**`,
    scenario: 'small-history',
    concepts: ['revert', 'shared-history', 'nothing-is-lost'],
    steps: [
      {
        id: 'revert',
        goal: 'Revert the most recent commit.',
        detail: 'Watch the graph: it gets *longer*, not shorter.',
        suggested: ['git revert HEAD --no-edit'],
        hints: ['`git revert HEAD --no-edit`'],
        check: c.all(c.commitCount(4), c.ranCommand(/git revert/)),
      },
      {
        id: 'inspect',
        goal: 'Check `git log --oneline` — the original commit is still listed.',
        detail:
          'Both commits are in history: the change, and its undo. That is the honest record of what happened.',
        suggested: ['git log --oneline'],
        hints: ['`git log --oneline`'],
        check: c.ranCommand(/git log/),
      },
    ],
  },
  {
    id: 'detached-head',
    module: 'undo',
    title: 'Detached HEAD is not an error',
    idea: 'HEAD normally points at a branch. Point it at a commit instead and it is "detached".',
    intro: `\`HEAD\` is a pointer to the branch you are currently on. When you commit,
Git moves *that branch*, because HEAD tells it which one.

Check out a commit directly and HEAD points straight at the commit instead, with
no branch in between. Git prints a long warning that reads like something has
gone wrong. **Nothing has gone wrong.** You are just looking at an old snapshot.

The one real consequence: commits you make here have no branch label following
them, so switching away leaves them unreferenced. If you want to keep them, make
a branch.`,
    scenario: 'small-history',
    concepts: ['detached-head', 'ref', 'branch'],
    steps: [
      {
        id: 'look',
        goal: 'Find the id of the first commit with `git log --oneline`.',
        suggested: ['git log --oneline'],
        hints: ['`git log --oneline` — you want the *bottom* entry.'],
        check: c.ranCommand(/git log/),
      },
      {
        id: 'detach',
        goal: 'Check out that first commit directly.',
        detail:
          'Use its short id. Look at the working directory: files from later commits have vanished, because you are genuinely looking at the past.',
        suggested: ['git checkout HEAD~2'],
        hints: [
          'You can use a commit id, or the shorthand `HEAD~2` for "two commits back".',
        ],
        check: c.detached(),
      },
      {
        id: 'return',
        goal: 'Get back to normal with `git switch main`.',
        detail: 'HEAD is attached to a branch again, and your files are back.',
        suggested: ['git switch main'],
        hints: ['`git switch main`'],
        check: c.all(c.onBranch('main'), c.not(c.detached())),
      },
    ],
  },
  {
    id: 'reflog',
    module: 'undo',
    title: 'The reflog: the safety net',
    idea: 'Git records every position HEAD has held, even ones no branch remembers.',
    intro: `Here is the promise this module has been building to.

Every time HEAD moves — a commit, a checkout, a reset, a merge — Git appends a
line to the **reflog**. That log is local, and it is not part of history, which
means it still contains commits that nothing else points at.

So the sequence "I ran \`git reset --hard\` and lost three hours of work" is
almost always recoverable. Let's lose something on purpose and get it back.`,
    scenario: 'small-history',
    concepts: ['reflog', 'recovery', 'nothing-is-lost'],
    steps: [
      {
        id: 'note',
        goal: 'Record where you are: run `git log --oneline`.',
        suggested: ['git log --oneline'],
        hints: ['`git log --oneline`'],
        check: c.ranCommand(/git log/),
      },
      {
        id: 'destroy',
        goal: 'Now destroy two commits with `git reset --hard HEAD~2`.',
        detail: 'Check `git log --oneline` afterwards — they really are gone from history.',
        suggested: ['git reset --hard HEAD~2'],
        hints: ['`git reset --hard HEAD~2`'],
        check: c.commitCount(1),
      },
      {
        id: 'reflog',
        goal: 'Run `git reflog` and find where you were before the reset.',
        detail:
          'The top entry is the reset itself. The one below it is the commit you were on beforehand.',
        suggested: ['git reflog'],
        hints: ['`git reflog`'],
        check: c.ranCommand(/git reflog/),
      },
      {
        id: 'recover',
        goal: 'Get the commits back with `git reset --hard HEAD@{1}`.',
        detail:
          '`HEAD@{1}` means "where HEAD was one move ago". Your history is restored, files and all.',
        suggested: ['git reset --hard HEAD@{1}'],
        hints: [
          'You can reset to a reflog entry: `git reset --hard HEAD@{1}`',
          'Or use the commit id you saw in the reflog output.',
        ],
        check: c.commitCount(3),
      },
    ],
    outro:
      'Nothing you commit is ever really lost. That is worth remembering the next time Git looks like it has eaten your work.',
  },
  {
    id: 'cleaning-untracked',
    module: 'undo',
    title: 'Throwing away what was never tracked',
    idea: '`restore` can only bring back a copy Git has. Untracked files have no copy — that is `clean`.',
    intro: `The undo commands you have learned all work from a copy Git holds: the
index, or a commit. \`git restore\` copies from there back into your working
tree.

An **untracked** file has no such copy. Git has never seen it, so there is
nothing to restore from. The command for deleting untracked files is
\`git clean\`, and it is deliberately hard to fire accidentally: without \`-f\`
(or a dry run) it refuses.

Run \`git clean -n\` first. It is a dry run: it prints exactly what \`-f\` would
remove, and removes nothing.`,
    scenario: 'untracked-mess',
    concepts: ['untracked', 'undo', 'gitignore'],
    steps: [
      {
        id: 'status',
        goal: 'See what is untracked.',
        detail: 'notes.txt is untracked. debug.log does not even appear — .gitignore hides it.',
        suggested: ['git status'],
        hints: ['`git status`.'],
        check: c.hasUntracked('notes.txt'),
      },
      {
        id: 'restore-fails',
        goal: 'Try to discard notes.txt with `restore` — and read the refusal.',
        detail: 'Git cannot restore what it never had.',
        suggested: ['git restore notes.txt'],
        hints: ['It is supposed to fail. That is the point.'],
        check: c.ranCommandFailing(/git restore notes\.txt/),
      },
      {
        id: 'dry-run',
        goal: 'Preview what clean would delete.',
        suggested: ['git clean -n'],
        hints: ['`git clean -n` removes nothing.'],
        check: c.ranCommand(/^git clean -n/),
      },
      {
        id: 'force',
        goal: 'Actually remove the untracked file.',
        suggested: ['git clean -f'],
        hints: ['`-f` is required; `-n` alone will not delete.'],
        check: c.all(c.fileAbsent('notes.txt'), c.noUntracked()),
      },
      {
        id: 'ignored',
        goal: 'Also remove the ignored log file.',
        detail: '`-x` extends clean to files .gitignore hides. Use it with care — ignored files often include local config.',
        suggested: ['git clean -fx'],
        hints: ['`-x` includes ignored paths.'],
        check: c.fileAbsent('debug.log'),
      },
    ],
    outro: `Two different tools for two different situations: \`restore\` for tracked
content, \`clean\` for everything else.`,
  },
];
