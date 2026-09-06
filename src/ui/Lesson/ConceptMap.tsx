import { Button, CheckIcon } from '../primitives';
import { BIG_IDEAS, CONCEPTS, MODULE_TITLES, type ModuleId } from '../../curriculum/concepts';
import { LESSONS } from '../../curriculum/lessons';
import { conceptStates, progressSummary, type Progress } from '../../curriculum/progress';

/**
 * The thing the learner finishes with: every concept in Git, grouped by the big
 * idea it belongs to, marked with whether they have merely read about it or
 * actually done it. It answers "what do I know?" — which a list of completed
 * lesson numbers never does.
 */
export function ConceptMap({ progress, onClose, onGoToLesson }: {
  progress: Progress;
  onClose: () => void;
  onGoToLesson: (id: string) => void;
}) {
  const states = conceptStates(progress);
  const summary = progressSummary(progress);
  const lessonFor = (conceptId: string) => LESSONS.find((l) => l.concepts.includes(conceptId));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
      role="dialog" aria-modal="true" aria-label="Concept map">
      <div className="gl-enter w-full max-w-4xl rounded-xl border border-border bg-surface shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h1 className="text-[17px] font-semibold text-fg">Everything there is to learn</h1>
            <p className="mt-0.5 text-[12.5px] text-fg-muted">
              {summary.conceptsPracticed} of {summary.conceptsTotal} concepts practised —
              not just read about, but actually done.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </header>

        <div className="gl-scroll max-h-[70vh] overflow-y-auto px-5 py-4">
          {BIG_IDEAS.map((idea) => {
            const concepts = CONCEPTS.filter((c) => c.bigIdea === idea.id);
            const done = concepts.filter((c) => states[c.id] === 'practiced').length;
            return (
              <section key={idea.id} className="mb-6 last:mb-0">
                <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-border pb-1.5">
                  <h2 className="text-[13.5px] font-semibold text-fg">{idea.title}</h2>
                  <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{done}/{concepts.length}</span>
                </div>
                <p className="mb-2.5 text-[12px] leading-relaxed text-fg-muted">{idea.blurb}</p>

                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {concepts.map((concept) => {
                    const state = states[concept.id];
                    const lesson = lessonFor(concept.id);
                    return (
                      <li key={concept.id}>
                        <button type="button"
                          onClick={() => lesson && onGoToLesson(lesson.id)}
                          disabled={!lesson}
                          className="flex w-full items-start gap-2 rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-left transition-colors hover:border-accent/40 hover:bg-surface-hover disabled:cursor-default">
                          <span className={`mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            state === 'practiced' ? 'border-success bg-success/20 text-success'
                              : state === 'encountered' ? 'border-warning/60 text-warning'
                              : 'border-border text-fg-subtle'}`}>
                            {state === 'practiced' ? <CheckIcon /> : <span className="text-[9px]">
                              {state === 'encountered' ? '·' : ''}
                            </span>}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-[12px] font-medium ${
                              state === 'practiced' ? 'text-fg' : 'text-fg-muted'}`}>
                              {concept.label}
                            </span>
                            <span className="block text-[11px] leading-snug text-fg-subtle">{concept.blurb}</span>
                            <span className="mt-0.5 block text-[10px] text-fg-subtle/70">
                              {MODULE_TITLES[concept.module as ModuleId]}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <footer className="flex items-center gap-3 border-t border-border px-5 py-3 text-[11.5px] text-fg-subtle">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border border-success bg-success/20" /> practised
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border border-warning/60" /> seen
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border border-border" /> not yet
          </span>
          <span className="ml-auto">Click any concept to jump to the lesson that teaches it.</span>
        </footer>
      </div>
    </div>
  );
}
