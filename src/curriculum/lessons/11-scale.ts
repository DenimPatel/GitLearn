import type { Lesson } from '../types';
import * as c from '../checks';

export const SCALE_LESSONS: Lesson[] = [
  {
    id: 'secrets-in-history',
    module: 'scale',
    title: 'Secrets you committed by mistake',
    idea: 'Deleting the file does not delete the blob: history still has it.',
    intro: `You committed \`secrets.env\` with a live API key. Deleting the file and
committing that deletion removes it from the **current tree** — but the old
commit still contains the blob, and anyone who clones can read it with
\`git log -p\`.

So do both things, in this order:

1. Stop tracking the file — \`git rm --cached secrets.env\` removes it from the
   index but leaves it on disk.
2. Add it to \`.gitignore\` so it never comes back.
3. **Rotate the key.** This is the part people skip. Once a secret has been
   committed it must be treated as public; rewriting history is a cleanup, not a
   security fix.`,
    scenario: 'leaked-secret',
    concepts: ['secret-leak', 'gitignore', 'history'],
    steps: [
      {
        id: 'see',
        goal: 'See the secret sitting in the last commit.',
        detail: '`-p` shows the patch; this is exactly what an attacker would run.',
        suggested: ['git log -p -n 1'],
        hints: ['`git log -p -n 1`.'],
        check: c.ranCommand(/^git log -p/),
      },
      {
        id: 'untrack',
        goal: 'Untrack the file without deleting it from disk.',
        detail: '`--cached` is the crucial flag: it edits the index only.',
        suggested: ['git rm --cached secrets.env'],
        hints: ['`git rm --cached secrets.env`.'],
        check: c.all(c.fileExists('secrets.env'), c.not(c.staged('secrets.env'))),
      },
      {
        id: 'ignore',
        goal: 'Add secrets.env to .gitignore.',
        suggested: ['echo "secrets.env" > .gitignore', 'git add .gitignore'],
        hints: ['Write .gitignore, then `git add .gitignore`.'],
        check: c.all(c.fileExists('.gitignore'), c.staged('.gitignore')),
      },
      {
        id: 'commit',
        goal: 'Commit the removal from tracking.',
        suggested: ['git commit -m "Stop tracking secrets"'],
        hints: ['`git commit -m "Stop tracking secrets"`.'],
        check: c.all(c.fileNotInHead('secrets.env'), c.fileExists('secrets.env')),
      },
      {
        id: 'still-there',
        goal: 'Prove the old commit still contains the secret.',
        detail: 'The file is gone from HEAD — but HEAD~1 still has it. That is why the key must be rotated.',
        suggested: ['git log -p -n 1 HEAD~1'],
        hints: ['`git log -p -n 1 HEAD~1`.'],
        check: c.ranCommand(/^git log -p -n 1 HEAD~1/),
      },
    ],
    outro: `Track the absence, ignore the file, rotate the key. In that order, every time.`,
  },
  {
    id: 'really-unreachable',
    module: 'scale',
    title: 'What is really unreachable',
    idea: 'A reset commit is invisible to branches but still in the object database.',
    intro: `You reset a commit away. \`git log\` cannot see it, no branch points at
it — and yet it is still there, held only by the reflog.

\`git fsck\` lists objects no ref can reach: \`dangling commit\` lines. This is
the honest flip side of "nothing is lost": lost commits linger, and \`git gc\`
will eventually prune exactly these. Until then, the reflog plus a new branch
can bring one back.`,
    scenario: 'dangling-commit',
    concepts: ['recovery', 'object-database', 'maintenance', 'reflog'],
    steps: [
      {
        id: 'fsck',
        goal: 'List objects no ref can reach.',
        suggested: ['git fsck'],
        hints: ['`git fsck`.'],
        check: c.all(c.ranCommand(/^git fsck/), c.unreachableCount(1)),
      },
      {
        id: 'reflog',
        goal: 'Find the lost commit in HEAD’s reflog.',
        detail: '`HEAD@{1}` is where HEAD was before the reset.',
        suggested: ['git reflog'],
        hints: ['`git reflog`.'],
        check: c.ranCommand(/^git reflog/),
      },
      {
        id: 'rescue',
        goal: 'Give the dangling commit a branch again.',
        suggested: ['git branch recovered HEAD@{1}'],
        hints: ['`git branch recovered HEAD@{1}`.'],
        check: c.all(c.branchExists('recovered'), c.unreachableCount(0)),
      },
      {
        id: 'confirm',
        goal: 'Confirm the rescued commit is back in history.',
        suggested: ['git log --oneline --all'],
        hints: ['`git log --oneline --all`.'],
        check: c.ranCommand(/^git log --oneline --all/),
      },
    ],
    outro: `Unreachable is not deleted. \`git gc\` is what actually deletes — and it waits
until nothing in the reflog refers to the object.`,
  },
  {
    id: 'worktrees',
    module: 'scale',
    title: 'Two branches checked out at once',
    idea: 'Worktrees let one object database back several working directories.',
    intro: `Switching branches rewrites your working directory, which is awkward when
you need main compilable while you finish a feature — or when several AI agents
each want their own checkout.

A **worktree** is a second working directory attached to the same repository:
same objects, same refs, separate index and files. \`git worktree add ../hotfix
main\` creates one; you can then work on main there while your feature stays
checked out here.

This simulator keeps a single working tree, so the commands below inspect the
shared object database and refs that make worktrees cheap. The worktree commands
themselves are a field guide, to run on a real checkout.`,
    scenario: 'small-history',
    concepts: ['worktree', 'branch', 'three-trees'],
    steps: [
      {
        id: 'branches',
        goal: 'See the branches that could each have a worktree.',
        suggested: ['git branch'],
        hints: ['`git branch`.'],
        check: c.ranCommand(/^git branch/),
      },
      {
        id: 'tree',
        goal: 'List the snapshot a second worktree would check out.',
        suggested: ['git ls-tree -r HEAD'],
        hints: ['`git ls-tree -r HEAD`.'],
        check: c.ranCommand(/^git ls-tree -r HEAD/),
      },
      {
        id: 'objects',
        goal: 'Confirm the whole store is shared, not copied.',
        detail: 'There is one .git. A worktree adds an index and a working directory, never a second database.',
        suggested: ['git config --list', 'git show-ref'],
        hints: ['`git config --list`, then `git show-ref`.'],
        check: c.ranCommand(/^git show-ref/),
      },
    ],
    outro: `On a real machine: \`git worktree add ../hotfix main\`, \`git worktree list\`,
\`git worktree remove ../hotfix\`.`,
  },
  {
    id: 'huge-repos',
    module: 'scale',
    title: 'Working with a huge repository',
    idea: 'Sparse checkout and partial clones avoid materialising history you do not need.',
    intro: `A monorepo can be gigabytes. Git has three independent ways to do less
work, and mixing them up causes real confusion:

- **Shallow clone** (\`--depth 1\`) — download only recent commits.
- **Partial clone** (\`--filter=blob:none\`) — download commits and trees, fetch
  blobs on demand.
- **Sparse checkout** (\`git sparse-checkout set <dir>\`) — materialise only some
  directories into your working tree.

None of these changes what Git *is*: an object database plus refs. They change
how much of it you copy and unpack.

This simulator has no network and no packfiles, so it cannot honestly pretend to
transfer less. The commands below inspect the local snapshot and configuration
you would optimise; the clone flags are the field guide.`,
    scenario: 'small-history',
    concepts: ['sparse-checkout', 'partial-clone', 'distributed'],
    steps: [
      {
        id: 'files',
        goal: 'List the files a checkout materialises today.',
        suggested: ['git ls-files'],
        hints: ['`git ls-files` lists the index.'],
        check: c.ranCommand(/^git ls-files/),
      },
      {
        id: 'tree',
        goal: 'List every blob in the snapshot, including directories.',
        suggested: ['git ls-tree -r HEAD'],
        hints: ['`git ls-tree -r HEAD`.'],
        check: c.ranCommand(/^git ls-tree -r HEAD/),
      },
      {
        id: 'config',
        goal: 'Look at the settings that would govern clone behaviour.',
        suggested: ['git config --list'],
        hints: ['`git config --list`.'],
        check: c.ranCommand(/^git config --list/),
      },
    ],
    outro: `On a real monorepo: \`git clone --filter=blob:none <url>\`, then
\`git sparse-checkout set apps/web\`.`,
  },
  {
    id: 'line-endings',
    module: 'scale',
    title: 'Line endings, .gitattributes, and the diff that ate your file',
    idea: 'A whole-file diff is usually a line-ending change, and core.autocrlf is why.',
    intro: `Windows ends lines with CRLF, Unix with LF. If Git stores whatever the
checkout had, the same file written on two machines differs by invisible
characters — and one innocent save produces a diff where the *entire file*
changed.

The fix is a decision recorded in the repository: \`.gitattributes\` with
\`* text=auto\` tells Git to store LF in the object database and convert on
checkout. \`core.autocrlf\` is the older, per-machine version of the same idea.

Once you know this, "why is this diff the whole file?" has an answer you can
check.`,
    scenario: 'small-history',
    concepts: ['gitattributes', 'three-trees'],
    steps: [
      {
        id: 'setting',
        goal: 'Turn on automatic line-ending conversion.',
        suggested: ['git config core.autocrlf true'],
        hints: ['`git config core.autocrlf true`.'],
        check: c.configEquals('core.autocrlf', 'true'),
      },
      {
        id: 'attributes',
        goal: 'Record the policy in .gitattributes so everyone gets it.',
        suggested: ['echo "* text=auto" > .gitattributes', 'git add .gitattributes'],
        hints: ['Write .gitattributes, then `git add .gitattributes`.'],
        check: c.all(c.fileExists('.gitattributes'), c.staged('.gitattributes')),
      },
      {
        id: 'commit',
        goal: 'Commit the normalisation policy.',
        suggested: ['git commit -m "Normalise line endings"'],
        hints: ['`git commit -m "Normalise line endings"`.'],
        check: c.fileInHead('.gitattributes'),
      },
      {
        id: 'verify',
        goal: 'Read your configuration back.',
        suggested: ['git config --list'],
        hints: ['`git config --list`.'],
        check: c.ranCommand(/^git config --list/),
      },
    ],
    outro: `When a diff shows the whole file changed, suspect line endings first.`,
  },
];
