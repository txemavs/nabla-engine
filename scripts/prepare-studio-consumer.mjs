import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Build/pack Engine first. This sibling contains no Engine source or aliases.
const root = fileURLToPath(new URL('../', import.meta.url))
const destination = path.resolve(root, '../studio-consumer')
const archive = process.argv[2] ?? '../engine-studio-test.tgz'
fs.mkdirSync(destination, { recursive: true })
fs.mkdirSync(path.join(destination, 'scripts'), { recursive: true })
fs.copyFileSync(
  path.join(root, 'scripts/typecheck-vue.cjs'),
  path.join(destination, 'scripts/typecheck-vue.cjs'),
)
fs.cpSync(path.join(root, 'studio'), path.join(destination, 'studio'), {
  recursive: true,
  filter: (source) => !/[/\\](test|e2e)([/\\]|$)/.test(source),
})
fs.copyFileSync(path.join(root, 'vite.config.ts'), path.join(destination, 'vite.config.ts'))
let config = fs.readFileSync(path.join(destination, 'vite.config.ts'), 'utf8')
config = config.replace(
  "publicDir: '../assets'",
  "publicDir: '../node_modules/@nabla/engine/assets'",
)
fs.writeFileSync(path.join(destination, 'vite.config.ts'), config)
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
fs.mkdirSync(path.join(destination, 'vendor'), { recursive: true })
fs.copyFileSync(
  path.join(root, 'vendor/nabla-desktop-0.2.0-studio.3.tgz'),
  path.join(destination, 'vendor/nabla-desktop-0.2.0-studio.3.tgz'),
)
fs.writeFileSync(
  path.join(destination, 'package.json'),
  JSON.stringify(
    {
      name: 'nabla-studio-package-check',
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite --host 0.0.0.0',
        build: 'vite build',
        typecheck: 'node scripts/typecheck-vue.cjs --noEmit',
      },
      dependencies: {
        '@nabla/engine': `file:${archive}`,
        '@nabla/desktop': pkg.devDependencies['@nabla/desktop'],
        three: pkg.dependencies.three,
        zod: pkg.dependencies.zod,
        vue: pkg.devDependencies.vue,
        pinia: pkg.devDependencies.pinia,
      },
      devDependencies: Object.fromEntries(
        [
          'vite',
          '@vitejs/plugin-vue',
          'typescript',
          'typescript-vue',
          'vue-tsc',
          '@types/three',
          '@types/node',
        ].map((key) => [key, pkg.devDependencies[key]]),
      ),
    },
    null,
    2,
  ) + '\n',
)
const ts = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'))
ts.include = ['studio', 'vite.config.ts']
fs.writeFileSync(path.join(destination, 'tsconfig.json'), JSON.stringify(ts, null, 2) + '\n')
console.log(destination)
