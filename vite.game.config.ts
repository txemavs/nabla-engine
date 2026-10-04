import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import { terrainFolder } from './scripts/vite-terrain-folder.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    root: 'game',
    plugins: [vue(), terrainFolder(env)],
    define: {
      __VUE_OPTIONS_API__: true,
      __VUE_PROD_DEVTOOLS__: false,
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    },
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
