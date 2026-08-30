
import React from 'react';
import type { Lesson, Command } from '../types';
import { CommandButton } from './CommandButton';

interface LessonViewProps {
  lesson: Lesson;
  onCommand: (command: Command, payload?: any) => void;
  isComplete: boolean;
  onNextLesson: () => void;
  feedbackMessage: string | null;
}

export const LessonView: React.FC<LessonViewProps> = ({ lesson, onCommand, isComplete, onNextLesson, feedbackMessage }) => {

  const commandComponents: Record<Command, React.ReactNode> = {
    INIT: <CommandButton command="INIT" onClick={() => onCommand('INIT')} commandPreview={() => 'git init'} className="bg-blue-500/20 text-blue-300 border border-blue-500/50 hover:bg-blue-500/30">init</CommandButton>,
    CREATE_FILE: <CommandButton command="CREATE_FILE" onClick={(p) => onCommand('CREATE_FILE', {name: p, content: `Content of ${p}`})} requiresPayload payloadLabel="filename.ext" payloadDefault="index.html" isGitCommand={false} commandPreview={(p) => `create ${p || 'filename.ext'} in your editor`} className="bg-gray-500/20 text-gray-300 border border-gray-500/50 hover:bg-gray-500/30">create-file</CommandButton>,
    MODIFY_FILE: <CommandButton command="MODIFY_FILE" onClick={(p) => onCommand('MODIFY_FILE', p)} requiresPayload payloadLabel="filename.ext" payloadDefault="index.html" isGitCommand={false} commandPreview={(p) => `edit ${p || 'filename.ext'} in your editor`} className="bg-yellow-500/20 text-yellow-300 border border-yellow-500/50 hover:bg-yellow-500/30">modify-file</CommandButton>,
    ADD: <CommandButton command="ADD" onClick={(p) => onCommand('ADD', p)} requiresPayload payloadLabel="filename.ext" payloadDefault="index.html" commandPreview={(p) => `git add ${p || '<filename.ext>'}`} className="bg-green-500/20 text-green-300 border border-green-500/50 hover:bg-green-500/30">add</CommandButton>,
    COMMIT: <CommandButton command="COMMIT" onClick={(p) => onCommand('COMMIT', p)} requiresPayload payloadLabel="commit message" payloadDefault="feat: initial commit" commandPreview={(p) => `git commit -m "${p || '<commit message>'}"`} className="bg-purple-500/20 text-purple-300 border border-purple-500/50 hover:bg-purple-500/30">commit -m</CommandButton>,
    BRANCH: <CommandButton command="BRANCH" onClick={(p) => onCommand('BRANCH', p)} requiresPayload payloadLabel="branch-name" payloadDefault="feature" commandPreview={(p) => `git branch ${p || '<branch-name>'}`} className="bg-teal-500/20 text-teal-300 border border-teal-500/50 hover:bg-teal-500/30">branch</CommandButton>,
    CHECKOUT: <CommandButton command="CHECKOUT" onClick={(p) => onCommand('CHECKOUT', p)} requiresPayload payloadLabel="branch-name" payloadDefault="feature" commandPreview={(p) => `git checkout ${p || '<branch-name>'}`} className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 hover:bg-cyan-500/30">checkout</CommandButton>,
    MERGE: <CommandButton command="MERGE" onClick={(p) => onCommand('MERGE', p)} requiresPayload payloadLabel="source-branch" payloadDefault="feature" commandPreview={(p) => `git merge ${p || '<source-branch>'}`} className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/50 hover:bg-indigo-500/30">merge</CommandButton>,
    RESET: <></> // Not a user command
  };

  return (
    <div className="bg-git-surface border border-git-border rounded-lg p-6 flex flex-col h-full">
      <div className="flex-grow">
        <h2 className="text-xl font-bold mb-2 text-git-accent">{lesson.title}</h2>
        <p className="text-git-text-secondary whitespace-pre-wrap mb-6">{lesson.explanation}</p>
        
        <div className="space-y-3">
          <h3 className="text-md font-semibold text-git-text-primary mb-2">Available Commands</h3>
          {lesson.allowedCommands.map(cmd => (
            <div key={cmd}>{commandComponents[cmd]}</div>
          ))}
        </div>
      </div>
      
      <div className="mt-6 pt-4 border-t border-git-border">
         {feedbackMessage && (
            <div className="font-mono text-sm bg-git-bg p-3 rounded-md text-git-text-secondary mb-4">
              <span className="text-git-accent mr-2">$</span>{feedbackMessage}
            </div>
          )}
          {isComplete && (
            <button 
              onClick={onNextLesson}
              className="w-full bg-git-success/20 text-git-success border border-git-success/50 font-bold py-3 px-4 rounded-md hover:bg-git-success/40 transition-colors duration-200"
            >
              Lesson Complete! Proceed to Next →
            </button>
          )}
      </div>
    </div>
  );
};
