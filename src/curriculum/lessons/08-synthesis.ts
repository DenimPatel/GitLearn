import type { Lesson } from '../types';
import * as c from '../checks';

export const SYNTHESIS_LESSONS: Lesson[] = [
  {
    id: 'boss-level',
    module: 'synthesis',
    title: 'Boss level: the messy Monday morning',
    idea: 'Everything at once — and no hints telling you which command to reach for.',
    intro: `Here is a situation you will genuinely hit.

You have a commit on main that isn't pushed. A teammate has pushed a *different*
commit to main, touching the same file you did. And you have half-finished work
in your working tree that isn't ready to commit at all.

You need to end up with: their work and yours both on origin/main, your
unfinished work still in your tree, and no lost commits.

**No suggested commands this time.** Work it out. The panel on the right and
\`git status\` are all you should need. Reset the level freely — nothing here can
actually be broken.

One route, if you want a shape to aim at: park the unfinished work, integrate
their commit, resolve the collision, publish, and take your work back.`,
    scenario: 'boss-level',
    concepts: [
      'stash', 'fetch-vs-pull', 'conflict-resolution', 'non-fast-forward', 'push', 'three-trees',
    ],
    steps: [
      {
        id: 'park',
        goal: 'Get your working tree clean without losing the unfinished work in notes.md.',
        suggested: ['git stash'],
        hints: [
          'You cannot merge with a dirty tree. Where can uncommitted work go temporarily?',
          'This is what `git stash` is for.',
        ],
        check: c.all(c.isClean(), c.stashCount(1)),
      },
      {
        id: 'integrate',
        goal: 'Get your teammate’s commit and combine it with yours, resolving any collision.',
        detail:
          'You both edited config.txt. Expect a conflict, and settle it however you like.',
        suggested: [
          'git pull',
          'echo "colour = purple" > config.txt',
          'git add config.txt',
          'git commit -m "Merge, settling on purple"',
        ],
        hints: [
          'Start by getting their work: `git pull`.',
          'On conflict: edit the file, `git add` it, then `git commit`.',
        ],
        check: c.all(c.conflictResolved(), c.commitCountAtLeast(4)),
      },
      {
        id: 'publish',
        goal: 'Publish the combined history.',
        suggested: ['git push'],
        hints: ['`git push` — it should be accepted now that you have their commit.'],
        check: c.pushed('main'),
      },
      {
        id: 'resume',
        goal: 'Get your unfinished work back.',
        suggested: ['git stash pop'],
        hints: ['`git stash pop`'],
        check: c.all(c.fileContains('notes.md', 'half-finished'), c.stashCount(0)),
      },
    ],
    outro:
      'That is a genuinely realistic morning, handled with commands you now know. Everything left is detail.',
  },
];
