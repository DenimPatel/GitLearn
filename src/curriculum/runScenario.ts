import { execute } from '../engine/execute';
import { emptyWorld } from '../engine/world';
import { SCENARIOS_BY_ID } from './scenarios';
import type { World } from '../engine/types';

/**
 * Builds a lesson's starting world. Deterministic and idempotent: it always
 * runs from an empty world and only ever runs the one scenario named, so
 * jumping between lessons in any order gives the same result every time.
 */
export function runScenario(id: string): World {
  const scenario = SCENARIOS_BY_ID[id];
  if (!scenario) throw new Error(`unknown scenario: ${id}`);

  let world = emptyWorld();
  for (const step of scenario.script) {
    if (step.target === 'origin') {
      // Run against the remote to fabricate a teammate's history.
      if (!world.origin) throw new Error(`scenario ${id}: no origin yet for "${step.cmd}"`);
      const swapped: World = { local: world.origin, origin: world.local, hosting: world.hosting, history: world.history };
      const r = execute(swapped, step.cmd);
      if (r.exitCode !== 0) throw new Error(`scenario ${id} failed at "${step.cmd}": ${r.stderr.join(' ')}`);
      world = { local: r.world.origin!, origin: r.world.local, hosting: r.world.hosting, history: r.world.history };
      continue;
    }
    const r = execute(world, step.cmd);
    if (r.exitCode !== 0) {
      throw new Error(`scenario ${id} failed at "${step.cmd}": ${r.stderr.join(' ')}`);
    }
    world = r.world;
  }
  return world;
}
