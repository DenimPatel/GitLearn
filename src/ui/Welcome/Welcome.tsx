import { useState } from 'react';
import { useEngine } from '../../state/useEngine';
import { Terminal } from '../Terminal/Terminal';
import { Button, BranchIcon, Card } from '../primitives';
import { LESSONS } from '../../curriculum/lessons';

/**
 * The first thing a newcomer sees. Deliberately almost empty: a sentence of
 * framing and a single terminal, because the workbench — graph, three trees,
 * inspector, 43 lessons — reads as a wall of machinery to someone who has never
 * run a Git command.
 *
 * The engine here is its own instance, so nothing typed on this screen touches
 * the lesson world.
 */
export function Welcome({ onStart }: { onStart: () => void }) {
  const engine = useEngine();
  const [draft, setDraft] = useState('');

  /** Beats advance on *any* command, never only the suggested one: nobody may
   *  get stuck on the welcome screen for typing something else. */
  const commandsRun = engine.entries.length;
  const beat = Math.min(commandsRun, 2);

  const prompts = [
    { chip: 'ls', line: <>Type <code className="font-mono text-accent">ls</code> and press Enter to see what is in the folder.</> },
    { chip: 'git status', line: <>Now <code className="font-mono text-accent">git status</code>. It is going to refuse — that is the interesting part.</> },
  ] as const;

  return (
    <div className="gl-scroll h-screen overflow-y-auto bg-bg text-fg">
      <div className="mx-auto flex min-h-screen w-full max-w-[36rem] flex-col justify-center gap-6 px-5 py-10">
        <div>
          <div className="mb-5 flex items-center gap-2 text-accent">
            <BranchIcon />
            <span className="text-[14px] font-semibold tracking-tight text-fg">GitLearn</span>
          </div>

          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-fg">
            Learn Git by running Git.
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-fg-muted">
            Git keeps the history of a project — every version, who changed what, and why —
            so you never need another <code className="font-mono text-[13px] text-fg">report_final_v2_FINAL</code> again.
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">
            This is a real Git simulator in your browser. Every command works, nothing is
            saved anywhere, and nothing you type here can break.
          </p>
        </div>

        <div>
          <p className="mb-2 text-[13px] text-fg" aria-live="polite">
            {beat < 2
              ? <><span className="text-fg-subtle">{beat === 0 ? 'Try one now.' : 'One more.'}</span> {prompts[beat].line}</>
              : <>That error is worth reading: Git has no idea this folder exists yet. Making it a repository is the first lesson.</>}
          </p>

          {beat < 2 && (
            <button type="button" onClick={() => setDraft(prompts[beat].chip)}
              className="mb-2 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 font-mono text-[11.5px] text-accent transition-colors hover:bg-accent/20">
              {prompts[beat].chip}
            </button>
          )}

          <Card className="h-[13rem]" bodyClass="overflow-hidden rounded-xl">
            <Terminal
              entries={engine.entries}
              prompt={engine.prompt}
              world={engine.world}
              onRun={engine.run}
              draft={draft}
              onDraftChange={setDraft}
            />
          </Card>
        </div>

        <div className="flex items-center gap-3">
          {beat >= 2 ? (
            <Button variant="primary" onClick={onStart} className="gl-enter">Start learning →</Button>
          ) : (
            <Button variant="subtle" onClick={onStart}>Skip intro</Button>
          )}
          {beat >= 2 && (
            <span className="text-[11.5px] text-fg-subtle">
              {LESSONS.length} lessons, from your first commit to rebasing.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
