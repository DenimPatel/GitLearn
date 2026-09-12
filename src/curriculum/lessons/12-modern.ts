import type { Lesson } from '../types';
import * as c from '../checks';

export const MODERN_LESSONS: Lesson[] = [
  {
    id: 'why-main-not-master',
    module: 'modern',
    title: 'Why main, not master',
    idea: 'The default branch name is configuration and a symbolic ref — nothing more.',
    intro: `For most of Git's life \`git init\` created a branch called \`master\`.
Since Git 2.28 you can choose, and the ecosystem has settled on \`main\` —
Git 3.0 makes it the default.

Nothing about Git depends on the name. A branch is a ref under
\`refs/heads/\`, and HEAD is a **symbolic ref** pointing at one of them. Renaming
the branch is \`git branch -m\`; changing the default for *new* repositories is
the \`init.defaultBranch\` config key.

This repository predates the change: it is on \`master\`. Rename it.`,
    scenario: 'legacy-master',
    concepts: ['default-branch', 'ref', 'config'],
    steps: [
      {
        id: 'head',
        goal: 'See what HEAD actually points at.',
        detail: 'A symbolic ref: HEAD does not contain a commit id, it contains a ref name.',
        suggested: ['git symbolic-ref HEAD'],
        hints: ['`git symbolic-ref HEAD`.'],
        check: c.ranCommand(/^git symbolic-ref HEAD/),
      },
      {
        id: 'rename',
        goal: 'Rename the branch to main.',
        suggested: ['git branch -m master main'],
        hints: ['`git branch -m master main`.'],
        check: c.all(c.onBranch('main'), c.branchMissing('master'), c.branchExists('main')),
      },
      {
        id: 'refs',
        goal: 'Confirm the refs moved.',
        suggested: ['git show-ref'],
        hints: ['`git show-ref` lists every ref and its commit.'],
        check: c.ranCommand(/^git show-ref/),
      },
      {
        id: 'default',
        goal: 'Check the default for repositories you create next.',
        suggested: ['git config init.defaultBranch'],
        hints: ['A plain get: `git config init.defaultBranch`.'],
        check: c.ranCommand(/^git config init\.defaultBranch/),
      },
    ],
    outro: `Renaming a branch is a one-line ref move. The name \`main\` is a convention,
not a technical requirement — but it is now the default.`,
  },
  {
    id: 'switch-and-restore',
    module: 'modern',
    title: 'switch and restore instead of checkout',
    idea: '`checkout` did two jobs; the modern commands do one each.',
    intro: `For years \`git checkout\` meant both "change branch" and "overwrite this
file from the index". The same word, two unrelated mental models — the single
biggest source of early confusion in Git.

Git 2.23 split it in two:

- \`git switch\` changes **which branch you are on**.
- \`git restore\` changes **files**, either discarding working-tree edits or
  unstaging (\`--staged\`).

Git 3.0 formally positions these as the primary commands. \`checkout\` still
works, and you will read it in older material forever — so recognise it, and
reach for the focused pair.`,
    scenario: 'dirty-history',
    concepts: ['checkout-superseded', 'three-trees', 'branch'],
    steps: [
      {
        id: 'create',
        goal: 'Create and switch to a branch with `switch`.',
        suggested: ['git switch -c experiment'],
        hints: ['`git switch -c experiment`.'],
        check: c.onBranch('experiment'),
      },
      {
        id: 'back',
        goal: 'Switch back to main.',
        suggested: ['git switch main'],
        hints: ['`git switch main`.'],
        check: c.onBranch('main'),
      },
      {
        id: 'discard',
        goal: 'Discard the uncommitted edit to app.js.',
        detail: '`restore` copies the index version back over your working file.',
        suggested: ['git restore app.js'],
        hints: ['`git restore app.js`.'],
        check: c.fileLacks('app.js', 'work in progress'),
      },
      {
        id: 'unstage',
        goal: 'Stage a change, then unstage it without touching the file.',
        suggested: ['echo "console.log(9)" > app.js', 'git add app.js', 'git restore --staged app.js'],
        hints: ['`--staged` copies HEAD back into the index only.'],
        check: c.all(c.stagedCount(0), c.fileContains('app.js', 'console.log(9)')),
      },
      {
        id: 'legacy',
        goal: 'Recognise the old spelling.',
        detail: '`checkout` still works; you just no longer need it for these two jobs.',
        suggested: ['git checkout main'],
        hints: ['`git checkout main`.'],
        check: c.ranCommand(/^git checkout main/),
      },
    ],
    outro: 'One verb per job. That is the whole upgrade.',
  },
  {
    id: 'config-and-aliases',
    module: 'modern',
    title: 'Config is just key-value, and aliases',
    idea: 'An alias is a config key. `git st` can mean `git status`.',
    intro: `Everything in Git's configuration is a dotted key and a string value:
\`user.name\`, \`init.defaultBranch\`, \`core.autocrlf\`. There is no schema you
have to memorise to set one; there is only the question of whether a command
reads it.

Aliases are the clearest proof. \`alias.st status\` makes \`git st\` expand to
\`git status\`. It is not a plugin or a shell function — it is a key in the same
store, and this simulator honours it exactly as real Git does.`,
    scenario: 'one-commit',
    concepts: ['config', 'identity'],
    steps: [
      {
        id: 'list',
        goal: 'Dump the whole configuration.',
        suggested: ['git config --list'],
        hints: ['`git config --list`.'],
        check: c.ranCommand(/^git config --list/),
      },
      {
        id: 'name',
        goal: 'Set your name.',
        suggested: ['git config user.name "Grace Hopper"'],
        hints: ['`git config user.name "Grace Hopper"`.'],
        check: c.configEquals('user.name', 'Grace Hopper'),
      },
      {
        id: 'alias-st',
        goal: 'Define `git st` as an alias for status.',
        suggested: ['git config alias.st status'],
        hints: ['`git config alias.st status`.'],
        check: c.configEquals('alias.st', 'status'),
      },
      {
        id: 'use-st',
        goal: 'Use the alias.',
        detail: 'It expands to the real command before the engine ever sees it.',
        suggested: ['git st'],
        hints: ['`git st` runs `git status`.'],
        check: c.ranCommand(/^git status/),
      },
      {
        id: 'alias-lg',
        goal: 'Define a multi-word alias for a formatted log.',
        suggested: ['git config alias.lg "log --oneline --graph"', 'git lg'],
        hints: ['Quote the whole value: `"log --oneline --graph"`.'],
        check: c.ranCommand(/^git log --oneline --graph/),
      },
    ],
    outro: 'Aliases are sugar over config. Set the ones that save you typing, and no others.',
  },
  {
    id: 'git-3-defaults',
    module: 'modern',
    title: 'What Git 3.0 changes',
    idea: 'main by default, SHA-256 object names, and the reftable ref backend.',
    intro: `Git 3.0 (expected around the end of 2026) is not a rewrite — it is a
change of **defaults**, and defaults are what shape how everyone actually uses a
tool:

- \`main\` is the default branch (\`init.defaultBranch\`).
- New repositories use **SHA-256** object names instead of SHA-1.
- The **reftable** backend becomes the default way refs are stored.
- \`switch\` and \`restore\` are formally the primary commands over \`checkout\`.

You already know the key fact that makes the hash change survivable:
\`git hash-object\` computes an id from content. The id is an implementation of
content-addressing; the model — immutable, deduplicated objects — does not
change when the algorithm does.`,
    scenario: 'small-history',
    concepts: ['git-3-0', 'default-branch', 'hashing'],
    steps: [
      {
        id: 'default',
        goal: 'Read the default branch setting.',
        suggested: ['git config init.defaultBranch'],
        hints: ['A plain get: `git config init.defaultBranch`.'],
        check: c.ranCommand(/^git config init\.defaultBranch/),
      },
      {
        id: 'head',
        goal: 'Confirm the current branch through HEAD.',
        suggested: ['git symbolic-ref HEAD'],
        hints: ['`git symbolic-ref HEAD`.'],
        check: c.ranCommand(/^git symbolic-ref HEAD/),
      },
      {
        id: 'hash',
        goal: 'Compute the content id of a file.',
        detail: 'This is the SHA-1 Git uses today. Under Git 3.0 the same bytes would produce a longer SHA-256 id — same idea, new algorithm.',
        suggested: ['git hash-object README.md'],
        hints: ['`git hash-object README.md`.'],
        check: c.ranCommand(/^git hash-object README\.md/),
      },
      {
        id: 'change',
        goal: 'Change the default branch for future repositories.',
        detail: 'It does not rename the branch you are on — only the next `git init` reads it.',
        suggested: ['git config init.defaultBranch trunk', 'git config init.defaultBranch'],
        hints: ['Set it, then read it back.'],
        check: c.configEquals('init.defaultBranch', 'trunk'),
      },
    ],
    outro: `Defaults are not details. Git 3.0 is mostly a very considered set of them.`,
  },
  {
    id: 'hooks',
    module: 'modern',
    title: 'Hooks, now configured rather than copied',
    idea: 'A hook is a command Git runs at a named moment — and config can hold it.',
    intro: `Hooks have always been scripts in \`.git/hooks\`: \`pre-commit\` runs before a
commit is created, \`pre-push\` before a push, and so on. The catch is that
\`.git/hooks\` is not committed, so every clone has to copy them in again.

Git 2.54 added **config-based hooks**: a key like \`hook.pre-commit.command\`
can name the command instead, and \`git hook list\` reports what is installed.

This simulator stores the key faithfully. It does not execute hooks — there is
no shell execution or process model here — and the lesson says so rather than
pretending otherwise.`,
    scenario: 'one-commit',
    concepts: ['hooks', 'config'],
    steps: [
      {
        id: 'set',
        goal: 'Install a pre-commit hook through config.',
        suggested: ['git config hook.pre-commit.command "npm test"'],
        hints: ['`git config hook.pre-commit.command "npm test"`.'],
        check: c.configEquals('hook.pre-commit.command', 'npm test'),
      },
      {
        id: 'read',
        goal: 'Read it back.',
        suggested: ['git config hook.pre-commit.command'],
        hints: ['A plain get by key.'],
        check: c.ranCommand(/^git config hook\.pre-commit\.command/),
      },
      {
        id: 'commit',
        goal: 'Commit something and notice that nothing fires here.',
        detail: 'On a real machine, a failing `npm test` would block this commit. Here, config is real and execution is not.',
        suggested: ['echo "x" > f.txt', 'git add f.txt', 'git commit -m "Test the hook config"'],
        hints: ['Create a file, add it, commit as usual.'],
        check: c.commitCount(2),
      },
      {
        id: 'list',
        goal: 'See the hook key among your configuration.',
        suggested: ['git config --list'],
        hints: ['`git config --list`.'],
        check: c.ranCommand(/^git config --list/),
      },
    ],
    outro: `Config-based hooks move the definition of a hook into version control.
Running them is the next step a real machine takes.`,
  },
  {
    id: 'signing',
    module: 'modern',
    title: 'Signing your commits',
    idea: 'A signature proves *who* made a commit; it says nothing about whether it is good.',
    intro: `The author name in a commit is free text. Anyone can write
\`Linus Torvalds <torvalds@linux-foundation.org>\`. A signature is what turns
that claim into something verifiable: Git signs the commit object, and a host
shows a "Verified" badge when the signature matches a trusted key.

The configuration is ordinary keys — \`gpg.format\`, \`user.signingkey\`,
\`commit.gpgsign\`. The cryptography is real, and this simulator does not perform
it. What it teaches honestly is the configuration and the **meaning**: a
Verified badge proves provenance and integrity, not correctness or good
intent.`,
    scenario: 'one-commit',
    concepts: ['signing', 'config'],
    steps: [
      {
        id: 'format',
        goal: 'Choose the signing format.',
        suggested: ['git config gpg.format ssh'],
        hints: ['`git config gpg.format ssh`.'],
        check: c.configEquals('gpg.format', 'ssh'),
      },
      {
        id: 'key',
        goal: 'Point Git at your public key.',
        suggested: ['git config user.signingkey ~/.ssh/id_ed25519.pub'],
        hints: ['`git config user.signingkey <path>`.'],
        check: c.configEquals('user.signingkey', '~/.ssh/id_ed25519.pub'),
      },
      {
        id: 'always',
        goal: 'Sign every commit automatically.',
        suggested: ['git config commit.gpgsign true'],
        hints: ['`git config commit.gpgsign true`.'],
        check: c.configEquals('commit.gpgsign', 'true'),
      },
      {
        id: 'verify',
        goal: 'Read the setting back.',
        suggested: ['git config --get commit.gpgsign'],
        hints: ['`git config --get commit.gpgsign`.'],
        check: c.ranCommand(/^git config --get commit\.gpgsign/),
      },
    ],
    outro: `Sign commits on a shared project. Understand that the badge is about identity,
not trustworthiness.`,
  },
  {
    id: 'what-is-not-modelled',
    module: 'modern',
    title: 'What this simulator does not model',
    idea: 'An honest list, with the real commands for each.',
    intro: `This engine models Git's object database, refs, index, three-way merge,
remotes and history faithfully. It does **not** model the parts that need a
filesystem, a network, or a binary it does not have:

- **Packfiles and compression** — real Git stores objects packed. Here they are
  loose objects in a map.
- **Networking** — there is no wire protocol; a "remote" is a second repository
  in memory.
- **Submodules and Git LFS** — separate object stores with their own rules.
- **Hook execution** — config is real; nothing runs.
- **Commit signing** — configured, not performed.
- **Sparse checkout and partial clones** — they are about *not* transferring
  objects, which needs a transfer to begin with.

Rather than fake any of these, the commands below inspect what is genuinely
modelled. The claims the rest of the course makes are claims this engine can
back up.`,
    scenario: 'published',
    concepts: ['object-database', 'remote', 'distributed'],
    steps: [
      {
        id: 'objects',
        goal: 'Inspect a real object in the database.',
        suggested: ['git cat-file -t HEAD', 'git cat-file -p HEAD'],
        hints: ['`git cat-file -t HEAD`, then `-p`.'],
        check: c.ranCommand(/^git cat-file/),
      },
      {
        id: 'tree',
        goal: 'Inspect the commit’s tree.',
        suggested: ['git ls-tree -r HEAD'],
        hints: ['`git ls-tree -r HEAD`.'],
        check: c.ranCommand(/^git ls-tree -r HEAD/),
      },
      {
        id: 'remote',
        goal: 'Look at the remote, which is only a name and a URL.',
        suggested: ['git remote -v'],
        hints: ['`git remote -v`.'],
        check: c.ranCommand(/^git remote -v/),
      },
      {
        id: 'config',
        goal: 'See the whole configuration.',
        suggested: ['git config --list'],
        hints: ['`git config --list`.'],
        check: c.ranCommand(/^git config --list/),
      },
    ],
    outro: `Knowing the model's edges is part of knowing the model. On a real machine,
\`git gc\`, \`git sparse-checkout\` and \`git submodule\` are waiting.`,
  },
];
