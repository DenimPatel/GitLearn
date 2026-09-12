import { register, type CommandSpec } from '../registry';
import { E } from '../errors';
import type { Config } from '../types';

/**
 * `git config` — the cheapest high-value command in Git: it needs no new world
 * state, because `Repository.config` already backs the author signature and the
 * default branch that `git init` creates.
 *
 * Scopes are deliberately collapsed into one store. Real git keeps system,
 * global, local and worktree files separate; pretending to here would be less
 * honest than saying plainly that this simulator keeps a single configuration.
 */
const config: CommandSpec = {
  name: 'config', summary: 'Read and write Git’s key-value configuration',
  syntax: 'git config <key> [<value>]  |  git config --list',
  flags: [
    { long: 'global', arg: 'none' },
    { long: 'local', arg: 'none' },
    { long: 'system', arg: 'none' },
    { long: 'get', arg: 'none' },
    { long: 'get-all', arg: 'none' },
    { long: 'unset', arg: 'none' },
    { long: 'list', short: 'l', arg: 'none' },
  ],
  concepts: ['config', 'identity'],
  handler: ({ world, args, out }) => {
    // Unlike every other git command, config works outside a repository: a
    // global name must be settable before the first `git init`. All scopes share
    // the one store the engine has, and the lesson says so plainly.
    const repo = world.local;
    const [key, ...rest] = args.positionals;

    if (args.flags.list !== undefined) {
      for (const [k, v] of Object.entries(repo.config)) out.line(`${k}=${v}`);
      return;
    }

    if (args.flags.unset !== undefined) {
      if (!key) throw E.shell('usage: git config --unset <key>');
      if (!(key in repo.config)) { out.exit(1); return; }
      delete repo.config[key as keyof Config];
      return;
    }

    if (args.flags.get !== undefined || args.flags['get-all'] !== undefined) {
      if (!key) throw E.shell('usage: git config --get <key>');
      const value = repo.config[key];
      if (value === undefined) { out.exit(1); return; }
      out.line(value);
      return;
    }

    // One positional is a read; two is a write. This is exactly how git decides.
    if (key && rest.length === 0) {
      const value = repo.config[key];
      if (value === undefined) { out.exit(1); return; }
      out.line(value);
      return;
    }

    if (!key || rest.length === 0) {
      throw E.shell('usage: git config <key> [<value>]');
    }

    repo.config[key] = rest.join(' ');
    // `init.defaultBranch` is read by initRepo, so it only affects the *next*
    // repository — never the branch you are already on.
  },
};

register(config);
