
import React, { useState } from 'react';
import type { Command } from '../types';

interface CommandButtonProps {
  command: Command;
  onClick: (payload?: any) => void;
  children: React.ReactNode;
  requiresPayload?: boolean;
  payloadLabel?: string;
  payloadDefault?: string;
  className?: string;
  /** Whether this simulates a real `git` command (adds the "git " prefix to the button and terminal preview). Set false for actions like editing a file, which you'd never type at a git prompt. */
  isGitCommand?: boolean;
  /**
   * Builds the exact command line a user would type in a real terminal to do this,
   * given the current payload (e.g. `(msg) => `commit -m "${msg}"``). Shown live above
   * the button so beginners learn the real syntax, not just the click-to-run shortcut.
   */
  commandPreview?: (payload: string) => string;
}

export const CommandButton: React.FC<CommandButtonProps> = ({
  onClick,
  children,
  requiresPayload = false,
  payloadLabel,
  payloadDefault,
  className = '',
  isGitCommand = true,
  commandPreview,
}) => {
  const [payload, setPayload] = useState(payloadDefault || '');

  const handleClick = () => {
    onClick(requiresPayload ? payload : undefined);
    // Do not reset payload immediately so user can run multiple times or see what they typed
  };

  const previewText = commandPreview ? commandPreview(payload) : null;

  return (
    <div className="flex flex-col gap-1 w-full">
      {previewText && (
        <div className="font-mono text-xs text-git-text-secondary bg-git-bg/60 border border-git-border rounded px-2 py-1 truncate">
          {isGitCommand ? <span className="text-git-accent mr-1">$</span> : <span className="text-git-warning mr-1">✎</span>}
          {previewText}
        </div>
      )}
      <div className="flex flex-col sm:flex-row items-stretch gap-2">
        {requiresPayload && (
          <input
            type="text"
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            placeholder={payloadLabel}
            className="bg-git-bg border border-git-border rounded-md px-3 py-2 text-git-text-primary focus:outline-none focus:ring-2 focus:ring-git-accent font-mono text-sm flex-grow min-w-0"
          />
        )}
        <button
          onClick={handleClick}
          disabled={requiresPayload && !payload}
          className={`font-mono text-sm px-4 py-2 rounded-md transition-all duration-200 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 ${className}`}
        >
          {isGitCommand ? 'git ' : ''}{children}
        </button>
      </div>
    </div>
  );
};
