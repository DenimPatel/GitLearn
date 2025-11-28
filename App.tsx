
import React, { useState, useCallback, useMemo } from 'react';
import { CurriculumPanel } from './components/CurriculumPanel';
import { LessonView } from './components/LessonView';
import { GitVisualization } from './components/GitVisualization';
import { PlaygroundView } from './components/PlaygroundView';
import { Header } from './components/Header';
import { LESSONS } from './constants';
import type { RepoState, Command, File } from './types';
import { gitReducer } from './services/gitService';

const initialRepoState: RepoState = {
  isInitialized: false,
  workingDirectory: {},
  stagingArea: {},
  commits: {},
  branches: { 'main': '' },
  HEAD: { type: 'branch', name: 'main' },
};

type ViewMode = 'tutorial' | 'playground';

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('tutorial');
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [repoState, setRepoState] = useState<RepoState>(initialRepoState);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>('Welcome! Start by initializing a repository.');

  const currentLesson = useMemo(() => LESSONS[currentLessonIndex], [currentLessonIndex]);
  const isLessonComplete = useMemo(() => {
    if (viewMode === 'playground') return false;
    if (!currentLesson.completionCondition) return false;
    return currentLesson.completionCondition(repoState);
  }, [currentLesson, repoState, viewMode]);

  const handleCommand = useCallback((command: Command, payload?: any) => {
    // In playground, all commands are allowed (except those not implemented by gitReducer properly, but types enforce that)
    const isAllowed = viewMode === 'playground' || currentLesson.allowedCommands.includes(command) || command === 'RESET';
    
    if (isAllowed) {
      const { newState, message } = gitReducer(repoState, { type: command, payload });
      setRepoState(newState);
      setFeedbackMessage(message);
    } else {
      setFeedbackMessage(`Command '${command}' is not available in this lesson.`);
    }
  }, [repoState, currentLesson.allowedCommands, viewMode]);

  const goToNextLesson = () => {
    if (currentLessonIndex < LESSONS.length - 1) {
      setCurrentLessonIndex(prev => prev + 1);
      setFeedbackMessage(LESSONS[currentLessonIndex + 1].explanation.split('\n')[0]);
    }
  };

  const resetState = () => {
    setRepoState(initialRepoState);
    if (viewMode === 'tutorial') {
        setCurrentLessonIndex(0);
        setFeedbackMessage('Welcome! Start by initializing a repository.');
    } else {
        setFeedbackMessage('Playground reset. Initialize a repository to start.');
    }
  };

  const handleSelectLesson = (index: number) => {
    setRepoState(initialRepoState);
    setFeedbackMessage('State has been reset for the new lesson.');
    let tempState = initialRepoState;
    for (let i = 0; i <= index; i++) {
        if (LESSONS[i].setupCommands) {
            for (const cmd of LESSONS[i].setupCommands!) {
                 tempState = gitReducer(tempState, cmd).newState;
            }
        }
    }
    setRepoState(tempState);
    setCurrentLessonIndex(index);
    setFeedbackMessage(LESSONS[index].explanation.split('\n')[0]);
  }

  const handleSetMode = (mode: ViewMode) => {
      if (mode === viewMode) return;
      setViewMode(mode);
      // Reset state when entering playground to provide a blank slate as requested
      // "When you go into playground mode. It asks you to initialize git repo."
      if (mode === 'playground') {
          setRepoState(initialRepoState);
          setFeedbackMessage('Welcome to Playground! Run "git init" to start.');
      } else {
          // Reset when going back to tutorial? Or go to current lesson?
          // Let's reset to first lesson for simplicity, or we could keep state but it might conflict with lesson flow.
          // Better UX: Go to Lesson 1 default state.
          handleSelectLesson(0);
      }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header onReset={resetState} currentMode={viewMode} onSetMode={handleSetMode} />
      <main className="flex-grow p-4 lg:p-6">
        {viewMode === 'tutorial' ? (
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
                <div className="lg:col-span-3">
                <CurriculumPanel
                    lessons={LESSONS}
                    currentLessonIndex={currentLessonIndex}
                    onSelectLesson={handleSelectLesson}
                />
                </div>
                <div className="lg:col-span-4 flex flex-col gap-4">
                <LessonView
                    lesson={currentLesson}
                    onCommand={handleCommand}
                    isComplete={isLessonComplete}
                    onNextLesson={goToNextLesson}
                    feedbackMessage={feedbackMessage}
                />
                </div>
                <div className="lg:col-span-5">
                <GitVisualization repoState={repoState} />
                </div>
             </div>
        ) : (
            <PlaygroundView 
                repoState={repoState}
                onCommand={handleCommand}
                feedbackMessage={feedbackMessage}
            />
        )}
      </main>
    </div>
  );
}
