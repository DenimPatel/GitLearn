# GitLearn

An interactive Git tutorial. You type real Git commands into a faithful
simulator, and watch what they do to the object database, the three trees, the
commit graph and the remote — all on screen at once.

**Live: https://denimpatel.github.io/GitLearn/**

## What it teaches

71 lessons across 12 modules, sequenced by mental model rather than by command.
Each command is introduced as the answer to a question you already feel, and the
whole curriculum is organised around five ideas:

1. A commit is an immutable snapshot, named by its own content.
2. Three trees: working directory → index → HEAD.
3. A branch is a movable label on a commit; HEAD is a label on a label.
4. Nothing is deleted, only unreferenced.
5. Every clone is a complete repository; the remote is just another one.

It runs from "why does version control exist" through staging, hashing,
diffing, the undo family (restore, reset's three modes, revert, detached HEAD,
reflog recovery, and `git clean` for what was never tracked), branching, real
merge conflicts, rebase and cherry-pick, `commit --fixup` with
`rebase --autosquash`, stash and tags, configuration and aliases, remotes,
fetch-vs-pull, rejected pushes and `--force-with-lease`, and the GitHub
pull-request workflow with all three landing strategies.

Then it goes further: **investigating history** (`blame`, the pickaxe,
`describe`, `shortlog`, `fsck` and a real `bisect`), **teamwork** (commit-message
craft, branch hygiene, forks), **scale and hygiene** (secrets in history, line
endings, and field guides to worktrees, sparse-checkout and partial clones), and
**modern Git** (`switch`/`restore` over `checkout`, `init.defaultBranch`, Git 3.0
defaults, config-based hooks and commit signing) — ending in a concept map of
everything covered, ticked off as you actually practise it rather than merely
read it.

## What makes the simulator honest

The engine models Git properly rather than approximating it:

- **Real objects.** Blobs, trees, commits and tags, hashed with SHA-1 over
  Git's own serialization format — so `git hash-object` here gives the same id
  as `git hash-object` on your machine, and identical content really is one
  object.
- **HEAD is a ref**, in the same store as every other ref, so detached HEAD is
  reachable and an unborn branch is a symbolic ref to a branch that doesn't
  exist yet.
- **The index has merge stages.** A conflict is stages 1/2/3 with no stage 0,
  markers in the working tree, `git add` as the resolution, and `git commit`
  refusing until it's resolved.
- **The remote is a second repository.** `fetch` writes only
  `refs/remotes/*`, `push` rejects non-fast-forwards, and `pull` on diverged
  history merges rather than discarding your work.
- **One three-way merge primitive** backs merge, rebase, cherry-pick, revert
  and stash pop, with a shared sequencer for conflict → resolve → continue.
- **Deterministic.** A virtual clock and fixed author mean every scenario
  produces the same object ids every time.

Switching branches genuinely rewrites your working directory. Fast-forward and
three-way merges are distinguished. Nothing is faked.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173/GitLearn/
npm test         # 202 engine + curriculum tests
npm run build    # type-check and build to dist/
```

## Layout

```
src/
  engine/      the Git simulator — pure TypeScript, no React, no dependency but immer
    commands/  one file per command family, plus a small shell and plumbing commands
    diff/      LCS line diff, unified diff, three-way merge with conflict markers
    merge/     merge bases, tree-level three-way merge, the apply primitive
  curriculum/  concepts, scenarios, validators, and the lessons themselves
  state/       the single write path into the engine
  ui/          terminal, graph, panels, lesson views
  design/      colour and motion tokens
```

Nothing under `engine/` imports React, which is what keeps the test suite fast
and the simulator independently verifiable.

## Contributing

- **Lessons** live in `src/curriculum/lessons/`. Add one and the test suite will
  replay its own suggested commands and assert its checks pass — so a lesson
  whose text and behaviour disagree fails CI.
- **Starting states** are scripts in `src/curriculum/scenarios/`, run through the
  same engine the learner drives.
- **Commands** are registered in `src/engine/commands/`; each declares its flags,
  its summary and the concepts it exercises.

Non-goals, deliberately: packfiles and compression, real networking, submodules
and Git LFS (separate object stores), sparse-checkout and partial-clone
transfers, hook execution, and the cryptography of commit signing. Where a
feature is real but not simulated, it is taught as an honest field guide with
the commands you would run on a real checkout — see the `scale` and `modern`
modules, which end with an explicit list of what this engine does and does not
model. `git: '<x>' is not a git command` is a fine answer.
