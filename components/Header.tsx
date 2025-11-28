
import React from 'react';

interface HeaderProps {
    onReset: () => void;
    currentMode: 'tutorial' | 'playground';
    onSetMode: (mode: 'tutorial' | 'playground') => void;
}

export const Header: React.FC<HeaderProps> = ({ onReset, currentMode, onSetMode }) => {
  return (
    <header className="bg-git-surface border-b border-git-border p-4 flex flex-col md:flex-row justify-between items-center gap-4">
      <div className="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-git-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="18" r="3"></circle>
            <circle cx="6" cy="6" r="3"></circle>
            <path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
            <line x1="6" y1="9" x2="6" y2="21"></line>
        </svg>
        <h1 className="text-xl font-bold text-git-text-primary">
          GitLearn
        </h1>
      </div>

      <div className="flex bg-git-bg p-1 rounded-lg border border-git-border">
         <button
            onClick={() => onSetMode('tutorial')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                currentMode === 'tutorial' 
                ? 'bg-git-surface text-git-text-primary shadow-sm' 
                : 'text-git-text-secondary hover:text-git-text-primary'
            }`}
         >
            Tutorial
         </button>
         <button
            onClick={() => onSetMode('playground')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                currentMode === 'playground' 
                ? 'bg-git-surface text-git-text-primary shadow-sm' 
                : 'text-git-text-secondary hover:text-git-text-primary'
            }`}
         >
            Playground
         </button>
      </div>

      <button
        onClick={onReset}
        className="px-4 py-2 bg-git-danger/20 text-git-danger border border-git-danger/50 rounded-md hover:bg-git-danger/40 transition-colors duration-200 text-sm font-semibold"
      >
        Reset Repo
      </button>
    </header>
  );
};
