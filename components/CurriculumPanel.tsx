
import React from 'react';
import type { Lesson } from '../types';

interface CurriculumPanelProps {
  lessons: Lesson[];
  currentLessonIndex: number;
  onSelectLesson: (index: number) => void;
}

export const CurriculumPanel: React.FC<CurriculumPanelProps> = ({ lessons, currentLessonIndex, onSelectLesson }) => {
  return (
    <div className="bg-git-surface border border-git-border rounded-lg p-4 h-full">
      <h2 className="text-lg font-semibold mb-4 text-git-text-primary">Curriculum</h2>
      <nav>
        <ul className="space-y-2">
          {lessons.map((lesson, index) => {
            const isCurrent = index === currentLessonIndex;
            const isCompleted = index < currentLessonIndex;

            return (
              <li key={lesson.id}>
                <button
                  onClick={() => onSelectLesson(index)}
                  className={`w-full text-left p-3 rounded-md transition-colors duration-200 flex items-center gap-3 ${
                    isCurrent
                      ? 'bg-git-accent/10 text-git-accent font-semibold ring-1 ring-git-accent'
                      : 'hover:bg-white/5'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {isCompleted ? (
                      <CheckCircleIcon className="w-5 h-5 text-git-success" />
                    ) : (
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isCurrent ? 'border-git-accent' : 'border-git-text-secondary'
                      }`}>
                        {isCurrent && <div className="w-2 h-2 bg-git-accent rounded-full"></div>}
                      </div>
                    )}
                  </div>
                  <span className={`${isCompleted ? 'text-git-text-secondary line-through' : 'text-git-text-primary'}`}>
                    {lesson.title}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
};

const CheckCircleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
  </svg>
);
