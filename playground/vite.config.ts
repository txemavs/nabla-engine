import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  server: {
    port: 3000,
    host: true,
  },
  build: {
    target: 'es2022',
  },
  resolve: {
    alias: {
      '@nabla/engine': path.resolve(__dirname, '../src/index.ts'),
    },
  },
})
