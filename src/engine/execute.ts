import { produce, setAutoFreeze } from 'immer';
import { GitError, E } from './errors';
import { lookup } from './registry';
import { parseArgs } from './parseArgs';
import { tokenize } from './tokenize';
import type { CommandResult, EngineEvent, World } from './types';
import './commands';

// Worlds are snapshotted and compared; freezing them keeps that honest.
setAutoFreeze(true);

/**
 * The single entry point into the engine.
 *
 * A handler mutates an immer draft and may throw a GitError at any point. When
 * it does, the draft is discarded entirely and the original world is returned,
 * so every command is atomic even if it fails halfway through.
 */
export function execute(world: World, command: string): CommandResult {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const events: EngineEvent[] = [];
  let exitCode = 0;

  const trimmed = command.trim();
  if (!trimmed) return { world, command, stdout, stderr, exitCode, events };

  const { argv, redirect } = tokenize(trimmed);
  const out = {
    line: (...s: string[]) => stdout.push(...s),
    err: (...s: string[]) => stderr.push(...s),
    event: (e: EngineEvent) => events.push(e),
    exit: (code: number) => { exitCode = code; },
  };

  try {
    const isGit = argv[0] === 'git';
    const namespace = isGit ? 'git' : 'shell';
    const name = isGit ? argv[1] : argv[0];
    if (isGit && !name) {
      throw new GitError(['usage: git <command> [<args>]', "See 'git help' for a list of commands."], 1, [], 'usage');
    }

    const spec = lookup(namespace, name ?? '');
    if (!spec) {
      throw isGit ? E.unknownCommand(name!) : E.shell(`${name}: command not found`);
    }

    const rest = isGit ? argv.slice(2) : argv.slice(1);
    const args = parseArgs(spec.name, rest, spec.flags, trimmed);
    if (redirect) args.flags['__redirect'] = [redirect.op, redirect.path];

    const next = produce(world, (draft) => {
      const w = draft as World;
      // Keep the two repositories on one shared clock so commit times are
      // comparable across them, whichever side created them.
      if (w.origin) {
        const now = Math.max(w.local.clock, w.origin.clock);
        w.local.clock = now;
        w.origin.clock = now;
      }
      spec.handler({ world: w, args, out });
      if (w.origin) {
        const now = Math.max(w.local.clock, w.origin.clock);
        w.local.clock = now;
        w.origin.clock = now;
      }
      w.history.push(trimmed);
    });
    return { world: next, command, stdout, stderr, exitCode, events };
  } catch (err) {
    if (err instanceof GitError) {
      return {
        world,
        command,
        stdout,
        stderr: [...err.lines, ...err.hint],
        exitCode: err.exitCode,
        events: [],
      };
    }
    // A genuine bug in the engine. Surface it rather than pretending it was git.
    return {
      world,
      command,
      stdout,
      stderr: [`internal error: ${(err as Error).message}`],
      exitCode: 1,
      events: [],
    };
  }
}

/** Runs a script, throwing if any command fails. Used by scenarios and tests. */
export function runScript(world: World, commands: string[]): World {
  let w = world;
  for (const c of commands) {
    const r = execute(w, c);
    if (r.exitCode !== 0) {
      throw new Error(`script step failed: ${c}\n${r.stderr.join('\n')}`);
    }
    w = r.world;
  }
  return w;
}
