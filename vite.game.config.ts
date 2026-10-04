import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    root: 'game',
    optimizeDeps: {
      entries: ['index.html'],
      include: ['lerc'],
    },
    publicDir: '../assets',
    build: {
      outDir: '../game-dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          game: 'game/index.html',
        },
      },
    },
    server: {
      port: 5174,
      strictPort: true,
      watch: { usePolling: true, interval: 300 },
      proxy: env.NABLA_STUDIO_UPSTREAM
        ? Object.fromEntries(
            ['/world-cache', '/prepare', '/prepared', '/z'].map((path) => [
              path,
              { target: env.NABLA_STUDIO_UPSTREAM, changeOrigin: true },
            ]),
          )
        : env.NABLA_CACHE_UPSTREAM
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
