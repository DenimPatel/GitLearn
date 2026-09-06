import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/GitLearn/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
  },
} as Parameters<typeof defineConfig>[0]);
