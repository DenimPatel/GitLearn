import { CLOCK_START } from './clock';
import { emptyIndex } from './gitIndex';
import { HEAD, branchRef } from './refs';
import type { Repository, World } from './types';

export const DEFAULT_BRANCH = 'main';

export function emptyRepo(opts: { bare?: boolean; initialized?: boolean } = {}): Repository {
  return {
    initialized: opts.initialized ?? false,
    bare: opts.bare ?? false,
    objects: {},
    refs: {},
    index: emptyIndex(),
    worktree: { files: {}, dirs: [] },
    reflogs: {},
    stash: [],
    operation: { kind: 'none' },
    config: {
      'user.name': 'You',
      'user.email': 'you@example.com',
      'init.defaultBranch': DEFAULT_BRANCH,
    },
    remotes: {},
    upstream: {},
    clock: CLOCK_START,
  };
}

/** `git init`: an unborn branch is a symbolic HEAD pointing at a ref that does
 *  not exist yet — exactly what real git leaves behind. */
export function initRepo(repo: Repository): void {
  repo.initialized = true;
  repo.refs[HEAD] = { kind: 'symbolic', target: branchRef(repo.config['init.defaultBranch']) };
}

export function emptyWorld(): World {
  return { local: emptyRepo(), origin: null, hosting: { pullRequests: [] }, history: [] };
}

export const serializeWorld = (w: World): string => JSON.stringify(w);

export function deserializeWorld(json: string): World | null {
  try {
    const w = JSON.parse(json) as World;
    if (!w || typeof w !== 'object' || !w.local) return null;
    return w;
  } catch {
    return null;
  }
}
