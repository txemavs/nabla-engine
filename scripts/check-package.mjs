/** Build first. Install the real tarball in an isolated host and exercise only public imports. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const consumer = mkdtempSync(path.join(tmpdir(), 'nabla-package-'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const runNpm = (args) =>
  execFileSync(npm, args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' })
try {
  const [packed] = JSON.parse(runNpm(['pack', '--json', '--pack-destination', consumer]))
  assert(!packed.files.some((file) => /^(studio|src|test|node_modules)\//.test(file.path)))
  writeFileSync(
    path.join(consumer, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  )
  runNpm([
    'install',
    '--prefix',
    consumer,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    path.join(consumer, packed.filename),
  ])
  const installed = path.join(consumer, 'node_modules/@nabla/engine')
  const manifest = JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8'))
  const imports = []
  for (const [subpath, targets] of Object.entries(manifest.exports)) {
    assert(existsSync(path.join(installed, targets.import)), `Missing runtime export: ${subpath}`)
    assert(existsSync(path.join(installed, targets.types)), `Missing type export: ${subpath}`)
    imports.push(
      `await import(${JSON.stringify('@nabla/engine' + (subpath === '.' ? '' : subpath.slice(1)))});`,
    )
  }
  writeFileSync(path.join(consumer, 'exports.mjs'), imports.join('\n'))
  execFileSync(process.execPath, ['exports.mjs'], { cwd: consumer, stdio: 'inherit' })
  for (const example of readdirSync(path.join(root, 'examples/modularity')).filter((name) =>
    name.endsWith('.mjs'),
  )) {
    copyFileSync(path.join(root, 'examples/modularity', example), path.join(consumer, example))
    execFileSync(process.execPath, [example], { cwd: consumer, stdio: 'inherit' })
  }
  copyFileSync(
    path.join(root, 'examples/modularity/public-types.mts'),
    path.join(consumer, 'public-types.mts'),
  )
  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules/typescript/bin/tsc'),
      '--ignoreConfig',
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'es2022',
      '--module',
      'nodenext',
      '--moduleResolution',
      'nodenext',
      path.join(consumer, 'public-types.mts'),
    ],
    { cwd: consumer, stdio: 'inherit' },
  )
  console.log(
    `Packaged consumer: ${imports.length} public entries and all Node examples/type contracts passed.`,
  )
} finally {
  rmSync(consumer, { recursive: true, force: true })
}
