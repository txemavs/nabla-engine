import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    root: 'studio',
    plugins: [vue()],
    resolve: {
      alias: {
        '@nabla/engine/vehicle-presentation/presets': fileURLToPath(
          new URL('./src/catalog/presentation/road-vehicles.ts', import.meta.url),
        ),
        '@nabla/engine/vehicle-presentation': fileURLToPath(
          new URL('./src/render/vehicle-presentation/index.ts', import.meta.url),
        ),
        '@nabla/engine/monitors/html': fileURLToPath(
          new URL('./src/render/monitors/html-monitor.ts', import.meta.url),
        ),
        '@nabla/engine/monitors/presets': fileURLToPath(
          new URL('./src/catalog/monitors/index.ts', import.meta.url),
        ),
        '@nabla/engine/monitors': fileURLToPath(
          new URL('./src/render/monitors/index.ts', import.meta.url),
        ),
        '@nabla/engine/menus': fileURLToPath(
          new URL('./src/render/monitors/menu.ts', import.meta.url),
        ),
      },
    },
    define: {
      __VUE_OPTIONS_API__: true,
      __VUE_PROD_DEVTOOLS__: false,
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    },
    optimizeDeps: { entries: ['index.html', 'geoeuskadi.html'], include: ['lerc'] },
    publicDir: '../assets',
    build: {
      outDir: '../demo-dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: 'studio/index.html',
          geoeuskadi: 'studio/geoeuskadi.html',
          tileLab: 'studio/tile-lab.html',
          zoomLab: 'studio/zoom-lab.html',
          modularMonitor: 'studio/examples/modular-monitor.html',
          s3Monitor: 'studio/examples/s3-monitor.html',
          equipment: 'studio/examples/equipment.html',
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      watch: { usePolling: true, interval: 300 },
      proxy: env.NABLA_STUDIO_UPSTREAM
        ? Object.fromEntries(
            ['/world-cache', '/prepare', '/prepared'].map((path) => [
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
