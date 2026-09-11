import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { allCommands } from '../../engine/registry';
import { listBranches, listTags } from '../../engine/refs';
import type { TerminalEntry } from '../../state/useEngine';
import type { World } from '../../engine/types';

interface Props {
  entries: TerminalEntry[];
  prompt: string;
  world: World;
  onRun: (command: string) => void;
  /** Filled into the input by a chip, so the learner still presses Enter. */
  draft: string;
  onDraftChange: (value: string) => void;
}

/** Everything the learner could plausibly be typing: commands, then live refs
 *  and paths from their own repository. */
function completionsFor(world: World, input: string): string[] {
  const parts = input.split(/\s+/);
  const repo = world.local;

  if (parts.length <= 1) {
    const names = [...allCommands('shell').map((c) => c.name), 'git'];
    return names.filter((n) => n.startsWith(parts[0] ?? '')).sort();
  }
  if (parts[0] === 'git' && parts.length === 2) {
    return allCommands('git').map((c) => c.name).filter((n) => n.startsWith(parts[1])).sort();
  }

  const last = parts[parts.length - 1];
  const candidates = [
    ...Object.keys(repo.worktree.files),
    ...listBranches(repo).map((b) => b.short),
    ...listTags(repo).map((t) => t.short),
    'HEAD', 'origin/main', '--staged', '--oneline', '--graph', '--all',
  ];
  return [...new Set(candidates)].filter((c) => c.startsWith(last) && c !== last).sort();
}

export function Terminal({ entries, prompt, world, onRun, draft, onDraftChange }: Props) {
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [completions, setCompletions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries.length]);

  useEffect(() => {
    if (draft) inputRef.current?.focus();
  }, [draft]);

  const commandHistory = entries.map((e) => e.command);

  const submit = () => {
    const value = draft.trim();
    if (!value) return;
    onRun(value);
    onDraftChange('');
    setHistoryIndex(-1);
    setCompletions([]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); return; }

    if (e.ctrlKey && e.key === 'c' && !window.getSelection()?.toString()) {
      e.preventDefault();
      onDraftChange('');
      setHistoryIndex(-1);
      setCompletions([]);
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const options = completionsFor(world, draft);
      if (options.length === 1) {
        const parts = draft.split(/\s+/);
        parts[parts.length - 1] = options[0];
        onDraftChange(parts.join(' ') + ' ');
        setCompletions([]);
      } else {
        setCompletions(options.slice(0, 12));
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!commandHistory.length) return;
      const next = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(next);
      onDraftChange(commandHistory[next]);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const next = historyIndex + 1;
      if (next >= commandHistory.length) { setHistoryIndex(-1); onDraftChange(''); }
      else { setHistoryIndex(next); onDraftChange(commandHistory[next]); }
      return;
    }
    if (completions.length) setCompletions([]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-terminal font-mono text-[12.5px] leading-[1.55]"
      onClick={() => inputRef.current?.focus()}>
      <div ref={scrollRef} className="gl-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {entries.length === 0 && (
          <p className="text-fg-subtle">
            Type a command and press Enter. <span className="text-fg-muted">Tab</span> completes,{' '}
            <span className="text-fg-muted">↑</span> recalls, <span className="text-fg-muted">clear</span> empties this pane.
          </p>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="gl-enter mb-1.5">
            <div className="flex gap-2">
              <span className="shrink-0 text-success">{entry.prompt}</span>
              <span className="text-fg">{entry.command}</span>
            </div>
            {entry.stdout.map((line, i) => (
              <div key={`o${i}`} className="whitespace-pre-wrap break-words text-fg-muted">{line || ' '}</div>
            ))}
            {entry.stderr.map((line, i) => (
              <div key={`e${i}`}
                className={`whitespace-pre-wrap break-words ${line.startsWith('hint:') ? 'text-warning/80' : 'text-danger'}`}>
                {line || ' '}
              </div>
            ))}
          </div>
        ))}

        {completions.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-fg-subtle">
            {completions.map((c) => <span key={c}>{c}</span>)}
          </div>
        )}

        <div className="flex gap-2">
          <label htmlFor="gl-terminal-input" className="shrink-0 text-success">{prompt}</label>
          <input
            id="gl-terminal-input"
            ref={inputRef}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            aria-label="Git command"
            className="min-w-0 flex-1 bg-transparent text-fg caret-accent outline-none"
          />
        </div>
      </div>
    </div>
  );
}
