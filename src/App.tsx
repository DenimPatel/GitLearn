import { useCallback, useEffect, useState } from 'react';
import { useEngine } from './state/useEngine';
import { useLesson } from './state/useLesson';
import { Terminal } from './ui/Terminal/Terminal';
import { ThreeTrees } from './ui/Panels/ThreeTrees';
import { RemotePanel } from './ui/Panels/RemotePanel';
import { InspectorPanel } from './ui/Panels/InspectorPanel';
import { CommitGraph } from './ui/Graph/CommitGraph';
import { LessonPanel } from './ui/Lesson/LessonPanel';
import { CurriculumRail } from './ui/Lesson/CurriculumRail';
import { ConceptMap } from './ui/Lesson/ConceptMap';
import { ConflictPanel } from './ui/Conflict/ConflictPanel';
import { Welcome } from './ui/Welcome/Welcome';
import { Button, BranchIcon, Card } from './ui/primitives';
import { LESSONS, lessonIndex } from './curriculum/lessons';
import { loadProgress } from './curriculum/progress';
import { emptyWorld } from './engine/world';
import { allCommands } from './engine/registry';
import { toneFor, TONE_CLASS } from './design/tokens';
import type { CommandResult } from './engine/types';

type Mode = 'learn' | 'playground';

export default function App() {
  const [mode, setMode] = useState<Mode>('learn');
  const [draft, setDraft] = useState('');
  const [conceptMapOpen, setConceptMapOpen] = useState(false);
  const [showRail, setShowRail] = useState(true);
  /** Below xl the side panels have no room, so they open as a drawer instead of
   *  disappearing — a learner on a tablet must still be able to read the lesson. */
  const [drawer, setDrawer] = useState<'none' | 'lesson' | 'rail'>('none');
  /** Read before any effect runs: useLesson writes a currentLessonId on mount,
   *  so asking storage later would always look like a return visit. */
  const [showWelcome, setShowWelcome] = useState(() => !loadProgress().seenIntro);

  const engine = useEngine();
  const lesson = useLesson(engine.world, engine.reset);

  const handleRun = useCallback((command: string) => {
    const result: CommandResult | null = engine.run(command);
    if (result && mode === 'learn') lesson.observe(result);
  }, [engine, lesson, mode]);

  const goToLesson = useCallback((id: string) => {
    setMode('learn');
    setConceptMapOpen(false);
    setDrawer('none');
    lesson.enterLesson(id);
    setDraft('');
  }, [lesson]);

  // Writing a file from the conflict panel goes through the shell, so the
  // terminal transcript stays an honest record of everything that happened.
  const writeFile = useCallback((path: string, content: string) => {
    const escaped = content.replace(/\n$/, '').replace(/"/g, '\\"');
    handleRun(`echo "${escaped}" > ${path}`);
  }, [handleRun]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setConceptMapOpen(false); setDrawer('none'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const enterPlayground = () => {
    setMode('playground');
    engine.reset(emptyWorld());
    setDraft('');
  };

  const number = lessonIndex(lesson.lesson.id) + 1;

  const leaveWelcome = () => { lesson.dismissIntro(); setShowWelcome(false); };

  const lessonPanel = (
    <LessonPanel
      lesson={lesson.lesson}
      stepIndex={lesson.stepIndex}
      completedSteps={lesson.completedSteps}
      lessonComplete={lesson.lessonComplete}
      hintLevel={lesson.hintLevel}
      lessonNumber={number}
      lessonTotal={LESSONS.length}
      onShowHint={lesson.showHint}
      onFillCommand={(cmd) => { setDraft(cmd); setDrawer('none'); }}
      onResetStep={lesson.resetStep}
      onResetLesson={lesson.resetLesson}
      onNext={() => lesson.next && goToLesson(lesson.next.id)}
      hasNext={!!lesson.next}
      onPrediction={lesson.recordPrediction}
    />
  );

  if (showWelcome) return <Welcome onStart={leaveWelcome} />;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-fg">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-3 py-2">
        <button type="button" onClick={() => setShowRail((v) => !v)}
          className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-accent transition-colors hover:bg-surface-hover"
          title="Toggle the curriculum list">
          <BranchIcon />
          <span className="text-[14px] font-semibold tracking-tight text-fg">GitLearn</span>
        </button>

        <div className="ml-2 flex rounded-lg border border-border bg-surface-raised p-0.5">
          {(['learn', 'playground'] as const).map((m) => (
            <button key={m} type="button"
              onClick={() => (m === 'playground' ? enterPlayground() : setMode('learn'))}
              className={`rounded-md px-2.5 py-1 text-[11.5px] capitalize transition-colors ${
                mode === m ? 'bg-accent/20 text-accent' : 'text-fg-muted hover:text-fg'}`}>
              {m}
            </button>
          ))}
        </div>

        <p className="ml-auto hidden truncate text-[11.5px] text-fg-subtle md:block">
          {mode === 'learn'
            ? 'Type real Git commands. Nothing here can break.'
            : 'Free play — every command available, no goals.'}
        </p>

        {mode === 'learn' && (
          <div className="ml-auto flex gap-1.5 xl:ml-0">
            <Button size="sm" variant="ghost" className="lg:hidden"
              onClick={() => setDrawer((d) => (d === 'rail' ? 'none' : 'rail'))}>
              Lessons
            </Button>
            <Button size="sm" variant="primary" className="xl:hidden"
              onClick={() => setDrawer((d) => (d === 'lesson' ? 'none' : 'lesson'))}>
              Lesson {number}
            </Button>
          </div>
        )}
        <Button size="sm" variant="ghost" onClick={() => setConceptMapOpen(true)}>Concept map</Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {mode === 'learn' && showRail && (
          <aside className="hidden w-60 shrink-0 border-r border-border bg-surface lg:block">
            <CurriculumRail
              progress={lesson.progress}
              currentId={lesson.lesson.id}
              onSelect={goToLesson}
              onOpenConceptMap={() => setConceptMapOpen(true)}
              onReplayIntro={() => setShowWelcome(true)}
            />
          </aside>
        )}

        {/* The visualiser gets the most room on screen: reading it is the skill. */}
        <main className="flex min-w-0 flex-1 flex-col gap-2 p-2">
          <div className="flex min-h-0 flex-[1.15] gap-2">
            <div className="flex min-w-0 flex-[1.6] flex-col gap-2">
              <ThreeTrees world={engine.world} />
              <Card title="History" subtitle="commits, and the labels pointing at them"
                className="min-h-0 flex-1" bodyClass="min-h-0">
                <CommitGraph repo={engine.world.local} />
              </Card>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <RemotePanel world={engine.world} />
              <InspectorPanel world={engine.world} />
            </div>
          </div>

          <Card title="Terminal" subtitle="real Git commands"
            right={<CommandPalette onPick={setDraft} />}
            className="min-h-[190px] flex-1" bodyClass="flex min-h-0 flex-col">
            <ConflictPanel world={engine.world} onFillCommand={setDraft} onWriteFile={writeFile} />
            <div className="min-h-0 flex-1">
              <Terminal
                entries={engine.entries}
                prompt={engine.prompt}
                world={engine.world}
                onRun={handleRun}
                draft={draft}
                onDraftChange={setDraft}
              />
            </div>
          </Card>
        </main>

        {mode === 'learn' && (
          <aside className="hidden w-[22rem] shrink-0 border-l border-border bg-surface xl:block">
            {lessonPanel}
          </aside>
        )}
      </div>

      {drawer !== 'none' && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/60"
          onClick={() => setDrawer('none')} role="dialog" aria-modal="true">
          <div className="gl-enter flex h-full w-full max-w-sm flex-col border-l border-border bg-surface"
            onClick={(e) => e.stopPropagation()}>
            {drawer === 'lesson' ? lessonPanel : (
              <CurriculumRail
                progress={lesson.progress}
                currentId={lesson.lesson.id}
                onSelect={goToLesson}
                onOpenConceptMap={() => { setDrawer('none'); setConceptMapOpen(true); }}
                onReplayIntro={() => { setDrawer('none'); setShowWelcome(true); }}
              />
            )}
          </div>
        </div>
      )}

      {conceptMapOpen && (
        <ConceptMap
          progress={lesson.progress}
          onClose={() => setConceptMapOpen(false)}
          onGoToLesson={goToLesson}
        />
      )}
    </div>
  );
}

/** Every command the engine knows, grouped and filterable — the reference the
 *  learner keeps after the lessons are done. */
function CommandPalette({ onPick }: { onPick: (cmd: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const commands = [...allCommands('git'), ...allCommands('shell')]
    .filter((c) => !query || c.name.includes(query) || c.summary.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="relative">
      <Button size="sm" variant="subtle" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide commands' : 'All commands'}
      </Button>
      {open && (
        <div className="gl-enter absolute right-0 top-8 z-40 w-[26rem] rounded-xl border border-border bg-surface p-2 shadow-2xl">
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter commands…" aria-label="Filter commands"
            className="mb-2 w-full rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-[12px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent/60" />
          <ul className="gl-scroll max-h-80 space-y-0.5 overflow-y-auto">
            {commands.map((c) => (
              <li key={`${c.namespace ?? 'git'}:${c.name}`}>
                <button type="button"
                  onClick={() => { onPick(c.syntax.split('  |  ')[0]); setOpen(false); }}
                  className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-hover">
                  <span className={`font-mono text-[11.5px] ${TONE_CLASS[toneFor(c.syntax)].split(' ')[0]}`}>
                    {c.syntax}
                  </span>
                  <span className="block text-[11px] leading-snug text-fg-subtle">{c.summary}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
