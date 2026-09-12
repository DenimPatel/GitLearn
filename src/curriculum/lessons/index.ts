import type { Lesson } from '../types';
import type { ModuleId } from '../concepts';
import { WHY_LESSONS } from './01-why';
import { SNAPSHOT_LESSONS } from './02-snapshots';
import { UNDO_LESSONS } from './03-undo';
import { BRANCHING_LESSONS } from './04-branching';
import { TOOLKIT_LESSONS } from './05-toolkit';
import { INVESTIGATING_LESSONS } from './09-investigating';
import { DISTRIBUTED_LESSONS } from './06-distributed';
import { GITHUB_LESSONS } from './07-github';
import { TEAMWORK_LESSONS } from './10-teamwork';
import { SCALE_LESSONS } from './11-scale';
import { MODERN_LESSONS } from './12-modern';
import { SYNTHESIS_LESSONS } from './13-synthesis';

export const LESSONS: Lesson[] = [
  ...WHY_LESSONS,
  ...SNAPSHOT_LESSONS,
  ...UNDO_LESSONS,
  ...BRANCHING_LESSONS,
  ...TOOLKIT_LESSONS,
  ...INVESTIGATING_LESSONS,
  ...DISTRIBUTED_LESSONS,
  ...GITHUB_LESSONS,
  ...TEAMWORK_LESSONS,
  ...SCALE_LESSONS,
  ...MODERN_LESSONS,
  ...SYNTHESIS_LESSONS,
];

export const LESSONS_BY_ID: Record<string, Lesson> =
  Object.fromEntries(LESSONS.map((l) => [l.id, l]));

export const lessonIndex = (id: string): number => LESSONS.findIndex((l) => l.id === id);

export interface ModuleGroup { module: ModuleId; lessons: Lesson[] }

export const MODULES: ModuleGroup[] = LESSONS.reduce<ModuleGroup[]>((acc, lesson) => {
  const last = acc[acc.length - 1];
  if (last && last.module === lesson.module) last.lessons.push(lesson);
  else acc.push({ module: lesson.module, lessons: [lesson] });
  return acc;
}, []);
