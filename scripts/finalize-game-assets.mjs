import { readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Remove only packed GLBs from the generated game, never authored sources.
const output = process.argv[2]
  ? path.resolve(process.argv[2]) + path.sep
  : fileURLToPath(new URL('../game-dist/', import.meta.url))
// Desktop, VR and AR are one release. Never silently ship only the desktop entry.
for (const page of [
  'index.html',
  'headset.html',
  'xr.html',
  'ar.html',
  'xr-demo.html',
  'ar-rc.html',
]) {
  const html = await readFile(path.join(output, page), 'utf8')
  const modules = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/g)]
  if (!modules.length) throw new Error(`Missing compiled entry script: ${page}`)
  for (const [, url] of modules) {
    if (!url.startsWith('/assets/') || !url.endsWith('.js'))
      throw new Error(`Unexpected production entry in ${page}: ${url}`)
    await readFile(path.join(output, url.slice(1)))
  }
}
console.log('Verified desktop, HeadSet, VR and AR pages in the same release')
const index = JSON.parse(await readFile(path.join(output, 'packs/index.json'), 'utf8'))
for (const url of Object.keys(index.entries)) {
  const target = path.resolve(output, '.' + url)
  if (!target.startsWith(output) || !target.endsWith('.glb')) {
    throw new Error(`Invalid packed output path: ${url}`)
  }
  await unlink(target)
}
console.log(`Published ${Object.keys(index.entries).length} GLBs inside the pack only`)
