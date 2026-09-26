import { defineConfig, loadEnv } from 'vite'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    root: 'studio',
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
        },
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
