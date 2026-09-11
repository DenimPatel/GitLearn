import { useCallback, useMemo, useRef, useState } from 'react';
import { execute } from '../engine/execute';
import { emptyWorld } from '../engine/world';
import { headLabel, currentBranchName } from '../engine/refs';
import type { CommandResult, World } from '../engine/types';

export interface TerminalEntry {
  id: number;
  prompt: string;
  command: string;
  stdout: string[];
  stderr: string[];
  exitCode: number;
}

/**
 * The single write path into the engine. Every command in the app goes through
 * `run`, so the terminal, the visualiser and the lesson checks can never see
 * different worlds.
 *
 * The current world is mirrored in a ref so a command always builds on the very
 * latest state, even when two arrive before React has re-rendered.
 */
export function useEngine(initial: World = emptyWorld()) {
  const [world, setWorld] = useState<World>(initial);
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const [lastResult, setLastResult] = useState<CommandResult | null>(null);
  const worldRef = useRef(initial);
  const nextId = useRef(0);

  const promptFor = (w: World) =>
    w.local.initialized ? `~/project (${headLabel(w.local)}) $` : '~/project $';

  const prompt = useMemo(() => promptFor(world), [world]);

  const run = useCallback((command: string): CommandResult | null => {
    const trimmed = command.trim();
    if (!trimmed) return null;

    if (trimmed === 'clear' || trimmed === 'reset') {
      setEntries([]);
      return null;
    }

    const before = worldRef.current;
    const result = execute(before, trimmed);
    worldRef.current = result.world;

    setWorld(result.world);
    setEntries((prev) => [
      ...prev,
      {
        id: nextId.current++,
        prompt: promptFor(before),
        command: trimmed,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      },
    ]);
    setLastResult(result);
    return result;
  }, []);

  const reset = useCallback((next: World) => {
    worldRef.current = next;
    setWorld(next);
    setEntries([]);
    setLastResult(null);
  }, []);

  return {
    world,
    entries,
    lastResult,
    prompt,
    branch: currentBranchName(world.local),
    run,
    reset,
  };
}
