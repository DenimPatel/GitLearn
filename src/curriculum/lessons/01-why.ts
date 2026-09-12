import type { Lesson } from '../types';
import * as c from '../checks';

export const WHY_LESSONS: Lesson[] = [
  {
    id: 'why-version-control',
    module: 'why',
    title: 'The final_v2_FINAL problem',
    idea: 'Copies record what a file is. History records how it got that way.',
    intro: `You have almost certainly done this: \`report.doc\`, \`report_v2.doc\`,
\`report_final.doc\`, \`report_final_ACTUALLY.doc\`.

It half-works, and then it fails in three specific ways. You cannot tell what
changed between two copies without opening both. You cannot tell *why* anything
changed. And the moment a second person is involved, you have no way to combine
their copy with yours except by hand.

Version control fixes all three by storing **history** instead of **copies**: a
sequence of snapshots, each labelled with who made it, when, and why.

Let's look at the folder you're starting with. This is not a repository yet —
it's just files.`,
    scenario: 'empty',
    concepts: ['version-control'],
    steps: [
      {
        id: 'look',
        goal: 'List the files in the folder.',
        detail: 'This is an ordinary terminal. `ls` shows what is here — nothing yet.',
        suggested: ['ls'],
        hints: ['Type `ls` and press Enter.'],
        check: c.ranCommand(/^ls/),
      },
      {
        id: 'create',
        goal: 'Create a file called notes.txt.',
        detail: 'Anything you create now is just a file. Git is not watching yet.',
        suggested: ['echo "some work" > notes.txt'],
        hints: [
          'Use `echo "text" > filename` to write text into a new file.',
          'Try: echo "some work" > notes.txt',
        ],
        check: c.fileExists('notes.txt'),
      },
      {
        id: 'realise',
        goal: 'Try `git status` — and watch it refuse.',
        detail:
          'Git has no idea this folder exists. That error message is worth reading: it tells you exactly what is missing.',
        suggested: ['git status'],
        hints: ['Just run `git status`. It is *supposed* to fail here.'],
        check: c.ranCommandFailing(/git status/),
      },
    ],
    outro:
      'Every Git command except `git init` needs a repository. Next: making one.',
  },
  {
    id: 'what-is-a-repository',
    module: 'why',
    title: 'What a repository actually is',
    idea: 'A repository is your project folder plus a database of its entire history.',
    intro: `\`git init\` creates one hidden directory: \`.git\`.

That directory *is* the repository. It holds every snapshot you have ever made,
every branch name, and every pointer between them. Your visible files are just
the one version currently checked out of that database.

This has a consequence worth internalising early: **delete .git and you have
deleted the history, not the files. Delete the files and the history is still
there.** They are two separate things living in the same folder.`,
    scenario: 'empty',
    concepts: ['repository', 'git-directory'],
    steps: [
      {
        id: 'init',
        goal: 'Turn this folder into a Git repository.',
        suggested: ['git init'],
        hints: ['The command is `git init`.'],
        check: c.isRepo(),
      },
      {
        id: 'status',
        goal: 'Now run `git status` and see it answer instead of refuse.',
        detail:
          'Same command, same folder, completely different response — because .git now exists. Notice it says "No commits yet".',
        suggested: ['git status'],
        hints: ['Run `git status`.'],
        check: c.ranCommand(/git status/),
      },
    ],
    outro: `You now have a repository with no history in it. The panel on the right shows
the three places your work can live. Right now all three are empty.`,
  },
  {
    id: 'telling-git-who-you-are',
    module: 'why',
    title: 'Telling Git who you are',
    idea: 'Your name and email are not an account — they are config keys stamped into each commit.',
    intro: `Every commit records an author: a name, an email and a timestamp. Git
does not verify any of it. It simply reads two configuration keys, \`user.name\`
and \`user.email\`, and writes them into the commit object.

That is why an unattended machine can produce commits "by" someone who never
touched it — and why the first thing you do on a new computer is set these.

This repository’s commits were all authored by the default identity. Change it,
then make one more commit and watch the author change.`,
    scenario: 'small-history',
    concepts: ['config', 'identity', 'commit-object'],
    steps: [
      {
        id: 'author',
        goal: 'Look at who authored the latest commit.',
        suggested: ['git log -n 1'],
        hints: ['`git log -n 1` shows the full commit including the author.'],
        check: c.ranCommand(/^git log -n 1/),
      },
      {
        id: 'name',
        goal: 'Set your name.',
        detail: 'This writes the key `user.name`. Try it, then read it back with a get.',
        suggested: ['git config user.name "Ada Lovelace"', 'git config user.name'],
        hints: ['`git config user.name "Ada Lovelace"`.'],
        check: c.configEquals('user.name', 'Ada Lovelace'),
      },
      {
        id: 'email',
        goal: 'Set your email.',
        suggested: ['git config user.email "ada@example.com"'],
        hints: ['`git config user.email "ada@example.com"`.'],
        check: c.configEquals('user.email', 'ada@example.com'),
      },
      {
        id: 'commit',
        goal: 'Make a commit and see the new author attached to it.',
        suggested: [
          'echo "a note" > notes.txt',
          'git add notes.txt',
          'git commit -m "Add notes"',
        ],
        hints: ['Create a file, add it, and commit as usual.'],
        check: c.authorOfHeadIs('Ada Lovelace'),
      },
    ],
    outro: `Nothing about the *content* of a commit changed — only the metadata Git
reads from config. That is the whole mechanism.`,
  },
];
