import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const root = new URL('../studio/', import.meta.url)
let checked = 0
for (const entry of fs.readdirSync(root, { recursive: true })) {
  if (!/\.(ts|vue|html)$/.test(entry) || /^(test|e2e)[\\/]/.test(entry)) continue
  const source = fs.readFileSync(new URL(entry.split(path.sep).join('/'), root), 'utf8')
  assert(
    !/(?:\.\.\/)+(?:src|services)\/|#(?:src|world-cache)\//.test(source),
    `Private Engine dependency in ${entry}`,
  )
  checked++
}
assert(
  !/alias:/.test(fs.readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')),
  'Studio must resolve package exports without source aliases',
)
console.log(`Studio package boundary: ${checked} application files checked`)
