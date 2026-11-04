import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/web',
  // Relative Pfade: So läuft die Seite unter jedem Unterpfad, etwa auf GitHub Pages.
  base: './',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    target: 'es2022',
    // Der Polyfill wäre ein Inline-Skript, das die Sicherheitsregel der Seite verbietet.
    modulePreload: { polyfill: false },
  },
  server: { fs: { allow: ['../..'] } },
});
