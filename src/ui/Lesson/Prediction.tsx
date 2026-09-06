import { useState } from 'react';
import { Button } from '../primitives';
import type { Prediction as PredictionData } from '../../curriculum/types';

/** A checkpoint asked before a subtle command runs. The point is not the quiz —
 *  it is that committing to an answer turns passive reading into a belief that
 *  can then be corrected. */
export function Prediction({ data, onAnswer }: {
  data: PredictionData;
  onAnswer: (correct: boolean) => void;
}) {
  const [choice, setChoice] = useState<number | null>(null);
  const answered = choice !== null;
  const correct = choice === data.answerIndex;

  return (
    <div className="rounded-lg border border-accent/30 bg-accent/[0.06] p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent">
        Predict first
      </p>
      <p className="mb-2.5 text-[13px] text-fg">{data.question}</p>

      <div className="space-y-1.5">
        {data.options.map((option, i) => {
          const isAnswer = i === data.answerIndex;
          const picked = choice === i;
          const style = !answered
            ? 'border-border bg-surface-raised hover:border-accent/50 hover:bg-surface-hover'
            : isAnswer
              ? 'border-success/60 bg-success/10 text-success'
              : picked
                ? 'border-danger/60 bg-danger/10 text-danger'
                : 'border-border bg-surface opacity-50';
          return (
            <button key={i} type="button" disabled={answered}
              onClick={() => { setChoice(i); onAnswer(i === data.answerIndex); }}
              className={`block w-full rounded-md border px-2.5 py-1.5 text-left text-[12px] transition-colors ${style}`}>
              {option}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="gl-enter mt-2.5 border-t border-border pt-2">
          <p className={`mb-1 text-[11px] font-semibold ${correct ? 'text-success' : 'text-warning'}`}>
            {correct ? 'Right.' : 'Not quite.'}
          </p>
          <p className="text-[12px] leading-relaxed text-fg-muted">{data.explanation}</p>
        </div>
      )}
    </div>
  );
}

export function HintBlock({ hints, level, onMore }: {
  hints: string[]; level: number; onMore: () => void;
}) {
  if (!hints.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-2.5">
      {hints.slice(0, level).map((hint, i) => (
        <p key={i} className="gl-enter mb-1.5 text-[12px] leading-relaxed text-fg-muted last:mb-0">
          <span className="mr-1.5 font-mono text-[10px] text-fg-subtle">{i + 1}.</span>
          {hint}
        </p>
      ))}
      {level < hints.length && (
        <Button size="sm" variant="subtle" onClick={onMore}>
          {level === 0 ? 'Stuck? Show a hint' : 'Another hint'}
        </Button>
      )}
    </div>
  );
}
