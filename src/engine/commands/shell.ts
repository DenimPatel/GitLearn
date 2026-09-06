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

// `clear` is handled by the terminal itself, before the engine ever sees it.

register(touch, echo, cat, ls, rm, mkdir);
