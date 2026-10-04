/**
 * Serve a terrain folder (`<root>/z/15/<x>/<y>/…`, e.g. nabla-atlas output) read-only from the Vite dev
 * server, so the game loads it same-origin: `?terrain=/terrain` reads `/terrain/z/15/<x>/<y>/manifest.json`.
 *
 *   NABLA_TERRAIN_DIR    folder that contains `z/` (mount it read-only); unset = plugin does nothing
 *   NABLA_TERRAIN_ROUTE  URL prefix, default `/terrain`
 *
 * GET/HEAD only, single `Range`, no directory listings except `<route>/index.json` (the z15 tiles that have
 * a manifest), no path outside the root, no dot files. The folder is never written.
 */
import { createReadStream } from 'node:fs'
import { readdir, realpath, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'

const TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.md': 'text/markdown; charset=utf-8',
  '.gz': 'application/gzip',
}
type Next = (error?: unknown) => void

function send(res: ServerResponse, status: number, body: string, type = 'text/plain') {
  res.statusCode = status
  res.setHeader('Content-Type', `${type}; charset=utf-8`)
  res.end(body)
}

/** Node middleware serving `root` under `route`. Exported for tests. */
export function terrainFolderMiddleware(root: string, route = '/terrain') {
  const prefix = '/' + route.replace(/^\/+|\/+$/g, '')
  let rootReal: Promise<string> | undefined
  const tiles = async (base: string) => {
    const found: { z: 15; x: number; y: number }[] = []
    const xs = await readdir(path.join(base, 'z', '15')).catch(() => [])
    for (const x of xs.filter((name) => /^\d+$/.test(name)).sort((a, b) => Number(a) - Number(b)))
      for (const y of (await readdir(path.join(base, 'z', '15', x)).catch(() => []))
        .filter((name) => /^\d+$/.test(name))
        .sort((a, b) => Number(a) - Number(b)))
        if (await stat(path.join(base, 'z', '15', x, y, 'manifest.json')).catch(() => undefined))
          found.push({ z: 15, x: Number(x), y: Number(y) })
    return found
  }
  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== prefix && !url.pathname.startsWith(prefix + '/')) return next()
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD')
        return send(res, 405, 'Method not allowed')
      }
      let relative: string
      try {
        relative = decodeURIComponent(url.pathname.slice(prefix.length)).replace(/^\/+/, '')
      } catch {
        return send(res, 400, 'Bad path')
      }
      if (relative.includes('\0') || relative.split(/[\\/]/).some((part) => part.startsWith('.')))
        return send(res, 404, 'Not found')
      const base = await (rootReal ??= realpath(root))
      if (relative === 'index.json') {
        const body = JSON.stringify({ tiles: await tiles(base) })
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-cache')
        return res.end(req.method === 'HEAD' ? undefined : body)
      }
      const file = path.resolve(base, relative)
      if (file !== base && !file.startsWith(base + path.sep)) return send(res, 404, 'Not found')
      const real = await realpath(file).catch(() => undefined)
      if (!real || (real !== base && !real.startsWith(base + path.sep)))
        return send(res, 404, 'Not found')
      const info = await stat(real)
      if (!info.isFile()) return send(res, 404, 'Not found')
      res.setHeader(
        'Content-Type',
        TYPES[path.extname(real).toLowerCase()] ?? 'application/octet-stream',
      )
      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader('Last-Modified', info.mtime.toUTCString())
      // Atlas names every payload by content hash, so those never change; the manifest does.
      res.setHeader(
        'Cache-Control',
        /-[a-f0-9]{16}\.[a-z.]+$/.test(real) ? 'public, max-age=31536000, immutable' : 'no-cache',
      )
      let start = 0,
        end = info.size - 1
      const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''))
      if (range && (range[1] || range[2])) {
        if (range[1]) {
          start = Number(range[1])
          if (range[2]) end = Math.min(end, Number(range[2]))
        } else {
          start = Math.max(0, info.size - Number(range[2]))
        }
        if (start > end || start >= info.size) {
          res.setHeader('Content-Range', `bytes */${info.size}`)
          return send(res, 416, 'Range not satisfiable')
        }
        res.statusCode = 206
        res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`)
      }
      res.setHeader('Content-Length', end - start + 1)
      if (req.method === 'HEAD' || info.size === 0) return res.end()
      createReadStream(real, { start, end })
        .on('error', () => res.destroy())
        .pipe(res)
    } catch (error) {
      next(error)
    }
  }
}

/** Vite plugin: dev and preview servers expose `NABLA_TERRAIN_DIR` read-only under `NABLA_TERRAIN_ROUTE`. */
export function terrainFolder(env: Record<string, string | undefined> = process.env): Plugin {
  const dir = env.NABLA_TERRAIN_DIR
  const route = env.NABLA_TERRAIN_ROUTE || '/terrain'
  return {
    name: 'nabla-terrain-folder',
    configureServer(server) {
      if (dir) server.middlewares.use(terrainFolderMiddleware(dir, route))
    },
    configurePreviewServer(server) {
      if (dir) server.middlewares.use(terrainFolderMiddleware(dir, route))
    },
  }
}
