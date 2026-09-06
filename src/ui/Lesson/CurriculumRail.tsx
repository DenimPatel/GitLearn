import { CheckIcon } from '../primitives';
import { MODULES } from '../../curriculum/lessons';
import { MODULE_TITLES } from '../../curriculum/concepts';
import { progressSummary, type Progress } from '../../curriculum/progress';

export function CurriculumRail({ progress, currentId, onSelect, onOpenConceptMap }: {
  progress: Progress;
  currentId: string;
  onSelect: (id: string) => void;
  onOpenConceptMap: () => void;
}) {
  const summary = progressSummary(progress);
  let counter = 0;

  return (
    <nav className="flex h-full min-h-0 flex-col" aria-label="Curriculum">
      <div className="shrink-0 border-b border-border px-3 py-3">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-[0.09em] text-fg-muted">Progress</span>
          <span className="font-mono text-[11px] text-fg-subtle">
            {summary.lessonsDone}/{summary.lessonsTotal}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-surface-raised">
          <div className="h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: `${summary.percent}%` }} />
        </div>
        <button type="button" onClick={onOpenConceptMap}
          className="mt-2 w-full rounded-md border border-border bg-surface-raised px-2 py-1 text-left text-[11px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg">
          Concept map
          <span className="float-right font-mono text-fg-subtle">
            {summary.conceptsPracticed}/{summary.conceptsTotal}
          </span>
        </button>
      </div>

      <div className="gl-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {MODULES.map((group) => (
          <div key={group.module} className="mb-3 last:mb-0">
            <h2 className="mb-1 px-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
              {MODULE_TITLES[group.module]}
            </h2>
            <ul>
              {group.lessons.map((lesson) => {
                counter++;
                const done = progress.completedLessons.includes(lesson.id);
                const active = lesson.id === currentId;
                const started = (progress.steps[lesson.id]?.length ?? 0) > 0;
                return (
                  <li key={lesson.id}>
                    <button type="button" onClick={() => onSelect(lesson.id)}
                      className={`flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left text-[12px] leading-snug transition-colors ${
                        active ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:bg-surface-hover hover:text-fg'}`}>
                      <span className={`mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border font-mono text-[9px] ${
                        done ? 'border-success bg-success/20 text-success'
                          : started ? 'border-warning/60 text-warning'
                          : active ? 'border-accent text-accent'
                          : 'border-border text-fg-subtle'}`}>
                        {done ? <CheckIcon /> : counter}
                      </span>
                      <span className="min-w-0 flex-1">{lesson.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
