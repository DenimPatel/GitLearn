import type { Lesson } from '../types';
import * as c from '../checks';

export const INVESTIGATING_LESSONS: Lesson[] = [
  {
    id: 'reading-log',
    module: 'investigating',
    title: 'Reading git log properly',
    idea: '`git log` is a graph viewer once you give it flags — not a scroll of text.',
    intro: `The default \`git log\` is noisy. The flags are where the model becomes
visible: \`--oneline\` collapses each commit to one line, \`--graph\` draws the
branching, and \`--all\` shows every branch instead of just the one you are on.

This repository has two branches that have diverged: \`main\` added docs, and
\`feature\` added the feature. You are on \`main\`.`,
    scenario: 'diverged-branches',
    concepts: ['log-reading', 'history', 'dag'],
    steps: [
      {
        id: 'oneline',
        goal: 'Show the history in one line per commit.',
        suggested: ['git log --oneline'],
        hints: ['Add `--oneline`.'],
        check: c.ranCommand(/^git log --oneline/),
      },
      {
        id: 'all',
        goal: 'See both branches at once, as a graph.',
        detail: 'Without `--all` you only see commits reachable from HEAD.',
        suggested: ['git log --oneline --graph --all'],
        hints: ['`--graph` draws the lines; `--all` includes every branch.'],
        check: c.ranCommand(/--graph.*--all|--all.*--graph/),
      },
      {
        id: 'range',
        goal: 'Ask only what feature has that main does not.',
        detail: '`main..feature` means "reachable from feature but not from main".',
        suggested: ['git log --oneline main..feature'],
        hints: ['The range notation is `base..tip`.'],
        check: c.ranCommand(/^git log --oneline main\.\.feature/),
      },
      {
        id: 'stat',
        goal: 'See which files each of the last two commits touched.',
        suggested: ['git log -n 2 --stat'],
        hints: ['`-n 2` limits the count; `--stat` adds the file summary.'],
        check: c.ranCommand(/^git log -n 2 --stat/),
      },
      {
        id: 'show',
        goal: 'Inspect one commit in full.',
        detail: '`HEAD~1` walks one parent back from where you are.',
        suggested: ['git show HEAD~1'],
        hints: ['`git show` prints the commit and the patch it introduced.'],
        check: c.ranCommand(/^git show HEAD~1/),
      },
    ],
    outro: 'History is a graph, and these flags are how you make it legible.',
  },
  {
    id: 'reviewing-a-branch',
    module: 'investigating',
    title: 'Reviewing a branch before you merge it',
    idea: 'Read what a branch actually contains before it lands on main.',
    intro: `A reviewer's first job is not to run the tests — it is to answer two
questions: *what changed on this branch*, and *what does the tree look like*.

The range \`main..feature\` answers the first. \`git ls-tree -r HEAD\` answers the
second by listing every blob the commit's tree contains, which is exactly what
git would check out.`,
    scenario: 'diverged-branches',
    concepts: ['code-archaeology', 'log-reading', 'tree'],
    steps: [
      {
        id: 'what',
        goal: 'List just the commits this branch adds.',
        suggested: ['git log --oneline main..feature'],
        hints: ['Compare the branch against main with the `..` range.'],
        check: c.ranCommand(/main\.\.feature/),
      },
      {
        id: 'switch',
        goal: 'Check the branch out so you can inspect it directly.',
        suggested: ['git switch feature'],
        hints: ['`git switch feature`.'],
        check: c.onBranch('feature'),
      },
      {
        id: 'show',
        goal: 'Read the tip commit and its patch.',
        suggested: ['git show HEAD'],
        hints: ['`git show HEAD`.'],
        check: c.ranCommand(/^git show HEAD/),
      },
      {
        id: 'tree',
        goal: 'List every file in the branch’s snapshot.',
        detail: 'This is the whole tree of the commit, not a diff.',
        suggested: ['git ls-tree -r HEAD'],
        hints: ['`-r` recurses into subdirectories.'],
        check: c.ranCommand(/^git ls-tree -r HEAD/),
      },
    ],
    outro: 'A branch is a label on a commit; inspecting it is inspecting that snapshot.',
  },
  {
    id: 'blame-and-pickaxe',
    module: 'investigating',
    title: 'Who wrote this line, and why',
    idea: '`blame` answers "who", the pickaxe answers "when did this string appear".',
    intro: `\`git blame\` attributes every line of a file to the commit that last
changed it. It is not about fault — it is about *context*: the commit id it
prints is a door into the reasoning behind the line.

The pickaxe (\`git log -S\`) is the other direction: given a string, find the
commits whose change added or removed it. Together they turn "what is this
code?" into "where did it come from?".`,
    scenario: 'blame-history',
    concepts: ['code-archaeology', 'log-reading', 'diff'],
    steps: [
      {
        id: 'blame',
        goal: 'Attribute each line of story.txt to a commit.',
        suggested: ['git blame story.txt'],
        hints: ['`git blame <file>`.'],
        check: c.ranCommand(/^git blame story\.txt/),
      },
      {
        id: 'pickaxe',
        goal: 'Find the commit that introduced Sam’s line.',
        detail: 'The pickaxe searches commit *diffs*, not the current file.',
        suggested: ['git log -S "by Sam" --oneline'],
        hints: ['Use `git log -S "<string>"`.'],
        check: c.ranCommand(/git log -S/),
      },
      {
        id: 'author',
        goal: 'List only the commits Sam authored.',
        suggested: ['git log --author=Sam --oneline'],
        hints: ['`--author` matches the name or email.'],
        check: c.ranCommand(/--author/),
      },
    ],
    outro: 'Every line has a commit; every commit has a reason. These commands find it.',
  },
  {
    id: 'describe-and-shortlog',
    module: 'investigating',
    title: 'Which release is this commit in?',
    idea: '`describe` names a commit relative to the nearest tag; `shortlog` counts by author.',
    intro: `Telling someone "it's fixed in \`v1.0-2-g1a2b3c4\`" is far more useful
than reciting a raw hash. \`git describe\` finds the closest reachable tag and
counts how many commits past it you are.

\`git shortlog -sn\` is the other summary tool: who has been committing, and how
much. It is how you write a release note.`,
    scenario: 'release-tagged',
    concepts: ['code-archaeology', 'annotated-tag', 'history'],
    steps: [
      {
        id: 'describe',
        goal: 'Name HEAD relative to the nearest tag.',
        suggested: ['git describe'],
        hints: ['`git describe` uses annotated tags by default.'],
        check: c.ranCommand(/^git describe/),
      },
      {
        id: 'since',
        goal: 'List the commits that landed since v1.0.',
        suggested: ['git log --oneline v1.0..HEAD'],
        hints: ['The range is `v1.0..HEAD`.'],
        check: c.ranCommand(/v1\.0\.\.HEAD/),
      },
      {
        id: 'shortlog',
        goal: 'Summarise the history by author.',
        detail: '`-s` is summary, `-n` sorts by count.',
        suggested: ['git shortlog -sn'],
        hints: ['`git shortlog -sn`.'],
        check: c.ranCommand(/^git shortlog -sn/),
      },
      {
        id: 'tags',
        goal: 'List the tags you have.',
        suggested: ['git tag -l'],
        hints: ['`git tag -l` lists tags.'],
        check: c.ranCommand(/^git tag -l/),
      },
    ],
    outro: 'Tags turn raw hashes into a language humans can use.',
  },
  {
    id: 'finding-with-bisect',
    module: 'investigating',
    title: 'Finding the commit that broke it',
    idea: 'Bisect binary-searches history: O(log n) tests instead of reading every commit.',
    intro: `Eight commits ago the app worked. Now it does not. Reading every diff
would take seven guesses; \`git bisect\` needs about three.

You tell git a *known good* commit and a *known bad* one, and it checks out the
midpoint. You test it, mark it good or bad, and it halves the range again.
Here, "testing" is simply \`cat app.txt\` — a good commit says \`OK\`, the bad one
says \`BROKEN\`, and once broken it stays broken.`,
    scenario: 'bisect-bug',
    concepts: ['code-archaeology', 'dag', 'recovery'],
    steps: [
      {
        id: 'start',
        goal: 'Start bisect, mark HEAD bad, and the very first commit good.',
        detail: '`HEAD~7` is the root commit here — seven parents back from the tip.',
        suggested: ['git bisect start', 'git bisect bad', 'git bisect good HEAD~7'],
        hints: [
          '`git bisect start`, then `git bisect bad` (HEAD is broken).',
          'Mark the root as good: `git bisect good HEAD~7`.',
        ],
        check: c.bisectStarted(),
      },
      {
        id: 'first-test',
        goal: 'Test the midpoint git checked out and mark it bad.',
        detail: 'The working tree has moved to the midpoint commit, so `cat` shows you that version.',
        suggested: ['cat app.txt', 'git bisect bad'],
        hints: ['`cat app.txt`, then `git bisect bad` if it says BROKEN.'],
        check: c.fileContains('app.txt', 'OK'),
      },
      {
        id: 'second-test',
        goal: 'Test the next midpoint and mark it good.',
        suggested: ['cat app.txt', 'git bisect good'],
        hints: ['`cat app.txt`, then `git bisect good` if it says OK.'],
        check: c.fileContains('app.txt', 'OK'),
      },
      {
        id: 'found',
        goal: 'Give the final answer and let bisect name the culprit.',
        suggested: ['cat app.txt', 'git bisect good'],
        hints: ['One more `git bisect good` — bisect will announce the first bad commit.'],
        check: c.bisectFound(),
      },
      {
        id: 'reset',
        goal: 'Return to your branch and normal working tree.',
        suggested: ['git bisect reset'],
        hints: ['`git bisect reset`.'],
        check: c.all(c.onBranch('main'), c.isClean()),
      },
    ],
    outro: 'Bisect is just binary search — and it is the fastest way to a bug’s origin.',
  },
];
