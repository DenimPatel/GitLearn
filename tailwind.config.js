/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces, from furthest back to nearest.
        bg: '#0b0e13',
        surface: '#11161d',
        'surface-raised': '#171d26',
        'surface-hover': '#1d242f',
        terminal: '#0a0d12',
        border: '#262d38',
        // Foreground, by emphasis.
        fg: '#e2e8f0',
        'fg-muted': '#9aa7b8',
        'fg-subtle': '#69758a',
        // Semantic.
        accent: '#58a6ff',
        'accent-strong': '#79b8ff',
        success: '#3fb950',
        warning: '#d29922',
        danger: '#f85149',
        // One tone per command family, referenced from design/tokens.ts.
        'tone-create': '#58a6ff',
        'tone-stage': '#3fb950',
        'tone-commit': '#bc8cff',
        'tone-branch': '#39c5cf',
        'tone-merge': '#f778ba',
        'tone-undo': '#d29922',
        'tone-remote': '#79b8ff',
        'tone-inspect': '#9aa7b8',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['Fira Code', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
