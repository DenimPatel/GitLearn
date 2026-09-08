import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LESSONS, LESSONS_BY_ID, lessonIndex } from '../curriculum/lessons';
import { runScenario } from '../curriculum/runScenario';
import {
  loadProgress, saveProgress, type Progress,
} from '../curriculum/progress';
import type { CheckContext } from '../curriculum/types';
import type { CommandResult, World } from '../engine/types';

export interface LessonState {
  lesson: (typeof LESSONS)[number];
  stepIndex: number;
  completedSteps: string[];
  lessonComplete: boolean;
  hintLevel: number;
}

/**
 * Drives one lesson at a time: builds its world from a scenario (once, on
 * entry), checks each step against the world after every command, and records
 * progress. Steps never gate which commands may run — a step that has not been
 * satisfied simply stays open.
 */
export function useLesson(
  world: World,
  resetWorld: (w: World) => void,
) {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [lessonId, setLessonId] = useState<string>(
    () => loadProgress().currentLessonId ?? LESSONS[0].id,
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [hintLevel, setHintLevel] = useState(0);
  const historyRef = useRef<CommandResult[]>([]);
  const stepIndexRef = useRef(0);
  const stepStartWorld = useRef<World>(world);

  const lesson = LESSONS_BY_ID[lessonId] ?? LESSONS[0];

  const enterLesson = useCallback((id: string) => {
    const target = LESSONS_BY_ID[id];
    if (!target) return;
    // Deterministic and idempotent: always rebuilt from the scenario alone.
    const fresh = runScenario(target.scenario);
    stepStartWorld.current = fresh;
    historyRef.current = [];
    stepIndexRef.current = 0;
    resetWorld(fresh);
    setLessonId(id);
    setStepIndex(0);
    setCompletedSteps([]);
    setHintLevel(0);
    setProgress((p) => {
      const next: Progress = {
        ...p,
        currentLessonId: id,
        steps: { ...p.steps, [id]: p.steps[id] ?? [] },
      };
      saveProgress(next);
      return next;
    });
  }, [resetWorld]);

  // Build the first lesson's world on mount.
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    enterLesson(lessonId);
  }, [enterLesson, lessonId]);

  /**
   * Called after every command. Advances through however many steps the command
   * satisfied — a learner who runs three commands at once should not have to
   * run them again to tick three boxes.
   */
  const observe = useCallback((result: CommandResult) => {
    historyRef.current = [...historyRef.current, result];

    let index = stepIndexRef.current;
    const done: string[] = [];
    while (index < lesson.steps.length) {
      const step = lesson.steps[index];
      const ctx: CheckContext = {
        lastCommand: result.command,
        lastResult: result,
        history: historyRef.current,
        worldAtStepStart: stepStartWorld.current,
      };
      if (!step.check(result.world, ctx)) break;
      done.push(step.id);
      index++;
      stepStartWorld.current = result.world;
    }
    if (!done.length) return;

    stepIndexRef.current = index;
    setStepIndex(index);
    setCompletedSteps((cs) => [...new Set([...cs, ...done])]);
    setHintLevel(0);
    setProgress((p) => {
      const existing = p.steps[lesson.id] ?? [];
      const next: Progress = {
        ...p,
        steps: { ...p.steps, [lesson.id]: [...new Set([...existing, ...done])] },
        completedLessons: index >= lesson.steps.length
          ? [...new Set([...p.completedLessons, lesson.id])]
          : p.completedLessons,
      };
      saveProgress(next);
      return next;
    });
  }, [lesson]);

  const resetStep = useCallback(() => {
    resetWorld(stepStartWorld.current);
    historyRef.current = [];
  }, [resetWorld]);

  const resetLesson = useCallback(() => enterLesson(lesson.id), [enterLesson, lesson.id]);

  const index = lessonIndex(lesson.id);
  const next = LESSONS[index + 1] ?? null;
  const previous = LESSONS[index - 1] ?? null;

  const state: LessonState = useMemo(() => ({
    lesson,
    stepIndex,
    completedSteps,
    lessonComplete: stepIndex >= lesson.steps.length,
    hintLevel,
  }), [lesson, stepIndex, completedSteps, hintLevel]);

  return {
    ...state,
    progress,
    next,
    previous,
    enterLesson,
    observe,
    resetStep,
    resetLesson,
    showHint: () => setHintLevel((h) => Math.min(h + 1, lesson.steps[stepIndex]?.hints.length ?? 0)),
    dismissIntro: () => setProgress((p) => {
      if (p.seenIntro) return p;
      const nextP: Progress = { ...p, seenIntro: true };
      saveProgress(nextP);
      return nextP;
    }),
    recordPrediction: (correct: boolean) => setProgress((p) => {
      const nextP: Progress = {
        ...p,
        predictionsAnswered: { ...p.predictionsAnswered, [lesson.id]: correct },
      };
      saveProgress(nextP);
      return nextP;
    }),
  };
}
