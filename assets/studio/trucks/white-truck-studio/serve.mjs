import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const engine = process.argv[2] ?? process.env.NABLA_ENGINE
if (!engine) throw new Error('Usage: node serve.mjs C:/path/to/nabla-engine [port]')
const dependencies = resolve(engine, 'node_modules')
const port = Number(process.argv[3] ?? 8796)
const mime = {
  '.html': 'text/html',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
}
const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const dependency = url.startsWith('/deps/')
    const base = dependency ? dependencies : root
    const relative = dependency ? url.slice(6) : url.slice(1) || 'index.html'
    if (
      dependency &&
      !relative.startsWith('three/') &&
      !relative.startsWith('@dimforge/rapier3d-compat/')
    )
      throw new Error('Forbidden')
    const path = resolve(base, relative)
    if (!path.startsWith(base + sep) || !(await stat(path)).isFile()) throw new Error('Not found')
    const data = await readFile(path)
    res.writeHead(200, {
      'Content-Type': mime[extname(path)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
})
server.listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}`))
