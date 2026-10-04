import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  root: 'test/browser',
  publicDir: '../../assets',
  optimizeDeps: { noDiscovery: true, include: ['polygon-clipping', 'jpeg-js', 'lerc'] },
  resolve: {
    alias: [
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
  server: { host: '127.0.0.1', port: 5191, strictPort: true },
})
