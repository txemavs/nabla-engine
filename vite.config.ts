import { defineConfig } from 'vite'
export default defineConfig({
  root: 'playground',
  publicDir: '../assets',
  build: { outDir: '../demo-dist', emptyOutDir: true },
  server: { port: 5173, strictPort: true, watch: { usePolling: true, interval: 300 } },
})
