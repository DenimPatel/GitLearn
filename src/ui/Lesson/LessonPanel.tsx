import { Button, CheckIcon } from '../primitives';
import { Markdown } from './Markdown';
import { HintBlock, Prediction } from './Prediction';
import { toneFor, TONE_CLASS } from '../../design/tokens';
import { MODULE_TITLES } from '../../curriculum/concepts';
import type { Lesson } from '../../curriculum/types';

interface Props {
  lesson: Lesson;
  stepIndex: number;
  completedSteps: string[];
  lessonComplete: boolean;
  hintLevel: number;
  lessonNumber: number;
  lessonTotal: number;
  onShowHint: () => void;
  onFillCommand: (command: string) => void;
  onResetStep: () => void;
  onResetLesson: () => void;
  onNext: () => void;
  hasNext: boolean;
  onPrediction: (correct: boolean) => void;
}

export function LessonPanel(props: Props) {
  const {
    lesson, stepIndex, completedSteps, lessonComplete, hintLevel,
    lessonNumber, lessonTotal, onShowHint, onFillCommand, onResetStep,
    onResetLesson, onNext, hasNext, onPrediction,
  } = props;

  const current = lesson.steps[stepIndex];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border px-4 py-3">
        <p className="mb-1 text-[10px] uppercase tracking-[0.09em] text-fg-subtle">
          {MODULE_TITLES[lesson.module]} · {lessonNumber} of {lessonTotal}
        </p>
        <h1 className="text-[16px] font-semibold leading-snug text-fg">{lesson.title}</h1>
        <p className="mt-1 text-[12.5px] leading-snug text-accent">{lesson.idea}</p>
      </header>

      <div className="gl-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3.5">
        <Markdown source={lesson.intro} />

        {lesson.prediction && <Prediction data={lesson.prediction} onAnswer={onPrediction} />}

        <div>
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-fg-muted">
            Steps
          </h2>
          <ol className="space-y-1.5">
            {lesson.steps.map((step, i) => {
              const done = completedSteps.includes(step.id);
              const active = i === stepIndex && !lessonComplete;
              return (
                <li key={step.id}
                  className={`rounded-lg border px-2.5 py-2 transition-colors ${
                    active ? 'border-accent/50 bg-accent/[0.07]'
                      : done ? 'border-border bg-surface-raised/60'
                      : 'border-border/60 bg-transparent opacity-55'}`}>
                  <div className="flex items-start gap-2">
                    <span className={`mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] ${
                      done ? 'border-success bg-success/20 text-success'
                        : active ? 'border-accent text-accent' : 'border-border text-fg-subtle'}`}>
                      {done ? <CheckIcon /> : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[12.5px] leading-snug ${done ? 'text-fg-subtle line-through' : 'text-fg'}`}>
                        {step.goal}
                      </p>
                      {active && step.detail && (
                        <p className="mt-1 text-[11.5px] leading-relaxed text-fg-muted">{step.detail}</p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {current && (
          <div className="space-y-2.5">
            <div>
              <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-fg-muted">
                Commands you might need
              </h2>
              <p className="mb-2 text-[11px] leading-snug text-fg-subtle">
                Clicking one fills the terminal — you still press Enter.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {current.suggested.map((cmd) => (
                  <button key={cmd} type="button" onClick={() => onFillCommand(cmd)}
                    className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${TONE_CLASS[toneFor(cmd)]}`}
                    title="Put this in the terminal">
                    {cmd}
                  </button>
                ))}
              </div>
            </div>
            <HintBlock hints={current.hints} level={hintLevel} onMore={onShowHint} />
          </div>
        )}

        {lessonComplete && (
          <div className="gl-enter rounded-lg border border-success/40 bg-success/[0.08] p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-success">
              <CheckIcon /> Lesson complete
            </p>
            {lesson.outro && <p className="text-[12.5px] leading-relaxed text-fg-muted">{lesson.outro}</p>}
            <p className="mt-2 text-[11.5px] text-fg-subtle">
              Keep experimenting here as long as you like — nothing can break.
            </p>
          </div>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2.5">
        <Button size="sm" variant="subtle" onClick={onResetStep} title="Undo back to the start of this step">
          Reset step
        </Button>
        <Button size="sm" variant="subtle" onClick={onResetLesson} title="Rebuild this lesson from scratch">
          Reset lesson
        </Button>
        <Button size="sm" variant={lessonComplete ? 'primary' : 'ghost'} onClick={onNext}
          disabled={!hasNext} className="ml-auto">
          Next lesson →
        </Button>
      </footer>
    </div>
  );
}
