/** Splits a command line into argv, honouring single and double quotes and
 *  backslash escapes. Also reports shell redirection, which the tiny shell
 *  namespace needs for `echo hi > file.txt`. */

export interface Tokenized {
  argv: string[];
  redirect: { op: '>' | '>>'; path: string } | null;
}

export function tokenize(line: string): Tokenized {
  const argv: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let started = false;
  let redirect: Tokenized['redirect'] = null;
  let pendingRedirect: '>' | '>>' | null = null;

  const flush = () => {
    if (!started) return;
    if (pendingRedirect) { redirect = { op: pendingRedirect, path: cur }; pendingRedirect = null; }
    else argv.push(cur);
    cur = '';
    started = false;
  };

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < line.length) { cur += line[++i]; }
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; started = true; continue; }
    if (c === '\\' && i + 1 < line.length) { cur += line[++i]; started = true; continue; }
    if (c === ' ' || c === '\t') { flush(); continue; }
    if (c === '>') {
      flush();
      pendingRedirect = line[i + 1] === '>' ? (i++, '>>') : '>';
      continue;
    }
    cur += c;
    started = true;
  }
  flush();
  return { argv, redirect };
}
