import { describe, expect, it } from 'vitest';
import { LESSONS, MODULES } from '../lessons';
import { SCENARIOS } from '../scenarios';
import { runScenario } from '../runScenario';
import { execute } from '../../engine/execute';
import { CONCEPTS_BY_ID } from '../concepts';
import type { CheckContext } from '../types';
import type { CommandResult, World } from '../../engine/types';

describe('scenarios', () => {
  for (const scenario of SCENARIOS) {
    it(`"${scenario.id}" builds without error`, () => {
      expect(runScenario(scenario.id).local).toBeDefined();
    });
  }

  it('are deterministic', () => {
    for (const s of SCENARIOS) {
      expect(JSON.stringify(runScenario(s.id))).toBe(JSON.stringify(runScenario(s.id)));
    }
  });
});

describe('lessons', () => {
  it('have unique ids and valid scenarios', () => {
    const ids = LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of LESSONS) {
      expect(() => runScenario(l.scenario), `${l.id} scenario`).not.toThrow();
    }
  });

  it('reference only concepts that exist in the inventory', () => {
    for (const l of LESSONS) {
      for (const id of l.concepts) {
        expect(CONCEPTS_BY_ID[id], `lesson "${l.id}" references unknown concept "${id}"`).toBeDefined();
      }
    }
  });

  it('have predictions whose answer index is in range', () => {
    for (const l of LESSONS) {
      if (!l.prediction) continue;
      expect(l.prediction.answerIndex).toBeGreaterThanOrEqual(0);
      expect(l.prediction.answerIndex).toBeLessThan(l.prediction.options.length);
    }
  });

  /**
   * The most valuable test in the suite. For every lesson: build its scenario,
   * run each step's own suggested commands in order, and assert the step's check
   * then passes. It proves the curriculum and the engine agree, so the engine can
   * be refactored with confidence — and it forces every `suggested` list to be a
   * genuinely correct answer rather than an approximate one.
   */
  for (const lesson of LESSONS) {
    it(`"${lesson.title}" is completable by its own suggested commands`, () => {
      let world: World = runScenario(lesson.scenario);
      const history: CommandResult[] = [];

      for (const step of lesson.steps) {
        const worldAtStepStart = world;
        for (const cmd of step.suggested) {
          const result = execute(world, cmd);
          history.push(result);
          world = result.world;
        }
        const ctx: CheckContext = {
          lastCommand: step.suggested[step.suggested.length - 1] ?? '',
          lastResult: history[history.length - 1] ?? null,
          history,
          worldAtStepStart,
        };
        expect(
          step.check(world, ctx),
          `lesson "${lesson.id}" step "${step.id}" did not pass after running:\n` +
            step.suggested.map((s) => `  $ ${s}`).join('\n') +
            '\nlast stderr: ' + (history[history.length - 1]?.stderr.join(' ') ?? '(none)'),
        ).toBe(true);
      }
    });
  }
});

describe('curriculum shape', () => {
  it('covers every concept in the inventory with at least one lesson', () => {
    const covered = new Set(LESSONS.flatMap((l) => l.concepts));
    const uncovered = Object.keys(CONCEPTS_BY_ID).filter((id) => !covered.has(id));
    expect(uncovered, `concepts with no lesson: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('groups into modules in order', () => {
    expect(MODULES.map((m) => m.module)).toEqual([
      'why', 'snapshots', 'undo', 'branching', 'toolkit', 'investigating', 'distributed',
      'github', 'teamwork', 'scale', 'modern', 'synthesis',
    ]);
  });
});
