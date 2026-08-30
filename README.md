# GitLearn: Interactive Git Tutorial

An interactive, curriculum-based web application for learning Git. Work through
guided lessons one concept at a time, with a live visualization of your
repository state (working directory, staging area, commits, and branches), or
switch to Playground mode to run commands freely.

**Live demo:** https://denimpatel.github.io/GitLearn/

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Build

`npm run build` produces a production build in `dist/`.

## Contributing

Pull requests are welcome. Lessons live in [`constants.ts`](constants.ts), the
Git simulation logic lives in [`services/gitService.ts`](services/gitService.ts),
and the UI components live in [`components/`](components).

Pushes to `main` automatically deploy to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
