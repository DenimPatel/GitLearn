import type { Scenario } from '../types';

const local = (...cmds: string[]) => cmds.map((cmd) => ({ target: 'local' as const, cmd }));

/**
 * Named, shared starting points. A lesson runs exactly one of these, once, from
 * an empty world — so jumping between lessons in any order is idempotent, and
 * the graph always matches what the lesson text describes.
 */
export const SCENARIOS: Scenario[] = [
  {
    id: 'empty',
    description: 'An empty folder. Nothing here is a repository yet.',
    script: [],
  },
  {
    id: 'fresh-repo',
    description: 'An initialised repository with no commits yet.',
    script: local('git init'),
  },
  {
    id: 'one-commit',
    description: 'A repository with a single commit containing README.md.',
    script: local(
      'git init',
      'echo "# My Project" > README.md',
      'git add README.md',
      'git commit -m "Initial commit"',
    ),
  },
  {
    id: 'small-history',
    description: 'Three commits on main, each building on the last.',
    script: local(
      'git init',
      'echo "# My Project" > README.md',
      'git add README.md',
      'git commit -m "Initial commit"',
      'echo "console.log(1)" > app.js',
      'git add app.js',
      'git commit -m "Add app.js"',
      'echo "console.log(2)" > app.js',
      'git commit -am "Update app.js"',
    ),
  },
  {
    id: 'dirty-history',
    description: 'Three commits, plus an edit you have not committed yet.',
    script: local(
      'git init',
      'echo "# My Project" > README.md',
      'git add README.md',
      'git commit -m "Initial commit"',
      'echo "console.log(1)" > app.js',
      'git add app.js',
      'git commit -m "Add app.js"',
      'echo "console.log(2)" > app.js',
      'git commit -am "Update app.js"',
      'echo "console.log(3) // work in progress" > app.js',
    ),
  },
  {
    id: 'two-branches',
    description: 'main and a feature branch, both pointing at the same commit.',
    script: local(
      'git init',
      'echo "# My Project" > README.md',
      'git add README.md',
      'git commit -m "Initial commit"',
      'echo "console.log(1)" > app.js',
      'git add app.js',
      'git commit -m "Add app.js"',
      'git branch feature',
    ),
  },
  {
    id: 'diverged-branches',
    description: 'main and feature have each moved on since they split.',
    script: local(
      'git init',
      'echo "# My Project" > README.md',
      'git add README.md',
      'git commit -m "Initial commit"',
      'git switch -c feature',
      'echo "the feature" > feature.txt',
      'git add feature.txt',
      'git commit -m "Add the feature"',
      'git switch main',
      'echo "docs" > docs.md',
      'git add docs.md',
      'git commit -m "Add docs"',
    ),
  },
  {
    id: 'conflicting-branches',
    description: 'main and feature have both edited the same line of config.txt.',
    script: local(
      'git init',
      'echo "colour = blue" > config.txt',
      'git add config.txt',
      'git commit -m "Add config"',
      'git switch -c feature',
      'echo "colour = green" > config.txt',
      'git commit -am "Use green"',
      'git switch main',
      'echo "colour = red" > config.txt',
      'git commit -am "Use red"',
    ),
  },
  {
    id: 'published',
    description: 'A repository with a remote called origin, already in sync.',
    script: local(
      'git init',
      'echo "# My Project" > README.md',
      'git add README.md',
      'git commit -m "Initial commit"',
      'git remote add origin https://github.com/you/project.git',
      'git push -u origin main',
    ),
  },
  {
    id: 'remote-ahead',
    description: 'A teammate has pushed to origin/main since you last looked.',
    script: local(
      'git init',
      'echo "# My Project" > README.md',
      'git add README.md',
      'git commit -m "Initial commit"',
      'git remote add origin https://github.com/you/project.git',
      'git push -u origin main',
      'teammate push main CHANGELOG.md "First release" "Add a changelog"',
    ),
  },
  {
    id: 'diverged-from-remote',
    description: 'You have a local commit, and a teammate has pushed a different one.',
    script: local(
      'git init',
      'echo "# My Project" > README.md',
      'git add README.md',
      'git commit -m "Initial commit"',
      'git remote add origin https://github.com/you/project.git',
      'git push -u origin main',
      'teammate push main CHANGELOG.md "First release" "Add a changelog"',
      'echo "console.log(1)" > app.js',
      'git add app.js',
      'git commit -m "Add app.js"',
    ),
  },
  {
    id: 'feature-pushed',
    description: 'A feature branch with one commit, already pushed to origin.',
    script: local(
      'git init',
      'echo "# My Project" > README.md',
      'git add README.md',
      'git commit -m "Initial commit"',
      'git remote add origin https://github.com/you/project.git',
      'git push -u origin main',
      'git switch -c add-login',
      'echo "login()" > login.js',
      'git add login.js',
      'git commit -m "Add login"',
      'git push -u origin add-login',
    ),
  },
  {
    id: 'boss-level',
    description:
      'A teammate pushed to main, you have a local commit, and uncommitted work in the tree.',
    script: local(
      'git init',
      'echo "colour = blue" > config.txt',
      'echo "project notes" > notes.md',
      'git add .',
      'git commit -m "Add config and notes"',
      'git remote add origin https://github.com/you/project.git',
      'git push -u origin main',
      'teammate push main config.txt "colour = red" "Switch to red"',
      'echo "console.log(1)" > app.js',
      'git add app.js',
      'git commit -m "Add app.js"',
      'echo "project notes\n\nhalf-finished thought" > notes.md',
    ),
  },
];

export const SCENARIOS_BY_ID: Record<string, Scenario> =
  Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
