import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    root: 'game',
    plugins: [vue()],
    resolve: {
      alias: [
        {
          find: '@nabla/engine/vehicle-presentation/presets',
          replacement: fileURLToPath(
            new URL('./src/catalog/presentation/road-vehicles.ts', import.meta.url),
          ),
        },
        {
          find: '@nabla/engine/vehicle-presentation',
          replacement: fileURLToPath(
            new URL('./src/render/vehicle-presentation/index.ts', import.meta.url),
          ),
        },
        {
          find: '@nabla/engine/monitors/html',
          replacement: fileURLToPath(
            new URL('./src/render/monitors/html-monitor.ts', import.meta.url),
          ),
        },
        {
          find: '@nabla/engine/monitors/presets',
          replacement: fileURLToPath(new URL('./src/catalog/monitors/index.ts', import.meta.url)),
        },
        {
          find: '@nabla/engine/monitors',
          replacement: fileURLToPath(new URL('./src/render/monitors/index.ts', import.meta.url)),
        },
        {
          find: '@nabla/engine/menus',
          replacement: fileURLToPath(new URL('./src/render/monitors/menu.ts', import.meta.url)),
        },
        {
          find: './preset-source.js',
          replacement: fileURLToPath(
            new URL('./src/catalog/vehicles/preset-source.browser.ts', import.meta.url),
          ),
        },
        {
          find: './weapon-source.js',
          replacement: fileURLToPath(
            new URL('./src/catalog/weapons/weapon-source.browser.ts', import.meta.url),
          ),
        },
      ],
    },
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
