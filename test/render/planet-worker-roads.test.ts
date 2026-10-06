import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PlanetManifest } from '../../src/planet/index.js'
import { PLANET_GEOMETRY_REVISION } from '../../src/planet/contract.js'
import { sha256 } from '../../src/util/sha256.js'
import { mapTileBounds, mapTileId, mapTileSample, type MapTile } from '../../src/scene/mercator.js'

// The chart paints on an OffscreenCanvas, which Node does not have.
vi.mock('../../src/render/planet/chart.js', () => ({ planetChart: () => undefined }))

/** One-triangle glTF 2.0 binary, POSITION only (the Atlas candidate shape), at sea level. */
function triangleGlb(): ArrayBuffer {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const json = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        max: [1, 1, 0],
        min: [0, 0, 0],
      },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 }],
    buffers: [{ byteLength: 36 }],
  })
  const jsonBytes = new TextEncoder().encode(json)
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4
  const jsonChunk = 8 + jsonBytes.length + jsonPad
  const total = 12 + jsonChunk + 8 + positions.byteLength
  const out = new ArrayBuffer(total)
  const view = new DataView(out)
  const bytes = new Uint8Array(out)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonBytes.length + jsonPad, true)
  view.setUint32(16, 0x4e4f534a, true)
  bytes.set(jsonBytes, 20)
  bytes.fill(0x20, 20 + jsonBytes.length, 20 + jsonBytes.length + jsonPad)
  const binOff = 12 + jsonChunk
  view.setUint32(binOff, positions.byteLength, true)
  view.setUint32(binOff + 4, 0x004e4942, true)
  bytes.set(new Uint8Array(positions.buffer), binOff + 8)
  return out
}

const tile: MapTile = { z: 15, x: 16224, y: 11998 }
const glb = triangleGlb()
let file: { bytes: number; sha256: string }
const posted: any[] = []
const realFetch = globalThis.fetch
/** The worker's global scope: `onmessage` is set by the module, `postMessage` collects replies. */
const scope: { onmessage?: (event: unknown) => Promise<void>; postMessage: (m: unknown) => void } =
  {
    postMessage: (message) => posted.push(message),
  }

function manifest(roads: PlanetManifest['roads']): PlanetManifest {
  return {
    format: 'nabla-planet-tile-v1',
    generator: 'native-xyz-v2',
    geometryRevision: PLANET_GEOMETRY_REVISION,
    id: mapTileId(tile),
    tile,
    anchor: mapTileSample(tile, 1, 1, 2),
    bounds: mapTileBounds(tile),
    files: {
      terrain: { path: 'terra-15-16224-11998-202610051200.glb', download: 't.glb', ...file },
      'buildings-osm': {
        path: 'build-15-16224-11998-202610051200.glb',
        download: 'b.glb',
        ...file,
      },
    },
    roads,
  }
}

/** Serve every GLB except the listed missing paths. */
function serve(missing: string[]) {
  globalThis.fetch = (async (url: string) =>
    missing.some((path) => url.endsWith(path))
      ? new Response(null, { status: 404 })
      : new Response(glb.slice(0))) as typeof fetch
}

async function run(m: PlanetManifest) {
  posted.length = 0
  await scope.onmessage!({ data: { id: 1, manifest: m, directory: '/z/15/16224/11998/' } })
  return posted[0]
}

beforeAll(async () => {
  file = { bytes: glb.byteLength, sha256: await sha256(glb) }
  ;(globalThis as any).self = scope
  await import('../../src/render/planet/worker.js')
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('planet worker road layers', () => {
  const supports = (path: string) => ({ path, download: path, ...file })

  it('loads the fallback supports file when the primary one is missing', async () => {
    serve(['supports-candidate-aaaaaaaaaaaaaaaa.glb'])
    const message = await run(
      manifest({
        files: {
          supports: {
            ...supports('supports-candidate-aaaaaaaaaaaaaaaa.glb'),
            fallback: supports('supports-candidate-bbbbbbbbbbbbbbbb.glb'),
          },
        },
      }),
    )
    expect(message.error).toBeUndefined()
    expect(message.payload.meshes.some((m: any) => m.metadata.category === 'Roads')).toBe(true)
    expect(message.payload.roadErrors).toEqual([expect.stringContaining('GLB HTTP 404')])
  })

  it('keeps the cell when a road layer cannot be loaded at all', async () => {
    serve(['supports-candidate-aaaaaaaaaaaaaaaa.glb'])
    const message = await run(
      manifest({ files: { supports: supports('supports-candidate-aaaaaaaaaaaaaaaa.glb') } }),
    )
    expect(message.error).toBeUndefined()
    expect(message.payload.meshes.length).toBeGreaterThan(0)
    expect(message.payload.roadErrors).toHaveLength(1)
  })

  it('still fails the cell when the terrain cannot be loaded', async () => {
    serve(['terra-15-16224-11998-202610051200.glb'])
    const message = await run(manifest(undefined))
    expect(message.error).toMatch(/GLB HTTP 404/)
  })
})
