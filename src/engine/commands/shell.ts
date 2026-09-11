import { register, type CommandSpec } from '../registry';
import { E } from '../errors';
import { flagValues } from '../parseArgs';
import { ignored } from '../worktree';
import type { Repository } from '../types';

/** A deliberately tiny shell. The curriculum has to create and edit files, and
 *  a terminal that only understands `git` would teach the wrong thing. */

/** True if `path` is a directory: either explicitly created by `mkdir` and
 *  still empty, or implied as a prefix of some file's (or other directory's)
 *  path — the same "directories are just path prefixes" model `mkdir` and
 *  `cd` already share. */
function isDirectory(repo: Repository, path: string): boolean {
  const clean = path.replace(/\/$/, '');
  if (repo.worktree.dirs.includes(clean)) return true;
  const prefix = clean + '/';
  return Object.keys(repo.worktree.files).some((p) => p.startsWith(prefix))
    || repo.worktree.dirs.some((d) => d.startsWith(prefix));
}

/** A file just appeared under one of `mkdir`'s tracked empty directories —
 *  drop those entries so they don't linger as phantom directories once
 *  something real exists there (e.g. so `rm -r` sees the file, not a stale
 *  empty-dir record). */
function pruneDirs(repo: Repository, path: string): void {
  if (!repo.worktree.dirs.length) return;
  const parts = path.split('/');
  parts.pop();
  let prefix = '';
  for (const part of parts) {
    prefix = prefix ? `${prefix}/${part}` : part;
    const i = repo.worktree.dirs.indexOf(prefix);
    if (i !== -1) repo.worktree.dirs.splice(i, 1);
  }
}

const touch: CommandSpec = {
  name: 'touch', namespace: 'shell', summary: 'Create an empty file',
  syntax: 'touch <file>...', flags: [], concepts: ['working-directory'],
  handler: ({ world, args, out }) => {
    if (!args.positionals.length) throw E.shell('touch: missing file operand');
    for (const p of args.positionals) {
      world.local.worktree.files[p] ??= '';
      pruneDirs(world.local, p);
      out.event({ type: 'file-written', path: p });
    }
  },
};

const echo: CommandSpec = {
  name: 'echo', namespace: 'shell', summary: 'Print text, or write it to a file with >',
  syntax: 'echo "text" > <file>', flags: [], concepts: ['working-directory'],
  handler: ({ world, args, out }) => {
    const text = args.positionals.join(' ');
    const redirect = flagValues(args, '__redirect');
    if (redirect.length === 2) {
      const [op, path] = redirect;
      const prev = op === '>>' ? world.local.worktree.files[path] ?? '' : '';
      world.local.worktree.files[path] = prev + text + '\n';
      pruneDirs(world.local, path);
      out.event({ type: 'file-written', path });
      return;
    }
    out.line(text);
  },
};

const cat: CommandSpec = {
  name: 'cat', namespace: 'shell', summary: 'Show a file’s contents',
  syntax: 'cat <file>', flags: [], concepts: ['working-directory'],
  handler: ({ world, args, out }) => {
    for (const p of args.positionals) {
      const content = world.local.worktree.files[p];
      if (content === undefined) throw E.shell(`cat: ${p}: No such file or directory`);
      out.line(...(content === '' ? [] : content.replace(/\n$/, '').split('\n')));
    }
  },
};

const ls: CommandSpec = {
  name: 'ls', namespace: 'shell', summary: 'List files in the working directory',
  syntax: 'ls [-a]', flags: [{ long: 'all', short: 'a', arg: 'none' }],
  concepts: ['working-directory'],
  handler: ({ world, args, out }) => {
    const all = args.flags.all !== undefined;
    const repo = world.local;
    const files = Object.keys(repo.worktree.files).filter((p) => all || !ignored(repo, p));
    // A directory `mkdir` created is only worth showing while nothing inside it exists yet.
    const emptyDirs = repo.worktree.dirs.filter((d) => !files.some((f) => f.startsWith(d + '/')));
    const entries = [...files, ...emptyDirs.map((d) => `${d}/`)].sort();
    if (entries.length) out.line(entries.join('  '));
  },
};

const rm: CommandSpec = {
  name: 'rm', namespace: 'shell', summary: 'Delete a file from the working directory',
  syntax: 'rm <file>', flags: [{ long: 'recursive', short: 'r', arg: 'none' },
                                { long: 'force', short: 'f', arg: 'none' }],
  concepts: ['working-directory'],
  handler: ({ world, args, out }) => {
    if (!args.positionals.length) throw E.shell('rm: missing operand');
    const repo = world.local;
    for (const p of args.positionals) {
      if (repo.worktree.files[p] !== undefined) {
        delete repo.worktree.files[p];
        out.event({ type: 'file-written', path: p });
        continue;
      }
      const dirIndex = repo.worktree.dirs.indexOf(p.replace(/\/$/, ''));
      if (dirIndex !== -1) {
        if (args.flags.recursive === undefined) throw E.shell(`rm: cannot remove '${p}': Is a directory`);
        repo.worktree.dirs.splice(dirIndex, 1);
        continue;
      }
      if (args.flags.force === undefined) throw E.shell(`rm: cannot remove '${p}': No such file or directory`);
    }
  },
};

const mkdir: CommandSpec = {
  name: 'mkdir', namespace: 'shell', summary: 'Create an empty directory',
  syntax: 'mkdir <dir>', flags: [{ long: 'parents', short: 'p', arg: 'none' }],
  concepts: ['working-directory'],
  // Directories exist only as path prefixes here, but an empty one still has
  // to be remembered — otherwise `cd` right after `mkdir` would say it's missing.
  handler: ({ world, args }) => {
    if (!args.positionals.length) throw E.shell('mkdir: missing operand');
    const repo = world.local;
    for (const raw of args.positionals) {
      const p = raw.replace(/\/$/, '');
      if (repo.worktree.files[p] !== undefined) throw E.shell(`mkdir: cannot create directory '${raw}': File exists`);
      if (!isDirectory(repo, p)) repo.worktree.dirs.push(p);
    }
  },
};

const pwd: CommandSpec = {
  name: 'pwd', namespace: 'shell', summary: 'Print the working directory',
  syntax: 'pwd', flags: [], concepts: ['working-directory'],
  handler: ({ out }) => { out.line('/project'); },
};

const cd: CommandSpec = {
  name: 'cd', namespace: 'shell',
  summary: 'Change directory (there is only one working directory here)',
  syntax: 'cd [dir]', flags: [], concepts: ['working-directory'],
  // Directories are just path prefixes, so this can only ever check that one exists.
  handler: ({ world, args }) => {
    const target = args.positionals[0];
    if (!target || target === '~' || target === '.' || target === '..' || target === '/project') return;
    const repo = world.local;
    if (repo.worktree.files[target] !== undefined) throw E.shell(`cd: ${target}: Not a directory`);
    if (!isDirectory(repo, target)) throw E.shell(`cd: ${target}: No such file or directory`);
  },
};

const cp: CommandSpec = {
  name: 'cp', namespace: 'shell', summary: 'Copy a file',
  syntax: 'cp <src> <dest>', flags: [], concepts: ['working-directory'],
  handler: ({ world, args, out }) => {
    const [src, dest] = args.positionals;
    if (!src || !dest) throw E.shell('cp: missing file operand');
    const content = world.local.worktree.files[src];
    if (content === undefined) throw E.shell(`cp: cannot stat '${src}': No such file or directory`);
    world.local.worktree.files[dest] = content;
    pruneDirs(world.local, dest);
    out.event({ type: 'file-written', path: dest });
  },
};

const mv: CommandSpec = {
  name: 'mv', namespace: 'shell', summary: 'Move or rename a file',
  syntax: 'mv <src> <dest>', flags: [], concepts: ['working-directory'],
  handler: ({ world, args, out }) => {
    const [src, dest] = args.positionals;
    if (!src || !dest) throw E.shell('mv: missing file operand');
    const content = world.local.worktree.files[src];
    if (content === undefined) throw E.shell(`mv: cannot stat '${src}': No such file or directory`);
    delete world.local.worktree.files[src];
    world.local.worktree.files[dest] = content;
    pruneDirs(world.local, dest);
    out.event({ type: 'file-written', path: src });
    out.event({ type: 'file-written', path: dest });
  },
};

const less: CommandSpec = {
  name: 'less', namespace: 'shell', summary: 'Page through a file’s contents (shown all at once here)',
  syntax: 'less <file>', flags: [], concepts: ['working-directory'],
  handler: ({ world, args, out }) => {
    const p = args.positionals[0];
    if (!p) throw E.shell('less: missing file operand');
    const content = world.local.worktree.files[p];
    if (content === undefined) throw E.shell(`${p}: No such file or directory`);
    out.line(...(content === '' ? [] : content.replace(/\n$/, '').split('\n')));
  },
};

const grep: CommandSpec = {
  name: 'grep', namespace: 'shell', summary: 'Search files for lines matching a pattern',
  syntax: 'grep [-inr] <pattern> <file>...',
  flags: [
    { long: 'ignore-case', short: 'i', arg: 'none' },
    { long: 'line-number', short: 'n', arg: 'none' },
    { long: 'recursive', short: 'r', arg: 'none' },
  ],
  concepts: ['working-directory'],
  handler: ({ world, args, out }) => {
    const [pattern, ...targets] = args.positionals;
    if (!pattern || !targets.length) throw E.shell('usage: grep [-inr] <pattern> <file>...');
    const files = world.local.worktree.files;
    const recursive = args.flags.recursive !== undefined;
    let paths: string[];
    if (recursive) {
      const prefixes = targets.map((t) => t.replace(/\/$/, '') + '/');
      paths = Object.keys(files).filter((p) => prefixes.some((pre) => p.startsWith(pre))).sort();
    } else {
      for (const t of targets) {
        if (files[t] === undefined) throw E.shell(`grep: ${t}: No such file or directory`);
      }
      paths = targets;
    }

    const ignoreCase = args.flags['ignore-case'] !== undefined ? 'i' : '';
    let re: RegExp;
    try { re = new RegExp(pattern, ignoreCase); }
    catch { re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ignoreCase); }

    const showPath = paths.length > 1 || recursive;
    const showLine = args.flags['line-number'] !== undefined;
    for (const p of paths) {
      const lines = (files[p] ?? '').replace(/\n$/, '').split('\n');
      lines.forEach((line, i) => {
        if (!re.test(line)) return;
        out.line(`${showPath ? `${p}:` : ''}${showLine ? `${i + 1}:` : ''}${line}`);
      });
    }
  },
};

const history: CommandSpec = {
  name: 'history', namespace: 'shell', summary: 'List recently executed commands',
  syntax: 'history', flags: [{ long: 'clear', short: 'c', arg: 'none' }],
  concepts: ['working-directory'],
  handler: ({ world, args, out }) => {
    if (args.flags.clear !== undefined) { world.history.length = 0; return; }
    world.history.forEach((cmd, i) => out.line(`${i + 1}  ${cmd}`));
  },
};

// `clear`/`reset` are handled by the terminal itself, before the engine ever sees them.

register(touch, echo, cat, ls, rm, mkdir, pwd, cd, cp, mv, less, grep, history);
