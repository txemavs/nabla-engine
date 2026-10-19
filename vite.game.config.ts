import { defineConfig, loadEnv } from 'vite'
import { readFileSync } from 'node:fs'
import { terrainFolder } from './scripts/vite-terrain-folder.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (!!env.NABLA_HTTPS_CERT !== !!env.NABLA_HTTPS_KEY)
    throw new Error('NABLA_HTTPS_CERT and NABLA_HTTPS_KEY must be supplied together')
  return {
    root: 'game',
    plugins: [terrainFolder(env)],
    optimizeDeps: {
      entries: ['index.html', 'xr.html'],
      // Pre-bundle the heavy graph so the first «Initializing...» visit is not an optimizeDeps run.
      include: [
        'lerc',
        'three',
        'three/addons/loaders/GLTFLoader.js',
        '@dimforge/rapier3d-compat/rapier.es.js',
        'zod',
        'polygon-clipping',
      ],
    },
    publicDir: '../assets',
    build: {
      outDir: '../game-dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          game: 'game/index.html',
          test: 'game/test.html',
          quest: 'game/xr.html',
          headset: 'game/headset.html',
          mixedReality: 'game/ar.html',
          mixedRealityRC: 'game/ar-rc.html',
          questDemo: 'game/xr-demo.html',
        },
      },
    },
    server: {
      https: env.NABLA_HTTPS_CERT
        ? { cert: readFileSync(env.NABLA_HTTPS_CERT), key: readFileSync(env.NABLA_HTTPS_KEY) }
        : undefined,
      port: 5174,
      strictPort: true,
      watch: { usePolling: true, interval: 300 },
      proxy: {
        // Same-origin Atlas package folder, as Euskadi Online serves it: `?terrain=/tiles`.
        // Tile GLB/webp files carry no CORS headers, so the browser must not fetch them cross-origin.
        '/tiles/': {
          target: env.NABLA_TILES_UPSTREAM || 'https://atlas.chained.world/euskadi/terraform',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/tiles/, ''),
        },
        '/atlas-live/euskadi/terraform/': {
          target: 'https://atlas.chained.world',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/atlas-live/, ''),
        },
        ...(env.NABLA_STUDIO_UPSTREAM
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
            : {}),
      },
    },
  }
})
