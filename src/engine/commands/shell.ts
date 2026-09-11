import { register, type CommandSpec } from '../registry';
import { E } from '../errors';
import { flagValues } from '../parseArgs';
import { ignored } from '../worktree';

/** A deliberately tiny shell. The curriculum has to create and edit files, and
 *  a terminal that only understands `git` would teach the wrong thing. */

const touch: CommandSpec = {
  name: 'touch', namespace: 'shell', summary: 'Create an empty file',
  syntax: 'touch <file>...', flags: [], concepts: ['working-directory'],
  handler: ({ world, args, out }) => {
    if (!args.positionals.length) throw E.shell('touch: missing file operand');
    for (const p of args.positionals) {
      world.local.worktree.files[p] ??= '';
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
    const files = Object.keys(world.local.worktree.files)
      .filter((p) => all || !ignored(world.local, p))
      .sort();
    if (files.length) out.line(files.join('  '));
  },
};

const rm: CommandSpec = {
  name: 'rm', namespace: 'shell', summary: 'Delete a file from the working directory',
  syntax: 'rm <file>', flags: [{ long: 'recursive', short: 'r', arg: 'none' },
                                { long: 'force', short: 'f', arg: 'none' }],
  concepts: ['working-directory'],
  handler: ({ world, args, out }) => {
    if (!args.positionals.length) throw E.shell('rm: missing operand');
    for (const p of args.positionals) {
      if (world.local.worktree.files[p] === undefined) {
        if (args.flags.force === undefined) throw E.shell(`rm: cannot remove '${p}': No such file or directory`);
        continue;
      }
      delete world.local.worktree.files[p];
      out.event({ type: 'file-written', path: p });
    }
  },
};

const mkdir: CommandSpec = {
  name: 'mkdir', namespace: 'shell', summary: 'Create a directory (implicit — paths just nest)',
  syntax: 'mkdir <dir>', flags: [{ long: 'parents', short: 'p', arg: 'none' }],
  concepts: ['working-directory'],
  // Directories exist only as path prefixes here, so this is a friendly no-op.
  handler: () => {},
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
    const files = world.local.worktree.files;
    if (files[target] !== undefined) throw E.shell(`cd: ${target}: Not a directory`);
    const prefix = target.replace(/\/$/, '') + '/';
    if (!Object.keys(files).some((p) => p.startsWith(prefix))) {
      throw E.shell(`cd: ${target}: No such file or directory`);
    }
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
