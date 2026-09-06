import type { Repository, Signature } from './types';

/** A virtual clock. Every object-creating command advances it by a fixed step,
 *  so a lesson scenario produces byte-identical object ids on every machine and
 *  a lesson can legitimately name a commit hash. */
export const CLOCK_STEP = 60;
export const CLOCK_START = 1735689600; // 2025-01-01T00:00:00Z

export function tick(repo: Repository): number {
  repo.clock += CLOCK_STEP;
  return repo.clock;
}

export function signature(repo: Repository): Signature {
  return {
    name: repo.config['user.name'],
    email: repo.config['user.email'],
    timestamp: tick(repo),
    tzOffset: '+0000',
  };
}

/** Formats like `git log`'s default: "Wed Jan 1 00:00:00 2025 +0000". */
export function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = (n: number) => String(n).padStart(2, '0');
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${d.getUTCDate()} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} ${d.getUTCFullYear()} +0000`;
}

/** "3 minutes ago" style, relative to the world's own clock. */
export function relativeDate(ts: number, now: number): string {
  const s = Math.max(0, now - ts);
  if (s < 60) return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
