import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, get, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { terrainFolder, terrainFolderMiddleware } from '../../scripts/vite-terrain-folder.js'

describe('terrain folder static route', () => {
  let root: string, outside: string, server: Server, base: string
  const bytes = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251))
  beforeAll(async () => {
    const parent = mkdtempSync(path.join(tmpdir(), 'nabla-terrain-'))
    root = path.join(parent, 'data')
    outside = path.join(parent, 'secret.txt')
    const cell = path.join(root, 'z/15/16211/12003')
    mkdirSync(cell, { recursive: true })
    mkdirSync(path.join(root, 'z/15/16212/12003'), { recursive: true })
    mkdirSync(path.join(root, 'z/15/16213/12003'), { recursive: true })
    writeFileSync(path.join(cell, 'manifest.json'), '{"format":"nabla-planet-tile-v1"}')
    writeFileSync(path.join(root, 'z/15/16212/12003/manifest.json'), '{}')
    writeFileSync(path.join(cell, 'terrain-ad8550fe0459ce7d.glb'), bytes)
    writeFileSync(path.join(cell, '.hidden'), 'x')
    writeFileSync(outside, 'secret')
    symlinkSync(outside, path.join(cell, 'escape.txt'))
    const middleware = terrainFolderMiddleware(root, '/terrain')
    server = createServer((req, res) =>
      middleware(req, res, () => {
        res.statusCode = 418
        res.end('next')
      }),
    )
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
    rmSync(path.dirname(root), { recursive: true, force: true })
  })

  it('serves files byte for byte with type, length and cache headers', async () => {
    const glb = await fetch(`${base}/terrain/z/15/16211/12003/terrain-ad8550fe0459ce7d.glb`)
    expect(glb.status).toBe(200)
    expect(glb.headers.get('content-type')).toBe('model/gltf-binary')
    expect(glb.headers.get('content-length')).toBe('1000')
    expect(glb.headers.get('cache-control')).toMatch(/immutable/)
    expect(Buffer.from(await glb.arrayBuffer()).equals(bytes)).toBe(true)
    const manifest = await fetch(`${base}/terrain/z/15/16211/12003/manifest.json`)
    expect(manifest.headers.get('cache-control')).toBe('no-cache')
    expect(manifest.headers.get('content-type')).toBe('application/json')
    expect(await manifest.json()).toEqual({ format: 'nabla-planet-tile-v1' })
  })

  it('answers HEAD and a single byte range', async () => {
    const url = `${base}/terrain/z/15/16211/12003/terrain-ad8550fe0459ce7d.glb`
    const head = await fetch(url, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('content-length')).toBe('1000')
    const part = await fetch(url, { headers: { Range: 'bytes=10-19' } })
    expect(part.status).toBe(206)
    expect(part.headers.get('content-range')).toBe('bytes 10-19/1000')
    expect(Buffer.from(await part.arrayBuffer()).equals(bytes.subarray(10, 20))).toBe(true)
    const tail = await fetch(url, { headers: { Range: 'bytes=-5' } })
    expect(Buffer.from(await tail.arrayBuffer()).equals(bytes.subarray(995))).toBe(true)
    expect((await fetch(url, { headers: { Range: 'bytes=5000-' } })).status).toBe(416)
  })

  it('lists the tiles that have a manifest', async () => {
    const response = await fetch(`${base}/terrain/index.json`)
    expect(await response.json()).toEqual({
      tiles: [
        { z: 15, x: 16211, y: 12003 },
        { z: 15, x: 16212, y: 12003 },
      ],
    })
  })

  it('is read-only and never leaves the folder', async () => {
    const cell = `${base}/terrain/z/15/16211/12003`
    expect((await fetch(`${cell}/manifest.json`, { method: 'PUT', body: 'x' })).status).toBe(405)
    expect((await fetch(`${cell}/manifest.json`, { method: 'DELETE' })).status).toBe(405)
    expect((await fetch(`${cell}/.hidden`)).status).toBe(404)
    expect((await fetch(`${cell}/escape.txt`)).status).toBe(404) // symlink to outside
    // fetch() normalises dot segments away, so send the raw request line.
    const raw = (target: string) =>
      new Promise<number>((resolve) => {
        const { port } = server.address() as AddressInfo
        get({ host: '127.0.0.1', port, path: target }, (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        })
      })
    expect(await raw('/terrain/../secret.txt')).not.toBe(200)
    expect(await raw('/terrain/z/15/../../../secret.txt')).not.toBe(200)
    expect(await raw('/terrain/%2e%2e/secret.txt')).not.toBe(200)
    expect((await fetch(`${base}/terrain/z/15/..%2f..%2f..%2fsecret.txt`)).status).toBe(404)
    expect((await fetch(`${base}/terrain/z/15/%00`)).status).toBe(404)
    expect((await fetch(`${base}/terrain/z/15/16211`)).status).toBe(404) // no directory listing
    expect((await fetch(`${cell}/missing.glb`)).status).toBe(404)
  })

  it('passes other URLs on and is inert without a folder', async () => {
    expect((await fetch(`${base}/other`)).status).toBe(418)
    expect((await fetch(`${base}/terrainx/a`)).status).toBe(418)
    const plugin = terrainFolder({})
    const used: unknown[] = []
    ;(plugin.configureServer as (s: unknown) => void)({
      middlewares: { use: (m: unknown) => used.push(m) },
    })
    expect(used).toEqual([])
    const active = terrainFolder({ NABLA_TERRAIN_DIR: root, NABLA_TERRAIN_ROUTE: '/atlas' })
    ;(active.configureServer as (s: unknown) => void)({
      middlewares: { use: (m: unknown) => used.push(m) },
    })
    expect(used).toHaveLength(1)
  })
})
