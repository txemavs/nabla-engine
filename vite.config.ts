import { defineConfig, loadEnv } from 'vite'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    root: 'playground',
    publicDir: '../assets',
    build: {
      outDir: '../demo-dist',
      emptyOutDir: true,
      rollupOptions: {
        input: { main: 'playground/index.html', geoeuskadi: 'playground/geoeuskadi.html' },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      watch: { usePolling: true, interval: 300 },
      proxy: env.NABLA_CACHE_UPSTREAM
        ? {
            '/world-cache': {
              target: env.NABLA_CACHE_UPSTREAM,
              rewrite: (path: string) => path.replace(/^\/world-cache/, ''),
            },
          }
        : undefined,
    },
  }
})
