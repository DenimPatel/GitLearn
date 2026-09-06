import type { Lesson } from '../types';
import * as c from '../checks';

export const SNAPSHOT_LESSONS: Lesson[] = [
  {
    id: 'working-directory',
    module: 'snapshots',
    title: 'The working directory, and being untracked',
    idea: 'Git ignores every file it has not been explicitly told about.',
    intro: `The **working directory** is simply your files as they exist right now —
the ones you can open and edit. Git does not automatically watch them.

A file Git has never been told about is **untracked**. Git will notice it exists
and mention it, but it will never save it, never restore it, and never warn you
if you lose it. Tracking is opt-in, always.`,
    scenario: 'fresh-repo',
    concepts: ['working-directory', 'untracked'],
    steps: [
      {
        id: 'create',
        goal: 'Create a file called README.md.',
        suggested: ['echo "# My Project" > README.md'],
        hints: ['Use `echo "# My Project" > README.md`.'],
        check: c.fileExists('README.md'),
      },
      {
        id: 'observe',
        goal: 'Run `git status` and find README.md listed as untracked.',
        detail:
          'Read the wording carefully: "Untracked files — use git add to include in what will be committed". Git is telling you exactly what to do next.',
        suggested: ['git status'],
        hints: ['Run `git status`.'],
        check: c.all(c.ranCommand(/git status/), c.hasUntracked('README.md')),
      },
    ],
  },
  {
    id: 'git-status',
    module: 'snapshots',
    title: '`git status` is your compass',
    idea: 'Status answers one question: where is each of my changes right now?',
    intro: `Of all the commands in Git, this is the one to run most often. Before
every other command, and after every other command.

\`git status\` sorts your files into a small number of buckets, and those buckets
*are* the mental model:

- **Untracked** — Git doesn't know about it
- **Changes not staged for commit** — Git knows about it, and you've edited it
- **Changes to be committed** — the edit is staged, ready for the next snapshot

Nearly every "I don't understand what Git is doing" moment is answered here.
It also always suggests the command that moves a file to the next bucket.`,
    scenario: 'one-commit',
    concepts: ['three-trees', 'working-directory'],
    steps: [
      {
        id: 'clean',
        goal: 'Run `git status` on a clean repository.',
        detail: '"nothing to commit, working tree clean" means all three trees agree.',
        suggested: ['git status'],
        hints: ['Run `git status`.'],
        check: c.ranCommand(/git status/),
      },
      {
        id: 'dirty',
        goal: 'Edit README.md, then run `git status` again.',
        detail: 'The same file has moved into a different bucket. Watch which one.',
        suggested: ['echo "# My Project\\n\\nNow with a description." > README.md', 'git status'],
        hints: [
          'Write new content into README.md, then check status.',
          'echo "# My Project\\n\\nNow with a description." > README.md',
        ],
        check: c.all(
          c.fileContains('README.md', 'description'),
          c.ranCommand(/git status/),
        ),
      },
    ],
  },
  {
    id: 'git-add',
    module: 'snapshots',
    title: 'The index: why staging exists',
    idea: 'The index is a draft of your next commit, which you compose deliberately.',
    intro: `Most beginners meet \`git add\` and reasonably ask: why is this step here?
Why can't I just commit my changes?

Because **you rarely want to commit everything you have changed.** You fixed a
bug, and while you were in there you also renamed a variable and added a debug
line. Those are not one change. The index lets you say "this part is the commit,
the rest is still in progress".

\`git add\` copies a file's *current content* into the index. That word "current"
matters, and the next lesson will catch you out with it.`,
    scenario: 'fresh-repo',
    concepts: ['index', 'staging', 'three-trees'],
    steps: [
      {
        id: 'two-files',
        goal: 'Create two files: README.md and scratch.txt.',
        suggested: ['echo "# My Project" > README.md', 'echo "todo: tidy this up" > scratch.txt'],
        hints: ['Create them one at a time with `echo ... > filename`.'],
        check: c.all(c.fileExists('README.md'), c.fileExists('scratch.txt')),
      },
      {
        id: 'stage-one',
        goal: 'Stage only README.md — leave scratch.txt out of it.',
        detail:
          'This is the whole point of the index: you are choosing what goes in the snapshot.',
        suggested: ['git add README.md'],
        hints: ['`git add <filename>` stages one specific file.'],
        check: c.all(c.staged('README.md'), c.not(c.staged('scratch.txt'))),
        pitfalls: [
          {
            when: c.all(c.staged('README.md'), c.staged('scratch.txt')),
            message:
              'You staged both. `git add .` takes everything — here we wanted only README.md. Unstage with `git restore --staged scratch.txt`.',
          },
        ],
      },
      {
        id: 'see-split',
        goal: 'Run `git status` and see the two files in two different sections.',
        detail:
          'One is "to be committed", one is "untracked". Same folder, different buckets.',
        suggested: ['git status'],
        hints: ['Run `git status`.'],
        check: c.ranCommand(/git status/),
      },
    ],
  },
  {
    id: 'git-commit',
    module: 'snapshots',
    title: 'Commit: a snapshot, not a diff',
    idea: 'A commit stores the entire tree, plus a pointer to what came before.',
    intro: `\`git commit\` takes whatever is in the index right now and freezes it
into a permanent object.

People often picture a commit as "the changes I made". It isn't. A commit
contains **a complete snapshot of every tracked file**, plus:

- a pointer to its **parent** commit (that's what makes it history)
- an **author** and a timestamp
- your **message**

Diffs are computed later, on demand, by comparing two snapshots. Git shows you
changes; it stores states.`,
    scenario: 'fresh-repo',
    concepts: ['commit-object', 'snapshot', 'branch-advance'],
    steps: [
      {
        id: 'prepare',
        goal: 'Create and stage README.md.',
        suggested: ['echo "# My Project" > README.md', 'git add README.md'],
        hints: ['Create the file, then `git add README.md`.'],
        check: c.staged('README.md'),
      },
      {
        id: 'commit',
        goal: 'Commit it with a message.',
        detail:
          'Use -m to give the message inline. A good message says *why*, not *what* — the diff already shows what.',
        suggested: ['git commit -m "Add a README"'],
        hints: [
          'The form is `git commit -m "your message"`.',
          'Try: git commit -m "Add a README"',
        ],
        check: c.commitCount(1),
      },
      {
        id: 'verify',
        goal: 'Run `git status` and confirm the working tree is clean.',
        detail:
          'The staged change moved into history, so all three trees agree again.',
        suggested: ['git status'],
        hints: ['Run `git status`.'],
        check: c.all(c.commitCount(1), c.ranCommand(/git status/)),
      },
    ],
    outro:
      'Notice the branch label `main` moved to your new commit. Committing moves the branch you are on — nothing else.',
  },
  {
    id: 'the-hash',
    module: 'snapshots',
    title: 'Why a commit is named by a hash',
    idea: 'The id is computed from the content, so identical content is literally the same object.',
    intro: `Every object in Git — file contents, directories, commits — is stored under
an id that is a **hash of its own content**.

This is not a serial number. It is derived. Two consequences follow, and they
explain a surprising amount of Git's behaviour:

1. **The same content always produces the same id.** Save the same file twice and
   Git stores one object. Two files with identical content share one blob.
2. **You cannot alter history quietly.** Change any byte of any commit and its id
   changes, which changes every descendant's id too.

Let's prove point 1 with real numbers.`,
    scenario: 'one-commit',
    concepts: ['hashing', 'object-database', 'blob', 'tree', 'commit-object'],
    steps: [
      {
        id: 'hash-a',
        goal: 'Create hello.txt containing "hello", then ask Git what id it would get.',
        detail:
          '`git hash-object` computes an id without storing anything. The answer here is a real SHA-1 — the same one real Git on your own machine would give you.',
        suggested: ['echo "hello" > hello.txt', 'git hash-object hello.txt'],
        hints: [
          'Create the file first, then run `git hash-object hello.txt`.',
        ],
        check: c.ranCommand(/git hash-object/),
      },
      {
        id: 'hash-b',
        goal: 'Create copy.txt with exactly the same content, and hash it too.',
        detail:
          'Different filename, same bytes. Compare the two ids: they are identical. The name is not part of the content.',
        suggested: ['echo "hello" > copy.txt', 'git hash-object copy.txt'],
        hints: ['Same idea as before, with a different filename.'],
        check: c.all(c.fileExists('copy.txt'), c.ranCommand(/git hash-object copy/)),
      },
      {
        id: 'inspect',
        goal: 'Look inside your existing commit with `git cat-file -p HEAD`.',
        detail:
          'This is the raw object: a tree id, an author, a committer, and a message. That is genuinely all a commit is.',
        suggested: ['git cat-file -p HEAD'],
        hints: ['`git cat-file -p HEAD` pretty-prints the commit object.'],
        check: c.ranCommand(/git cat-file/),
      },
      {
        id: 'tree',
        goal: 'Follow the commit’s tree with `git ls-tree HEAD`.',
        detail:
          'A tree is a directory: filenames paired with blob ids. Commit → tree → blobs is the whole storage model, three objects deep.',
        suggested: ['git ls-tree HEAD'],
        hints: ['`git ls-tree HEAD` lists what the commit’s tree contains.'],
        check: c.ranCommand(/git ls-tree/),
      },
    ],
    prediction: {
      question: 'Two files in different folders contain exactly the same text. How many blob objects does Git store?',
      options: ['Two — one per file', 'One — content is addressed by its hash', 'Depends on the file size'],
      answerIndex: 1,
      explanation:
        'The id is derived from the content alone, so identical content collides deliberately: one blob, referenced from two places in the tree.',
    },
  },
  {
    id: 'git-log',
    module: 'snapshots',
    title: 'Reading history with `git log`',
    idea: 'History is a chain of commits, walked backwards through parent links.',
    intro: `\`git log\` starts at HEAD and follows parent pointers backwards.

That's why the newest commit is at the top, and why you cannot ask "what came
*after* this commit?" — commits point at their parents, never at their children.

\`--oneline\` compresses each commit to one line. \`--graph\` draws the shape of
the history, which becomes essential once branches exist.`,
    scenario: 'small-history',
    concepts: ['history', 'parent', 'dag'],
    steps: [
      {
        id: 'log',
        goal: 'Run `git log` and read the full entries.',
        suggested: ['git log'],
        hints: ['Just `git log`.'],
        check: c.ranCommand(/git log$/),
      },
      {
        id: 'oneline',
        goal: 'Now run `git log --oneline` for the compact view.',
        detail: 'The short id at the start of each line is enough to identify a commit.',
        suggested: ['git log --oneline'],
        hints: ['Add the `--oneline` flag.'],
        check: c.ranCommand(/git log --oneline/),
      },
      {
        id: 'show',
        goal: 'Use `git show HEAD` to see the most recent commit and what it changed.',
        detail:
          'The diff at the bottom was computed by comparing this snapshot with its parent — it was not stored.',
        suggested: ['git show HEAD'],
        hints: ['`git show HEAD` shows the newest commit.'],
        check: c.ranCommand(/git show/),
      },
    ],
  },
  {
    id: 'git-diff',
    module: 'snapshots',
    title: 'Diff: comparing the three trees',
    idea: '`git diff` compares working tree to index; `--staged` compares index to HEAD.',
    intro: `This is the lesson that makes the three trees concrete.

There are three places a version of your file lives, so there are three
interesting comparisons:

| Command | Compares | Answers |
|---|---|---|
| \`git diff\` | working tree ↔ index | "what have I changed but not staged?" |
| \`git diff --staged\` | index ↔ HEAD | "what am I about to commit?" |
| \`git diff HEAD\` | working tree ↔ HEAD | "what have I changed since the last commit?" |

Confusion about \`git diff\` showing "nothing" after \`git add\` is just this
table not being known yet.`,
    scenario: 'small-history',
    concepts: ['diff', 'three-trees'],
    steps: [
      {
        id: 'edit',
        goal: 'Change app.js, then run `git diff`.',
        detail: 'This shows the unstaged change: working tree versus index.',
        suggested: ['echo "console.log(99)" > app.js', 'git diff'],
        hints: ['Edit app.js first, then run `git diff`.'],
        check: c.all(c.fileContains('app.js', '99'), c.ranCommand(/git diff$/)),
      },
      {
        id: 'stage-then-diff',
        goal: 'Stage the change, then run `git diff` again — and notice it is empty.',
        detail:
          'Nothing is wrong. The working tree and the index now match, and that is exactly what plain `git diff` compares.',
        suggested: ['git add app.js', 'git diff'],
        hints: ['`git add app.js`, then `git diff`.'],
        check: c.all(c.staged('app.js'), c.ranCommand(/git diff$/)),
      },
      {
        id: 'staged',
        goal: 'Run `git diff --staged` to see the change you are about to commit.',
        detail: 'Different pair of trees, so the change reappears.',
        suggested: ['git diff --staged'],
        hints: ['Add the `--staged` flag.'],
        check: c.ranCommand(/git diff --staged/),
      },
    ],
    prediction: {
      question: 'You edit a file and run `git add`. What does plain `git diff` now show?',
      options: ['The change you just staged', 'Nothing', 'An error'],
      answerIndex: 1,
      explanation:
        'Plain `git diff` compares the working tree with the index. After `git add` they are identical, so there is nothing to report. Use `--staged` to compare the index against HEAD.',
    },
  },
  {
    id: 'the-cycle',
    module: 'snapshots',
    title: 'The everyday cycle',
    idea: 'edit → status → add → commit, until it is muscle memory.',
    intro: `You now have every piece of the core loop. This lesson is deliberately
repetitive, because fluency here is worth more than any advanced command.

The loop:

1. **edit** a file
2. \`git status\` — where does Git think things are?
3. \`git add\` — compose the snapshot
4. \`git commit -m "..."\` — freeze it

Do it twice, on purpose, watching the panel on the right each time.`,
    scenario: 'one-commit',
    concepts: ['three-trees', 'staging', 'commit-object'],
    steps: [
      {
        id: 'first',
        goal: 'Add a new file app.js and commit it.',
        suggested: [
          'echo "console.log(1)" > app.js',
          'git add app.js',
          'git commit -m "Add app.js"',
        ],
        hints: ['Create, add, commit — three commands.'],
        check: c.all(c.commitCount(2), c.fileInHead('app.js')),
      },
      {
        id: 'second',
        goal: 'Now modify app.js and commit again.',
        detail:
          'For a file Git already tracks, `git commit -am "..."` stages and commits in one step. It only works on tracked files.',
        suggested: ['echo "console.log(2)" > app.js', 'git commit -am "Update app.js"'],
        hints: ['Edit the file, then try `git commit -am "Update app.js"`.'],
        check: c.commitCount(3),
      },
      {
        id: 'review',
        goal: 'Confirm your history with `git log --oneline`.',
        suggested: ['git log --oneline'],
        hints: ['`git log --oneline`.'],
        check: c.all(c.commitCount(3), c.ranCommand(/git log/)),
      },
    ],
  },
  {
    id: 'gitignore',
    module: 'snapshots',
    title: '.gitignore: deliberately untracked',
    idea: 'Some files should never be committed — build output, dependencies, secrets.',
    intro: `Not everything in your folder belongs in history.

Build output can be regenerated. Dependency folders are enormous and come from a
manifest. Secrets and API keys must *never* be committed — and once committed,
they are in history permanently, which is why this matters more than it looks.

A \`.gitignore\` file lists patterns Git should pretend not to see. It is itself
tracked, so everyone working on the project ignores the same things.

One important limit: **.gitignore only affects untracked files.** If a file is
already tracked, ignoring it does nothing.`,
    scenario: 'one-commit',
    concepts: ['gitignore', 'untracked'],
    steps: [
      {
        id: 'noise',
        goal: 'Create a file that should not be tracked: secrets.env.',
        suggested: ['echo "API_KEY=hunter2" > secrets.env'],
        hints: ['`echo "API_KEY=hunter2" > secrets.env`'],
        check: c.fileExists('secrets.env'),
      },
      {
        id: 'see-noise',
        goal: 'Run `git status` and see it offered up as untracked.',
        detail: 'Right now Git would happily let you commit your API key.',
        suggested: ['git status'],
        hints: ['Run `git status`.'],
        check: c.all(c.ranCommand(/git status/), c.hasUntracked('secrets.env')),
      },
      {
        id: 'ignore',
        goal: 'Create a .gitignore listing secrets.env, then check status again.',
        detail:
          'secrets.env disappears from the listing. Notice .gitignore itself appears instead — you do want to commit that one.',
        suggested: ['echo "secrets.env" > .gitignore', 'git status'],
        hints: [
          'Write the filename into .gitignore.',
          'echo "secrets.env" > .gitignore',
        ],
        check: c.all(
          c.fileExists('.gitignore'),
          c.not(c.hasUntracked('secrets.env')),
        ),
      },
      {
        id: 'commit-ignore',
        goal: 'Commit the .gitignore.',
        suggested: ['git add .gitignore', 'git commit -m "Ignore secrets.env"'],
        hints: ['Stage and commit it like any other file.'],
        check: c.fileInHead('.gitignore'),
      },
    ],
  },
];
