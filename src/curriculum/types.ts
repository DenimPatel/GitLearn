import type { World } from '../engine/types';
import type { CommandResult } from '../engine/types';
import type { ModuleId } from './concepts';

/** A scenario is a script, not a state literal: it cannot encode an impossible
 *  repository, it re-validates the engine every time it runs, and it doubles as
 *  documentation of the starting point. */
export interface ScenarioStep { target: 'local' | 'origin'; cmd: string }

export interface Scenario {
  id: string;
  /** Shown to the learner as "where you are starting from". */
  description: string;
  script: ScenarioStep[];
}

export interface CheckContext {
  lastCommand: string;
  lastResult: CommandResult | null;
  /** Commands run since this lesson was entered. */
  history: CommandResult[];
  worldAtStepStart: World;
}

export type Check = (world: World, ctx: CheckContext) => boolean;

export interface Pitfall {
  when: Check;
  message: string;
}

export interface LessonStep {
  id: string;
  goal: string;
  detail?: string;
  /** Chips offered as scaffolding. The first is the canonical answer, used by
   *  "Show me" and asserted by the curriculum test. */
  suggested: string[];
  hints: string[];
  check: Check;
  pitfalls?: Pitfall[];
}

/** An optional multiple-choice checkpoint, asked before a subtle command runs. */
export interface Prediction {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface Lesson {
  id: string;
  module: ModuleId;
  title: string;
  /** The one-sentence idea. Shown above everything else. */
  idea: string;
  intro: string;
  scenario: string;
  concepts: string[];
  steps: LessonStep[];
  prediction?: Prediction;
  outro?: string;
}
