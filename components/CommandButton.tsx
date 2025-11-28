
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
}

export const CommandButton: React.FC<CommandButtonProps> = ({ 
  onClick, 
  children, 
  requiresPayload = false, 
  payloadLabel, 
  payloadDefault, 
  className = '' 
}) => {
  const [payload, setPayload] = useState(payloadDefault || '');

  const handleClick = () => {
    onClick(requiresPayload ? payload : undefined);
    // Do not reset payload immediately so user can run multiple times or see what they typed
  };
  
  return (
    <div className="flex flex-col gap-1 w-full">
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
          git {children}
        </button>
      </div>
    </div>
  );
};
