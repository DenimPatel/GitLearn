import { CONCEPTS } from './concepts';
import { LESSONS, LESSONS_BY_ID } from './lessons';

const KEY = 'gitlearn.progress.v1';

export interface Progress {
  version: 1;
  /** lessonId -> completed step ids */
  steps: Record<string, string[]>;
  completedLessons: string[];
  currentLessonId: string | null;
  hintsUsed: Record<string, number>;
  predictionsAnswered: Record<string, boolean>;
  /** Whether the welcome screen has been shown. First visit only. */
  seenIntro: boolean;
}

export const emptyProgress = (): Progress => ({
  version: 1,
  steps: {},
  completedLessons: [],
  currentLessonId: null,
  hintsUsed: {},
  predictionsAnswered: {},
  seenIntro: false,
});

/** Never let stale or corrupt storage break the app: any failure falls back to
 *  a fresh record rather than throwing on startup. */
function migrate(raw: unknown): Progress {
  if (!raw || typeof raw !== 'object') return emptyProgress();
  const p = raw as Partial<Progress>;
  if (p.version !== 1) return emptyProgress();
  return {
    ...emptyProgress(),
    ...p,
    steps: p.steps ?? {},
    completedLessons: p.completedLessons ?? [],
    hintsUsed: p.hintsUsed ?? {},
    predictionsAnswered: p.predictionsAnswered ?? {},
    // Anyone with a lesson already in progress has been here before: never
    // interrupt a returning learner with the intro.
    seenIntro: p.seenIntro ?? p.currentLessonId !== null,
  };
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
export function saveProgress(p: Progress): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      // Private browsing, or storage disabled. Progress is a convenience, not state we depend on.
    }
  }, 300);
}

export type ConceptState = 'unseen' | 'encountered' | 'practiced';

/**
 * Mastery is derived, never stored: a concept is "encountered" once a lesson
 * that teaches it has been opened, and "practiced" once a step in that lesson
 * has actually been completed. That is what makes the concept map a record of
 * what you have done rather than what you have read.
 */
export function conceptStates(p: Progress): Record<string, ConceptState> {
  const out: Record<string, ConceptState> = {};
  for (const concept of CONCEPTS) out[concept.id] = 'unseen';

  for (const [lessonId, doneSteps] of Object.entries(p.steps)) {
    const lesson = LESSONS_BY_ID[lessonId];
    if (!lesson) continue;
    for (const id of lesson.concepts) {
      if (doneSteps.length > 0) out[id] = 'practiced';
      else if (out[id] === 'unseen') out[id] = 'encountered';
    }
  }
  for (const lessonId of p.completedLessons) {
    const lesson = LESSONS_BY_ID[lessonId];
    if (!lesson) continue;
    for (const id of lesson.concepts) out[id] = 'practiced';
  }
  return out;
}

export function progressSummary(p: Progress) {
  const states = conceptStates(p);
  const practiced = Object.values(states).filter((s) => s === 'practiced').length;
  return {
    lessonsDone: p.completedLessons.length,
    lessonsTotal: LESSONS.length,
    conceptsPracticed: practiced,
    conceptsTotal: CONCEPTS.length,
    percent: Math.round((p.completedLessons.length / LESSONS.length) * 100),
  };
}

export const isLessonComplete = (p: Progress, id: string): boolean =>
  p.completedLessons.includes(id);

export const stepDone = (p: Progress, lessonId: string, stepId: string): boolean =>
  (p.steps[lessonId] ?? []).includes(stepId);
