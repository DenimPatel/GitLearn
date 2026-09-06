/** The concept inventory. This is the thing the learner finishes with: every
 *  idea in Git, named, grouped, and checkable — rather than a list of lessons. */

export type ModuleId =
  | 'why' | 'snapshots' | 'undo' | 'branching' | 'toolkit' | 'distributed' | 'github' | 'synthesis';

export interface BigIdea { id: string; title: string; blurb: string }

export const BIG_IDEAS: BigIdea[] = [
  {
    id: 'snapshot',
    title: 'A commit is an immutable snapshot, named by its own content',
    blurb: 'Not a diff, not a patch. Change one byte and you get a different commit with a different id.',
  },
  {
    id: 'three-trees',
    title: 'Three trees: working directory → index → HEAD',
    blurb: 'Every local command is a move between these three. Learn the trees and the commands stop needing memorising.',
  },
  {
    id: 'labels',
    title: 'A branch is a movable label on a commit; HEAD is a label on a label',
    blurb: 'History is a graph of commits. Branches are sticky notes on it, which is why making one is free.',
  },
  {
    id: 'nothing-lost',
    title: 'Nothing is deleted, only unreferenced',
    blurb: 'Rewriting history writes new commits and leaves the old ones behind. The reflog is how you get back.',
  },
  {
    id: 'distributed',
    title: 'Every clone is a complete repository; the remote is just another one',
    blurb: 'Syncing moves refs and copies objects between two full repos. Nothing is special about the server.',
  },
];

export interface Concept {
  id: string;
  label: string;
  blurb: string;
  module: ModuleId;
  bigIdea: string;
}

export const CONCEPTS: Concept[] = [
  // Why / repository
  { id: 'version-control', label: 'Version control', blurb: 'Why keeping history beats keeping copies.', module: 'why', bigIdea: 'snapshot' },
  { id: 'repository', label: 'Repository', blurb: 'A project plus the database of its history.', module: 'why', bigIdea: 'snapshot' },
  { id: 'git-directory', label: 'The .git directory', blurb: 'Where the entire history actually lives.', module: 'why', bigIdea: 'snapshot' },

  // Snapshots and the three trees
  { id: 'working-directory', label: 'Working directory', blurb: 'The files you can actually see and edit.', module: 'snapshots', bigIdea: 'three-trees' },
  { id: 'untracked', label: 'Untracked files', blurb: 'Git ignores what it has never been told about.', module: 'snapshots', bigIdea: 'three-trees' },
  { id: 'index', label: 'The index (staging area)', blurb: 'The draft of your next commit, composed deliberately.', module: 'snapshots', bigIdea: 'three-trees' },
  { id: 'staging', label: 'Staging changes', blurb: 'git add moves a snapshot of a file into the index.', module: 'snapshots', bigIdea: 'three-trees' },
  { id: 'three-trees', label: 'The three trees', blurb: 'Working directory, index, HEAD — the model behind every command.', module: 'snapshots', bigIdea: 'three-trees' },
  { id: 'commit-object', label: 'The commit object', blurb: 'A tree, parents, an author, and a message.', module: 'snapshots', bigIdea: 'snapshot' },
  { id: 'snapshot', label: 'Commits are snapshots', blurb: 'A commit stores the whole tree, not a diff.', module: 'snapshots', bigIdea: 'snapshot' },
  { id: 'hashing', label: 'Content addressing', blurb: 'The id is a hash of the content, which is why it cannot lie.', module: 'snapshots', bigIdea: 'snapshot' },
  { id: 'object-database', label: 'The object database', blurb: 'Blobs, trees and commits, all addressed by hash.', module: 'snapshots', bigIdea: 'snapshot' },
  { id: 'blob', label: 'Blobs', blurb: 'File contents, deduplicated: same bytes, same object.', module: 'snapshots', bigIdea: 'snapshot' },
  { id: 'tree', label: 'Trees', blurb: 'Directories: names pointing at blobs and other trees.', module: 'snapshots', bigIdea: 'snapshot' },
  { id: 'history', label: 'Reading history', blurb: 'git log walks backwards through parent links.', module: 'snapshots', bigIdea: 'labels' },
  { id: 'parent', label: 'Parent links', blurb: 'Each commit points at what came before it.', module: 'snapshots', bigIdea: 'labels' },
  { id: 'diff', label: 'Diffs', blurb: 'Computed on demand by comparing two trees.', module: 'snapshots', bigIdea: 'three-trees' },
  { id: 'gitignore', label: '.gitignore', blurb: 'Deliberately untracked: build output, secrets, dependencies.', module: 'snapshots', bigIdea: 'three-trees' },

  // Undo
  { id: 'undo', label: 'Undoing changes', blurb: 'Which of the three trees do you actually want to change?', module: 'undo', bigIdea: 'three-trees' },
  { id: 'reset-modes', label: 'reset --soft/--mixed/--hard', blurb: 'Move HEAD, then optionally drag the index and working tree along.', module: 'undo', bigIdea: 'three-trees' },
  { id: 'amend', label: 'Amending a commit', blurb: 'Replaces the tip commit with a new one; the old stays behind.', module: 'undo', bigIdea: 'nothing-lost' },
  { id: 'revert', label: 'Revert', blurb: 'Undo forwards, by adding a commit that reverses another.', module: 'undo', bigIdea: 'nothing-lost' },
  { id: 'shared-history', label: 'Safe vs unsafe undo', blurb: 'Rewriting published history breaks other people’s clones.', module: 'undo', bigIdea: 'nothing-lost' },
  { id: 'detached-head', label: 'Detached HEAD', blurb: 'You are on a commit, not a branch. Nothing is broken.', module: 'undo', bigIdea: 'labels' },
  { id: 'reflog', label: 'The reflog', blurb: 'Every place HEAD has been — the undo of last resort.', module: 'undo', bigIdea: 'nothing-lost' },
  { id: 'recovery', label: 'Recovering lost commits', blurb: 'A "lost" commit is only unreferenced, not gone.', module: 'undo', bigIdea: 'nothing-lost' },
  { id: 'nothing-is-lost', label: 'Nothing is truly lost', blurb: 'Commits survive until garbage collection, long after you need them.', module: 'undo', bigIdea: 'nothing-lost' },

  // Branching
  { id: 'branch', label: 'Branches', blurb: 'A movable pointer to a commit. Creating one is nearly free.', module: 'branching', bigIdea: 'labels' },
  { id: 'ref', label: 'Refs', blurb: 'Branches, tags and remote-tracking refs are all just names for commits.', module: 'branching', bigIdea: 'labels' },
  { id: 'dag', label: 'The commit graph', blurb: 'History is a directed acyclic graph, not a line.', module: 'branching', bigIdea: 'labels' },
  { id: 'branch-advance', label: 'How a branch moves', blurb: 'Committing moves the branch HEAD points at, and nothing else.', module: 'branching', bigIdea: 'labels' },
  { id: 'merge-base', label: 'The merge base', blurb: 'The commit two branches last had in common.', module: 'branching', bigIdea: 'labels' },
  { id: 'fast-forward', label: 'Fast-forward merge', blurb: 'No merge commit — the label just slides forward.', module: 'branching', bigIdea: 'labels' },
  { id: 'three-way-merge', label: 'Three-way merge', blurb: 'Base, ours, theirs — producing a commit with two parents.', module: 'branching', bigIdea: 'labels' },
  { id: 'merge', label: 'Merging', blurb: 'Joining two lines of history back together.', module: 'branching', bigIdea: 'labels' },
  { id: 'conflict-resolution', label: 'Merge conflicts', blurb: 'Both sides changed the same lines; you decide, then git add.', module: 'branching', bigIdea: 'labels' },
  { id: 'merge-stages', label: 'Conflict stages in the index', blurb: 'Base/ours/theirs held side by side until you resolve.', module: 'branching', bigIdea: 'three-trees' },
  { id: 'rebase', label: 'Rebase', blurb: 'Replay your commits onto a new base for a linear history.', module: 'branching', bigIdea: 'nothing-lost' },
  { id: 'rebase-rewrites-history', label: 'Rebase rewrites history', blurb: 'Same changes, new commits, new hashes.', module: 'branching', bigIdea: 'nothing-lost' },
  { id: 'linear-history', label: 'Merge vs rebase', blurb: 'Preserve what happened, or present a clean story.', module: 'branching', bigIdea: 'nothing-lost' },
  { id: 'cherry-pick', label: 'Cherry-pick', blurb: 'Copy one commit’s change somewhere else.', module: 'branching', bigIdea: 'nothing-lost' },

  // Toolkit
  { id: 'stash', label: 'Stashing', blurb: 'Park uncommitted work to switch context safely.', module: 'toolkit', bigIdea: 'three-trees' },
  { id: 'tag', label: 'Tags', blurb: 'A permanent name for a commit — usually a release.', module: 'toolkit', bigIdea: 'labels' },
  { id: 'annotated-tag', label: 'Annotated vs lightweight tags', blurb: 'One is a real object with a message; one is just a ref.', module: 'toolkit', bigIdea: 'labels' },
  { id: 'interactive-rebase', label: 'Interactive rebase', blurb: 'Squash, reword and drop commits before review.', module: 'toolkit', bigIdea: 'nothing-lost' },

  // Distributed
  { id: 'distributed', label: 'Distributed version control', blurb: 'Everyone has the full history; there is no privileged copy.', module: 'distributed', bigIdea: 'distributed' },
  { id: 'clone', label: 'Cloning', blurb: 'Copy an entire repository, history included.', module: 'distributed', bigIdea: 'distributed' },
  { id: 'remote', label: 'Remotes', blurb: '"origin" is a nickname for a URL. Nothing more.', module: 'distributed', bigIdea: 'distributed' },
  { id: 'remote-tracking-ref', label: 'Remote-tracking refs', blurb: 'origin/main is your cached memory of where the server was.', module: 'distributed', bigIdea: 'distributed' },
  { id: 'fetch', label: 'Fetch', blurb: 'Download their work without touching yours.', module: 'distributed', bigIdea: 'distributed' },
  { id: 'fetch-vs-pull', label: 'Fetch vs pull', blurb: 'Pull is fetch plus an integration step you should choose.', module: 'distributed', bigIdea: 'distributed' },
  { id: 'push', label: 'Push', blurb: 'Publish your commits to a remote branch.', module: 'distributed', bigIdea: 'distributed' },
  { id: 'upstream', label: 'Upstream branches', blurb: 'Which remote branch yours is paired with.', module: 'distributed', bigIdea: 'distributed' },
  { id: 'non-fast-forward', label: 'Rejected pushes', blurb: 'The remote has work you do not. Integrate before publishing.', module: 'distributed', bigIdea: 'distributed' },
  { id: 'pull', label: 'Pull', blurb: 'Fetch and then merge, or fetch and then rebase.', module: 'distributed', bigIdea: 'distributed' },

  // GitHub
  { id: 'github-flow', label: 'Feature-branch workflow', blurb: 'Branch, commit, push, review, merge, sync, delete.', module: 'github', bigIdea: 'distributed' },
  { id: 'pull-request', label: 'Pull requests', blurb: 'A request to merge a branch, with a place to discuss it.', module: 'github', bigIdea: 'distributed' },
  { id: 'code-review', label: 'Review and iteration', blurb: 'Push more commits to the same branch; the PR follows.', module: 'github', bigIdea: 'distributed' },
  { id: 'merge-strategies', label: 'Merge, squash or rebase merge', blurb: 'Three ways a PR can land, with different histories.', module: 'github', bigIdea: 'distributed' },
];

export const CONCEPTS_BY_ID: Record<string, Concept> =
  Object.fromEntries(CONCEPTS.map((c) => [c.id, c]));

export const MODULE_TITLES: Record<ModuleId, string> = {
  why: 'Why version control exists',
  snapshots: 'Snapshots and the three trees',
  undo: 'Undo, and why nothing is lost',
  branching: 'Branching and merging',
  toolkit: 'The working toolkit',
  distributed: 'Distributed Git',
  github: 'The GitHub workflow',
  synthesis: 'Putting it together',
};
