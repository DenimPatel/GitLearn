import type { Lesson } from '../types';
import * as c from '../checks';

export const TEAMWORK_LESSONS: Lesson[] = [
  {
    id: 'the-push-you-have-to-force',
    module: 'teamwork',
    title: 'The push you have to force',
    idea: 'After a rebase your branch no longer fast-forwards — so a plain push is rejected.',
    intro: `You have a feature branch that has been pushed for review. While it sat
there, main moved on, and a teammate also added a commit to your branch.

You rebase your work onto the new main. That **rewrites** your commit: same
change, new parent, therefore a new id. Your remote branch still points at the
old commit, so the two have diverged — and Git refuses to overwrite a branch
that contains work you have not seen.

The blunt answer is \`git push --force\`. It works. It also throws away the
teammate's commit. Hold that thought for the next lesson.`,
    scenario: 'feature-needs-rebase',
    concepts: ['force-push', 'rebase-rewrites-history', 'non-fast-forward'],
    steps: [
      {
        id: 'rebase',
        goal: 'Rebase your work onto the new main.',
        suggested: ['git rebase main'],
        hints: ['`git rebase main`.'],
        check: c.onBranch('add-login'),
      },
      {
        id: 'rejected',
        goal: 'Try a normal push, and read the rejection.',
        detail: 'Git says "fetch first": the remote has commits your local tracking ref does not.',
        suggested: ['git push'],
        hints: ['Plain `git push` is meant to fail here.'],
        check: c.ranCommandFailing(/^git push$/),
      },
      {
        id: 'force',
        goal: 'Force it through.',
        detail: 'This succeeds — and silently deletes whatever the remote had.',
        suggested: ['git push --force'],
        hints: ['`git push --force`.'],
        check: c.forcePushed(),
      },
    ],
    outro: `--force is a loaded gun pointed at your teammates' commits. The next lesson
is the safety catch.`,
  },
  {
    id: 'force-with-lease',
    module: 'teamwork',
    title: 'The force that refuses to destroy work',
    idea: '`--force-with-lease` only overwrites the remote if it is exactly where you last saw it.',
    intro: `This is the same situation: your branch was rebased, and a teammate pushed
a commit to it since your last fetch.

\`--force-with-lease\` compares the remote branch against **your cached
\`refs/remotes/origin/<branch>\`** before overwriting. If they differ, it refuses.
Your tracking ref is stale, so it refuses — and that refusal is the correct
outcome, because forcing would have deleted the teammate's work.

The lesson is not "the command failed". The lesson is that it failed *instead of*
losing a commit, and the failure names the reason.`,
    scenario: 'feature-needs-rebase',
    concepts: ['force-push', 'non-fast-forward', 'remote-tracking-ref'],
    steps: [
      {
        id: 'rebase',
        goal: 'Rebase your work onto main.',
        suggested: ['git rebase main'],
        hints: ['`git rebase main`.'],
        check: c.onBranch('add-login'),
      },
      {
        id: 'plain',
        goal: 'Confirm a plain push is rejected.',
        suggested: ['git push'],
        hints: ['It should fail with "fetch first".'],
        check: c.ranCommandFailing(/^git push$/),
      },
      {
        id: 'lease',
        goal: 'Try the safe force — and watch it refuse.',
        detail: 'The rejection is the success condition here.',
        suggested: ['git push --force-with-lease'],
        hints: ['`git push --force-with-lease`. It should be rejected.'],
        check: c.all(c.ranCommandFailing(/force-with-lease/), c.not(c.forcePushed())),
      },
      {
        id: 'inspect',
        goal: 'Fetch, then look at what the remote actually has.',
        detail: 'There is a commit on origin/add-login that you have never seen. Forcing would have lost it.',
        suggested: ['git fetch', 'git log --oneline origin/add-login'],
        hints: ['`git fetch`, then log the remote-tracking branch.'],
        check: c.ranCommand(/^git fetch/),
      },
    ],
    outro: `Use \`--force-with-lease\` instead of \`--force\` by habit. It lets you
rewrite your own history while refusing to discard anyone else's.`,
  },
  {
    id: 'commit-messages',
    module: 'teamwork',
    title: 'Commit messages your reviewer can use',
    idea: 'A subject that completes "this commit will…", a blank line, then the why.',
    intro: `A reviewer reads your subject line first, and often only that. It should
finish the sentence *"this commit will…"* — \`feat: add app.js\`, not
\`changes\` or \`wip\`.

Then a blank line, then a body that explains **why** the change exists. The code
already shows *what* changed; only you know the reasoning, the alternatives you
rejected, and the thing that will surprise the next reader.

Conventional-commit prefixes (\`feat:\`, \`fix:\`, \`docs:\`, \`refactor:\`) are a
convention, not a Git feature — but they make history sortable and changelogs
automatable.`,
    scenario: 'one-commit',
    concepts: ['commit-message', 'commit-object'],
    steps: [
      {
        id: 'look',
        goal: 'Look at the current message.',
        suggested: ['git log -n 1'],
        hints: ['`git log -n 1` shows the subject and body.'],
        check: c.ranCommand(/^git log -n 1/),
      },
      {
        id: 'stage',
        goal: 'Create and stage a new file.',
        suggested: ['echo "console.log(1)" > app.js', 'git add app.js'],
        hints: ['Create app.js and `git add` it.'],
        check: c.staged('app.js'),
      },
      {
        id: 'commit',
        goal: 'Commit it with a subject and a body.',
        detail: 'A second `-m` becomes the body. The blank line between them is written for you.',
        suggested: [
          'git commit -m "feat: add app.js" -m "Logs a number so operators can confirm the runtime started."',
        ],
        hints: ['Repeat `-m`: the first is the subject, the second the body.'],
        check: c.all(c.headMessageMatches(/^feat: add app\.js/), c.headMessageHasBody()),
      },
      {
        id: 'show',
        goal: 'Read the commit back the way a reviewer would.',
        suggested: ['git show HEAD'],
        hints: ['`git show HEAD`.'],
        check: c.ranCommand(/^git show HEAD/),
      },
    ],
    outro: 'Writing the message is part of the change, not an afterthought.',
  },
  {
    id: 'cleaning-up-after-a-merge',
    module: 'teamwork',
    title: 'Cleaning up after a merged PR',
    idea: 'Once a branch is merged, delete it — locally and on the remote.',
    intro: `A merged pull request leaves behind two stale labels: your local branch
and the remote branch on origin. Neither is harmful, but both clutter
\`git branch -a\`, and a long list of dead branches is how you stop being able to
find the live ones.

First sync main so it contains the merge. Then delete the local branch with
\`-d\` (Git refuses to delete it if it is *not* fully merged, which is a useful
guard). Then delete the remote branch — a push in reverse:
\`git push origin --delete <branch>\`.`,
    scenario: 'feature-merged',
    concepts: ['branch-hygiene', 'merge-strategies', 'remote-tracking-ref'],
    steps: [
      {
        id: 'branches',
        goal: 'List local and remote-tracking branches.',
        suggested: ['git branch -a'],
        hints: ['`git branch -a`.'],
        check: c.ranCommand(/^git branch -a/),
      },
      {
        id: 'sync',
        goal: 'Switch to main and bring the merge down.',
        detail: 'The PR merge happened on the server; your main is behind until you pull.',
        suggested: ['git switch main', 'git pull'],
        hints: ['`git switch main`, then `git pull`.'],
        check: c.all(c.onBranch('main'), c.upToDateWith('main')),
      },
      {
        id: 'delete-local',
        goal: 'Delete the merged local branch.',
        suggested: ['git branch -d add-login'],
        hints: ['`-d` refuses if the branch is not merged.'],
        check: c.branchMissing('add-login'),
      },
      {
        id: 'delete-remote',
        goal: 'Delete the merged remote branch too.',
        detail: 'Pushing with `--delete` removes the branch on origin.',
        suggested: ['git push origin --delete add-login'],
        hints: ['`git push origin --delete add-login`.'],
        check: c.remoteBranchMissing('add-login'),
      },
    ],
    outro: 'A repository with only live branches is a repository people can navigate.',
  },
  {
    id: 'fork-vs-clone',
    module: 'teamwork',
    title: 'Fork vs clone: the contributor’s triangle',
    idea: 'You cannot push to someone else’s repository, so you fork it first.',
    intro: `On a project you do not own, \`git clone\` gives you a copy but not the
right to push back. The open-source convention is the **fork triangle**:

1. Fork the project on the host — a copy under your account.
2. Clone *your* fork: \`git clone https://github.com/you/project.git\`.
3. Add the original as a second remote:
   \`git remote add upstream https://github.com/them/project.git\`.
4. Pull their changes into your fork with
   \`git fetch upstream\` then \`git rebase upstream/main\`.
5. Push branches to \`origin\` (your fork) and open a pull request across the triangle.

There is nothing special about the word "fork" to Git: it is just another
repository, and \`upstream\` is just another remote name.

This simulator models a single remote honestly, so here you inspect the pieces
that are real — remotes, tracking refs, history — and the triangle itself is a
field guide you run on a real host.`,
    scenario: 'published',
    concepts: ['fork', 'remote', 'upstream'],
    steps: [
      {
        id: 'remotes',
        goal: 'See your remote names and URLs.',
        detail: 'On a real fork, this is where `upstream` would appear beside `origin`.',
        suggested: ['git remote -v'],
        hints: ['`git remote -v`.'],
        check: c.ranCommand(/^git remote -v/),
      },
      {
        id: 'tracking',
        goal: 'See which remote branch yours is paired with.',
        suggested: ['git branch -a'],
        hints: ['`git branch -a` shows remotes/origin/main.'],
        check: c.ranCommand(/^git branch -a/),
      },
      {
        id: 'config',
        goal: 'Confirm remotes are only configuration.',
        detail: 'A remote is a name and a URL — nothing more. That is why adding `upstream` costs nothing.',
        suggested: ['git config --list'],
        hints: ['`git config --list` shows remote.origin.url.'],
        check: c.ranCommand(/^git config --list/),
      },
      {
        id: 'history',
        goal: 'Look at the history you would be rebasing onto upstream.',
        suggested: ['git log --oneline'],
        hints: ['`git log --oneline`.'],
        check: c.ranCommand(/^git log --oneline/),
      },
    ],
    outro: `Fork, clone, add upstream, fetch, rebase, push, open a PR. The whole open-source
loop — built from commands you already know.`,
  },
];
