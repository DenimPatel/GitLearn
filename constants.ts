
import type { Lesson } from './types';

export const LESSONS: Lesson[] = [
  {
    id: 'init',
    title: '1. Initialize Repository',
    explanation: `Welcome to GitLearn! A Git repository is like a project folder with superpowers.\nIt tracks all changes to your files over time.\n\nYour first step is always to initialize a new repository. Click 'git init' to begin.`,
    allowedCommands: ['INIT'],
    completionCondition: (state) => state.isInitialized,
  },
  {
    id: 'create-and-add',
    title: '2. Create & Stage a File',
    explanation: `Great! Now you have a repository.\nLet's create a file. Files in your folder are in the "Working Directory".\n\nTo prepare a file for saving (committing), you must first add it to the "Staging Area". This tells Git you want to track this file in the next save.`,
    allowedCommands: ['CREATE_FILE', 'ADD'],
    setupCommands: [{ type: 'INIT' }],
    completionCondition: (state) => Object.keys(state.stagingArea).length > 0,
  },
  {
    id: 'commit',
    title: '3. Commit Your Changes',
    explanation: `Your file is staged! A "commit" is a snapshot of your staged files at a specific point in time.\nEach commit has a unique ID and a message describing the changes.\n\nCommit your staged file to save it to your repository's history.`,
    allowedCommands: ['COMMIT'],
    setupCommands: [{ type: 'INIT' }, { type: 'CREATE_FILE', payload: { name: 'index.html', content: 'Hello World' } }, { type: 'ADD', payload: 'index.html' }],
    completionCondition: (state) => Object.keys(state.commits).length > 0,
  },
  {
    id: 'modify',
    title: '4. The Modify-Add-Commit Cycle',
    explanation: `This is the core workflow in Git.\n1. Modify a file in your Working Directory.\n2. Stage the changes with 'git add'.\n3. Commit the staged snapshot with 'git commit'.\n\nNotice how the file status changes. Go through one full cycle.`,
    allowedCommands: ['MODIFY_FILE', 'ADD', 'COMMIT'],
    setupCommands: [
      { type: 'INIT' },
      { type: 'CREATE_FILE', payload: { name: 'index.html', content: 'Hello World' } },
      { type: 'ADD', payload: 'index.html' },
      { type: 'COMMIT', payload: 'Initial commit' }
    ],
    completionCondition: (state) => Object.keys(state.commits).length > 1,
  },
  {
    id: 'branch',
    title: '5. Create a Branch',
    explanation: `A branch is a separate line of development. It's like a copy of your project where you can work on new features without affecting the main 'main' branch.\n\nCreate a new branch called 'feature'. Notice it points to the same commit as 'main'.`,
    allowedCommands: ['BRANCH'],
    setupCommands: [
      { type: 'INIT' },
      { type: 'CREATE_FILE', payload: { name: 'index.html', content: 'Hello World' } },
      { type: 'ADD', payload: 'index.html' },
      { type: 'COMMIT', payload: 'Initial commit' }
    ],
    completionCondition: (state) => Object.keys(state.branches).includes('feature'),
  },
  {
    id: 'checkout',
    title: '6. Switch Branches',
    explanation: `To work on your new branch, you need to 'checkout' or switch to it.\n\nWhen you checkout 'feature', the HEAD pointer moves to it. This means any new commits will be on the 'feature' branch.`,
    allowedCommands: ['CHECKOUT'],
    setupCommands: [
        { type: 'INIT' },
        { type: 'CREATE_FILE', payload: { name: 'index.html', content: 'Hello World' } },
        { type: 'ADD', payload: 'index.html' },
        { type: 'COMMIT', payload: 'Initial commit' },
        { type: 'BRANCH', payload: 'feature' }
    ],
    completionCondition: (state) => state.HEAD.name === 'feature',
  },
   {
    id: 'commit-on-branch',
    title: '7. Commit on a Branch',
    explanation: `Now that you're on the 'feature' branch, let's make a change.\nModify and commit a file. Observe how the 'feature' branch moves forward, while 'main' stays put. This is how you develop features in isolation.`,
    allowedCommands: ['MODIFY_FILE', 'ADD', 'COMMIT'],
     setupCommands: [
        { type: 'INIT' },
        { type: 'CREATE_FILE', payload: { name: 'index.html', content: 'Hello World' } },
        { type: 'ADD', payload: 'index.html' },
        { type: 'COMMIT', payload: 'Initial commit' },
        { type: 'BRANCH', payload: 'feature' },
        { type: 'CHECKOUT', payload: 'feature' }
    ],
    completionCondition: (state) => {
        const featureCommitId = state.branches['feature'];
        const mainCommitId = state.branches['main'];
        return featureCommitId !== '' && mainCommitId !== '' && featureCommitId !== mainCommitId;
    },
  },
  {
    id: 'merge',
    title: '8. Merge a Branch',
    explanation: `Merging unites two branches. You're on 'main', and 'feature' has new work. Let's merge 'feature' into 'main'.\n\nThis creates a new 'merge commit' that has two parents, tying the histories together.`,
    allowedCommands: ['MERGE'],
    setupCommands: [
       { type: 'INIT' },
       { type: 'CREATE_FILE', payload: { name: 'index.html', content: 'Hello World' } },
       { type: 'ADD', payload: 'index.html' },
       { type: 'COMMIT', payload: 'Initial commit' },
       { type: 'BRANCH', payload: 'feature' },
       { type: 'CHECKOUT', payload: 'feature' },
       { type: 'MODIFY_FILE', payload: 'index.html' },
       { type: 'ADD', payload: 'index.html' },
       { type: 'COMMIT', payload: 'Add feature' },
       { type: 'CHECKOUT', payload: 'main' }
    ],
    completionCondition: (state) => {
      const mainCommitId = state.branches['main'];
      if (!mainCommitId) return false;
      const mainCommit = state.commits[mainCommitId];
      return mainCommit && mainCommit.parents.length > 1;
    },
  }
];
