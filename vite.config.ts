import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves this app from a sub-path: /<repo-name>/
// `base: './'` keeps every built asset path relative, so the site works
// from any repository name / username without code changes.
// Routing uses HashRouter (see src/App.tsx) so direct links and refresh
// never ask the GitHub Pages server for a sub-route -> no 404.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
