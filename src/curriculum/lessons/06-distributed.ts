import type { Lesson } from '../types';
import * as c from '../checks';

export const DISTRIBUTED_LESSONS: Lesson[] = [
  {
    id: 'clone',
    module: 'distributed',
    title: 'Clone: you get the whole thing',
    idea: 'A clone is a complete repository, not a checkout of one.',
    intro: `This is where Git differs most from what came before it.

When you clone, you receive **the entire history** — every commit, every branch,
all of it, stored locally in your own \`.git\`. You can commit, branch, merge, and
read the whole log with no network at all.

There is nothing technically special about the copy on the server. It is another
clone. We call it "origin" purely by convention.`,
    scenario: 'published',
    concepts: ['clone', 'distributed', 'remote'],
    steps: [
      {
        id: 'log',
        goal: 'Confirm you have full local history with `git log --oneline`.',
        detail: 'No network was involved. It is all on your machine.',
        suggested: ['git log --oneline'],
        hints: ['`git log --oneline`'],
        check: c.ranCommand(/git log/),
      },
      {
        id: 'remotes',
        goal: 'See what remotes you have with `git remote -v`.',
        suggested: ['git remote -v'],
        hints: ['`git remote -v`'],
        check: c.ranCommand(/git remote/),
      },
    ],
  },
  {
    id: 'remotes',
    module: 'distributed',
    title: 'A remote is a nickname for a URL',
    idea: '"origin" is not special. It is a name you chose for an address.',
    intro: `\`git remote add origin <url>\` stores one thing: a name paired with a URL.

That's it. "origin" is the conventional name for the place you cloned from, but
it carries no privileges. You can have several remotes, name them anything, and
push to whichever you like.`,
    scenario: 'small-history',
    concepts: ['remote', 'distributed'],
    steps: [
      {
        id: 'add',
        goal: 'Add a remote called origin.',
        suggested: ['git remote add origin https://github.com/you/project.git'],
        hints: ['`git remote add origin https://github.com/you/project.git`'],
        check: c.remoteExists('origin'),
      },
      {
        id: 'verify',
        goal: 'Confirm it with `git remote -v`.',
        detail: 'Nothing has been transferred. You have only recorded an address.',
        suggested: ['git remote -v'],
        hints: ['`git remote -v`'],
        check: c.ranCommand(/git remote -v/),
      },
    ],
  },
  {
    id: 'push',
    module: 'distributed',
    title: 'Push: publishing your commits',
    idea: 'Push copies your objects to the remote and moves its branch to match yours.',
    intro: `\`git push\` sends the commits the remote doesn't have, then asks it to move
its branch label to your commit.

\`-u\` (short for \`--set-upstream\`) additionally records that your local branch
is paired with that remote branch. After that, plain \`git push\` and \`git pull\`
know where to go, and \`git status\` can tell you whether you are ahead or behind.

Watch the remote panel appear as you do this.`,
    scenario: 'small-history',
    concepts: ['push', 'upstream', 'remote-tracking-ref'],
    steps: [
      {
        id: 'add-remote',
        goal: 'Add the origin remote.',
        suggested: ['git remote add origin https://github.com/you/project.git'],
        hints: ['`git remote add origin https://github.com/you/project.git`'],
        check: c.remoteExists('origin'),
      },
      {
        id: 'push-no-upstream',
        goal: 'Try a bare `git push` first, and read the error.',
        detail:
          'Git will not guess where to send it. The error tells you the exact command to run instead.',
        suggested: ['git push'],
        hints: ['Just run `git push`. It is meant to fail here.'],
        check: c.ranCommandFailing(/git push$/),
      },
      {
        id: 'push',
        goal: 'Push and set the upstream.',
        suggested: ['git push -u origin main'],
        hints: ['`git push -u origin main`'],
        check: c.pushed('main'),
      },
    ],
  },
  {
    id: 'remote-tracking-refs',
    module: 'distributed',
    title: 'origin/main is a memory, not a live view',
    idea: '`origin/main` records where the remote was the last time you talked to it.',
    intro: `\`origin/main\` looks like it means "main, on the server". It does not.

It is a **remote-tracking ref**: a local pointer recording where \`main\` was on
origin the last time you communicated. It updates only when you run \`fetch\`,
\`pull\`, or \`push\`. Between those, it can be arbitrarily out of date.

This explains a very common confusion: someone pushes, you run \`git log\`, and
see nothing new. Of course you don't — you haven't asked the server anything.`,
    scenario: 'remote-ahead',
    concepts: ['remote-tracking-ref', 'distributed', 'fetch'],
    steps: [
      {
        id: 'stale',
        goal: 'Run `git status`. It claims you are up to date.',
        detail:
          'A teammate has already pushed. Your repo does not know, because it has not asked.',
        suggested: ['git status'],
        hints: ['`git status`'],
        check: c.ranCommand(/git status/),
      },
      {
        id: 'fetch',
        goal: 'Now run `git fetch` and check status again.',
        detail:
          'Suddenly you are "behind by 1". Nothing about your work changed — only your knowledge of the server did.',
        suggested: ['git fetch', 'git status'],
        hints: ['`git fetch`, then `git status`.'],
        check: c.all(c.trackingRefAt('main'), c.behindBy(1)),
      },
    ],
  },
  {
    id: 'fetch-vs-pull',
    module: 'distributed',
    title: 'Fetch vs pull',
    idea: 'Fetch downloads. Pull downloads *and* integrates. Know which you want.',
    intro: `This is the hinge of the whole module.

- \`git fetch\` — download their commits, update \`origin/main\`, **touch nothing
  of yours**. Always safe. Nothing you have can break.
- \`git pull\` — do that, then immediately merge (or rebase) their work into your
  branch. Changes your files. Can conflict.

\`git pull\` is \`git fetch\` followed by an integration step you didn't get to
think about. Fetching first lets you look before you leap:

\`\`\`
git fetch
git log --oneline main..origin/main   # what did they do?
git merge origin/main                 # ok, bring it in
\`\`\``,
    scenario: 'remote-ahead',
    concepts: ['fetch-vs-pull', 'fetch', 'pull', 'remote-tracking-ref'],
    steps: [
      {
        id: 'fetch',
        goal: 'Fetch, without integrating.',
        detail:
          'Check `ls` afterwards: their new file is *not* in your working directory. You have the commit, not the checkout.',
        suggested: ['git fetch', 'ls'],
        hints: ['`git fetch`, then `ls`.'],
        check: c.fetchedButNotMerged('main'),
      },
      {
        id: 'inspect',
        goal: 'Inspect what they did before accepting it: `git log --oneline origin/main`.',
        detail: 'You can review their work while your own branch is untouched.',
        suggested: ['git log --oneline origin/main'],
        hints: ['`git log --oneline origin/main`'],
        check: c.ranCommand(/git log.*origin\/main/),
      },
      {
        id: 'integrate',
        goal: 'Now bring it in with `git merge origin/main`.',
        detail: 'A fast-forward: you had no commits of your own, so the label just slides.',
        suggested: ['git merge origin/main'],
        hints: ['`git merge origin/main`'],
        check: c.upToDateWith('main'),
      },
    ],
    prediction: {
      question: 'You run `git fetch`. What changed in your working directory?',
      options: ['Their new files appeared', 'Nothing', 'Your branch moved forward'],
      answerIndex: 1,
      explanation:
        'Fetch only writes remote-tracking refs and downloads objects. Your branch, index and working tree are untouched — that is precisely why it is always safe.',
    },
  },
  {
    id: 'rejected-push',
    module: 'distributed',
    title: 'When your push is rejected',
    idea: 'The remote has commits you do not. Integrate first, then publish.',
    intro: `You commit, you push, and Git refuses:

\`\`\`
! [rejected]        main -> main (fetch first)
\`\`\`

This is Git protecting someone else's work. Moving the remote's branch to your
commit would leave their commits with nothing pointing at them — effectively
deleting work you never even saw.

The fix is always the same: get their work, combine it with yours, push the
result.

\`--force\` overrides the check by overwriting their history. There are narrow
cases for it on your own branch, and it is close to always wrong on a shared one.`,
    scenario: 'diverged-from-remote',
    concepts: ['non-fast-forward', 'push', 'distributed'],
    steps: [
      {
        id: 'rejected',
        goal: 'Try to push, and read the rejection carefully.',
        suggested: ['git push'],
        hints: ['`git push` — it will be rejected.'],
        check: c.ranCommandFailing(/git push/),
      },
      {
        id: 'see-why',
        goal: 'Fetch and look at the divergence with `git status`.',
        detail: '"have diverged" — you each have commits the other lacks.',
        suggested: ['git fetch', 'git status'],
        hints: ['`git fetch`, then `git status`.'],
        check: c.all(c.trackingRefAt('main'), c.ranCommand(/git status/)),
      },
      {
        id: 'integrate',
        goal: 'Combine the histories with `git pull`.',
        detail: 'This creates a merge commit joining your line of work with theirs.',
        suggested: ['git pull'],
        hints: ['`git pull`'],
        check: c.headIsMerge(),
      },
      {
        id: 'push',
        goal: 'Now push successfully.',
        suggested: ['git push'],
        hints: ['`git push`'],
        check: c.pushed('main'),
      },
    ],
  },
  {
    id: 'pull-rebase',
    module: 'distributed',
    title: 'pull --rebase, and choosing your history',
    idea: 'Merge records that you worked in parallel; rebase presents it as if you did not.',
    intro: `When you and a teammate have diverged, \`git pull\` merges by default — and
on a busy repository that fills history with "Merge branch 'main' of..." commits
that record nothing anybody cares about.

\`git pull --rebase\` instead replays your local commits on top of theirs. The
history reads as a straight line.

Neither is correct in general:

- **merge** — truthful. It records that two people worked at once. Noisier.
- **rebase** — readable. A clean linear story. It rewrites *your* unpushed
  commits, which is fine because nobody else has them.

Teams usually settle on one and configure it. What matters is knowing which you
are getting and why.`,
    scenario: 'diverged-from-remote',
    concepts: ['pull', 'fetch-vs-pull', 'rebase', 'linear-history'],
    steps: [
      {
        id: 'rebase-pull',
        goal: 'Integrate with `git pull --rebase`.',
        suggested: ['git pull --rebase'],
        hints: ['`git pull --rebase`'],
        check: c.all(c.not(c.headIsMerge()), c.commitCountAtLeast(3)),
      },
      {
        id: 'compare',
        goal: 'Look at the shape: `git log --oneline --graph`.',
        detail:
          'A straight line. Compare this with the previous lesson, where the same situation produced a merge commit.',
        suggested: ['git log --oneline --graph'],
        hints: ['`git log --oneline --graph`'],
        check: c.ranCommand(/git log/),
      },
      {
        id: 'push',
        goal: 'Push your replayed commits.',
        suggested: ['git push'],
        hints: ['`git push`'],
        check: c.pushed('main'),
      },
    ],
  },
];
