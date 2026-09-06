import type { FlagSpec, ParsedArgs } from './parseArgs';
import type { EngineEvent, Repository, World } from './types';
import { E } from './errors';

export interface OutputSink {
  line: (...s: string[]) => void;
  err: (...s: string[]) => void;
  event: (e: EngineEvent) => void;
  /** Fail without discarding the draft. A merge conflict is the motivating case:
   *  it exits 1, but the half-merged index and marked-up files must survive. */
  exit: (code: number) => void;
}

export interface CommandContext {
  /** An immer draft. Handlers mutate it freely; a thrown GitError discards it. */
  world: World;
  args: ParsedArgs;
  out: OutputSink;
}

export interface CommandSpec {
  name: string;
  summary: string;
  /** Shown in the command palette and in `git help`. */
  syntax: string;
  flags: FlagSpec[];
  handler: (ctx: CommandContext) => void;
  /** Curriculum concepts this command exercises; feeds mastery tracking. */
  concepts: string[];
  /** Shell builtins live in the same registry so the terminal isn't a lie. */
  namespace?: 'git' | 'shell';
}

const registry = new Map<string, CommandSpec>();

export function register(...specs: CommandSpec[]): void {
  for (const s of specs) registry.set(`${s.namespace ?? 'git'}:${s.name}`, s);
}

export function lookup(namespace: 'git' | 'shell', name: string): CommandSpec | undefined {
  return registry.get(`${namespace}:${name}`);
}

export function allCommands(namespace?: 'git' | 'shell'): CommandSpec[] {
  return [...registry.values()]
    .filter((s) => !namespace || (s.namespace ?? 'git') === namespace)
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** Every handler starts here: no command except `init` and the shell works
 *  outside a repository, which is a lesson in itself. */
export function requireRepo(world: World): Repository {
  if (!world.local.initialized) throw E.notARepo();
  return world.local;
}
