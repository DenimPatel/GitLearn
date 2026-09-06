/** A small .gitignore matcher: enough for build output, secrets and node_modules,
 *  which is all the curriculum needs. Supports *, ?, dir/, leading /, and ! negation. */

export function parseIgnore(content: string | undefined): string[] {
  if (!content) return [];
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

function patternToRegExp(pattern: string): RegExp {
  let p = pattern;
  const anchored = p.startsWith('/');
  if (anchored) p = p.slice(1);
  const dirOnly = p.endsWith('/');
  if (dirOnly) p = p.slice(0, -1);

  const body = p
    .split('')
    .map((c) => {
      if (c === '*') return '[^/]*';
      if (c === '?') return '[^/]';
      return /[.+^${}()|[\]\\]/.test(c) ? '\\' + c : c;
    })
    .join('');

  // Unanchored patterns match at any depth; a directory match covers everything under it.
  const prefix = anchored ? '^' : '^(?:.*/)?';
  return new RegExp(`${prefix}${body}(?:/.*)?$`);
}

export function isIgnored(path: string, patterns: string[]): boolean {
  let ignored = false;
  for (const raw of patterns) {
    const negate = raw.startsWith('!');
    const pattern = negate ? raw.slice(1) : raw;
    if (patternToRegExp(pattern).test(path)) ignored = !negate;
  }
  return ignored;
}
