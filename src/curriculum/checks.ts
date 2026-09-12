import {
  branchRef, currentBranchName, headOid, isDetached, remoteRef, resolveRefToOid, tagRef,
} from '../engine/refs';
import { indexFlat, unmergedPaths } from '../engine/gitIndex';
import { status } from '../engine/status';
import { flatTreeOfCommit } from '../engine/trees';
import { walkHistory } from '../engine/refs';
import { readCommit } from '../engine/objects';
import { isAncestor } from '../engine/merge/mergeBase';
import { commitRange } from '../engine/revparse';
import { unreachableCommits } from '../engine/commands/investigate';
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

// --- Configuration and identity ---

export const configEquals = (key: string, value: string): Check => (w) =>
  w.local.config[key] === value;

export const configSet = (key: string): Check => (w) => w.local.config[key] !== undefined;

// --- Working tree and clean ---

export const fileAbsent = (path: string): Check => (w) => w.local.worktree.files[path] === undefined;

export const untrackedCount = (n: number): Check => (w) => status(w.local).untracked.length === n;

export const noUntracked = (): Check => (w) => status(w.local).untracked.length === 0;

// --- Commit contents ---

export const headMessageMatches = (re: RegExp): Check => (w) => {
  const head = headOid(w.local);
  return head ? re.test(readCommit(w.local, head).message) : false;
};

export const headMessageHasBody = (): Check => (w) => {
  const head = headOid(w.local);
  if (!head) return false;
  const lines = readCommit(w.local, head).message.split('\n');
  return lines.length > 2 && lines[1].trim() === '' && lines.slice(2).join('').trim().length > 0;
};

export const authorOfHeadIs = (name: string): Check => (w) => {
  const head = headOid(w.local);
  return head ? readCommit(w.local, head).author.name === name : false;
};

export const noFixupCommits = (): Check => (w) => {
  const head = headOid(w.local);
  if (!head) return true;
  return !walkHistory(w.local, [head]).some((oid) =>
    /^(fixup|squash)!/.test(readCommit(w.local, oid).message));
};

/** True when history from `base` to HEAD is linear — no merge commits. */
export const linearSince = (base: string): Check => (w) => {
  const head = headOid(w.local);
  const baseOid = resolveRefToOid(w.local, branchRef(base));
  if (!head || !baseOid) return false;
  return commitRange(w.local, baseOid, head).every((oid) => readCommit(w.local, oid).parents.length <= 1);
};

// --- Tags and remotes ---

/** The tag exists and the commit it names is reachable from HEAD. */
export const tagReachable = (tag: string): Check => (w) => {
  const oid = resolveRefToOid(w.local, tagRef(tag));
  if (!oid) return false;
  const obj = w.local.objects[oid];
  const commit = obj && obj.type === 'tag' ? obj.object : oid;
  const head = headOid(w.local);
  return !!head && isAncestor(w.local, commit, head);
};

export const remoteBranchMissing = (name: string): Check => (w) =>
  !!w.origin && resolveRefToOid(w.origin, branchRef(name)) === null;

export const remoteBranchAt = (branch: string, ref: string): Check => (w) => {
  if (!w.origin) return false;
  const at = resolveRefToOid(w.local, branchRef(ref)) ?? resolveRefToOid(w.local, tagRef(ref));
  return at !== null && resolveRefToOid(w.origin, branchRef(branch)) === at;
};

export const forcePushed = (): Check => (_w, ctx) =>
  ctx.history.some((h) => h.events.some((e) => e.type === 'pushed' && e.forced));

export const prMergedSquash = (): Check => (w) =>
  w.hosting.pullRequests.some((p) => p.status === 'merged' && p.mergeStrategy === 'squash');

// --- Investigation ---

export const bisectStarted = (): Check => (w) =>
  w.local.bisect.origHead !== null && w.local.bisect.bad !== null;

export const bisectFound = (oid?: string): Check => (w) => {
  const b = w.local.bisect;
  if (b.origHead === null || b.bad === null || b.remaining.length > 0) return false;
  return oid ? b.bad === oid : true;
};

export const unreachableCount = (n: number): Check => (w) => unreachableCommits(w.local).length === n;

export const all = (...checks: Check[]): Check => (w, c) => checks.every((f) => f(w, c));
export const any = (...checks: Check[]): Check => (w, c) => checks.some((f) => f(w, c));
export const not = (check: Check): Check => (w, c) => !check(w, c);
