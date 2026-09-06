import {
  branchRef, currentBranchName, headOid, isDetached, remoteRef, resolveRefToOid, tagRef,
} from '../engine/refs';
import { indexFlat, unmergedPaths } from '../engine/gitIndex';
import { status } from '../engine/status';
import { flatTreeOfCommit } from '../engine/trees';
import { walkHistory } from '../engine/refs';
import type { Check } from './types';

/** Declarative validators, so a lesson author states what should be true rather
 *  than writing an ad-hoc reducer. Checks read state, not command strings, so a
 *  learner who takes a different correct route still passes. */

export const isRepo = (): Check => (w) => w.local.initialized;

export const fileExists = (path: string): Check => (w) => w.local.worktree.files[path] !== undefined;

export const fileContains = (path: string, text: string): Check => (w) =>
  (w.local.worktree.files[path] ?? '').includes(text);

export const fileLacks = (path: string, text: string): Check => (w) =>
  w.local.worktree.files[path] !== undefined && !w.local.worktree.files[path].includes(text);

export const staged = (path: string): Check => (w) => indexFlat(w.local.index)[path] !== undefined;

export const stagedCount = (n: number): Check => (w) => status(w.local).staged.length === n;

export const isClean = (): Check => (w) => status(w.local).clean;

export const hasUntracked = (path: string): Check => (w) => status(w.local).untracked.includes(path);

export const commitCount = (n: number): Check => (w) => {
  const head = headOid(w.local);
  return head ? walkHistory(w.local, [head]).length === n : n === 0;
};

export const commitCountAtLeast = (n: number): Check => (w) => {
  const head = headOid(w.local);
  return head ? walkHistory(w.local, [head]).length >= n : n === 0;
};

export const branchExists = (name: string): Check => (w) =>
  resolveRefToOid(w.local, branchRef(name)) !== null;

export const branchMissing = (name: string): Check => (w) =>
  resolveRefToOid(w.local, branchRef(name)) === null;

export const onBranch = (name: string): Check => (w) => currentBranchName(w.local) === name;

export const detached = (): Check => (w) => isDetached(w.local);

export const tagExists = (name: string): Check => (w) =>
  resolveRefToOid(w.local, tagRef(name)) !== null;

export const branchesDiverged = (a: string, b: string): Check => (w) =>
  resolveRefToOid(w.local, branchRef(a)) !== resolveRefToOid(w.local, branchRef(b));

export const branchesEqual = (a: string, b: string): Check => (w) =>
  resolveRefToOid(w.local, branchRef(a)) === resolveRefToOid(w.local, branchRef(b));

/** True once the tip of `branch` is a merge commit. */
export const headIsMerge = (): Check => (w) => {
  const head = headOid(w.local);
  if (!head) return false;
  const c = w.local.objects[head];
  return c?.type === 'commit' && c.parents.length > 1;
};

export const conflicted = (): Check => (w) => unmergedPaths(w.local.index).length > 0;

export const conflictResolved = (): Check => (w) =>
  w.local.operation.kind === 'none' && unmergedPaths(w.local.index).length === 0;

export const stashCount = (n: number): Check => (w) => w.local.stash.length === n;

export const remoteExists = (name = 'origin'): Check => (w) => w.local.remotes[name] !== undefined;

export const pushed = (branch: string): Check => (w) =>
  !!w.origin && resolveRefToOid(w.origin, branchRef(branch)) === resolveRefToOid(w.local, branchRef(branch))
  && resolveRefToOid(w.local, branchRef(branch)) !== null;

export const trackingRefAt = (branch: string): Check => (w) =>
  !!w.origin &&
  resolveRefToOid(w.local, remoteRef('origin', branch)) === resolveRefToOid(w.origin, branchRef(branch));

/** The learner has fetched but has deliberately NOT moved their own branch. */
export const fetchedButNotMerged = (branch: string): Check => (w, ctx) =>
  trackingRefAt(branch)(w, ctx) &&
  resolveRefToOid(w.local, branchRef(branch)) !== resolveRefToOid(w.local, remoteRef('origin', branch));

export const upToDateWith = (branch: string): Check => (w) =>
  resolveRefToOid(w.local, branchRef(branch)) === resolveRefToOid(w.local, remoteRef('origin', branch));

export const behindBy = (n: number): Check => (w) => status(w.local).behind === n;

export const aheadBy = (n: number): Check => (w) => status(w.local).ahead === n;

export const prOpen = (): Check => (w) => w.hosting.pullRequests.some((p) => p.status === 'open');

export const prMerged = (): Check => (w) => w.hosting.pullRequests.some((p) => p.status === 'merged');

export const fileInHead = (path: string): Check => (w) =>
  flatTreeOfCommit(w.local, headOid(w.local))[path] !== undefined;

export const fileNotInHead = (path: string): Check => (w) =>
  flatTreeOfCommit(w.local, headOid(w.local))[path] === undefined;

/** Some lessons are about a command's *output*, not its effect — `git log` and
 *  `git status` change nothing, so the only honest check is that it was run. */
export const ranCommand = (re: RegExp): Check => (_w, ctx) =>
  ctx.history.some((h) => re.test(h.command) && h.exitCode === 0);

export const ranCommandFailing = (re: RegExp): Check => (_w, ctx) =>
  ctx.history.some((h) => re.test(h.command) && h.exitCode !== 0);

export const sawEvent = (type: string): Check => (_w, ctx) =>
  ctx.history.some((h) => h.events.some((e) => e.type === type));

export const mergedFastForward = (): Check => (_w, ctx) =>
  ctx.history.some((h) => h.events.some((e) => e.type === 'merged' && e.strategy === 'fast-forward'));

export const mergedThreeWay = (): Check => (_w, ctx) =>
  ctx.history.some((h) => h.events.some((e) => e.type === 'merged' && e.strategy === 'three-way'));

export const all = (...checks: Check[]): Check => (w, c) => checks.every((f) => f(w, c));
export const any = (...checks: Check[]): Check => (w, c) => checks.some((f) => f(w, c));
export const not = (check: Check): Check => (w, c) => !check(w, c);
