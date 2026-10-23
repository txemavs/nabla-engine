import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CompressedTexture,
  LinearSRGBColorSpace,
  Mesh,
  RGBA_BPTC_Format,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { convertPlanetGlbMesh } from '../../src/render/planet/convert-mesh.js'
import {
  compressedTextureBytes,
  compressedTexturePayload,
  configureTileLoader,
  detectCompressedTextureSupport,
  isCompressedTileTexture,
  RGBA_ONLY_SUPPORT,
} from '../../src/render/planet/tile-compression.js'

// GLTFLoader reads `self.URL` for embedded images, as in the tile worker.
;(globalThis as { self?: unknown }).self ??= globalThis

const fixture = (name: string) => {
  const bytes = readFileSync(new URL(`../planet/fixtures/${name}`, import.meta.url))
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** Stand-in for the KTX2 texture: Node has no nested workers for the Basis transcoder. */
function fakeKtx2(loader: GLTFLoader) {
  const ktx2 = {
    setTranscoderPath: () => ktx2,
    detectSupport: () => ktx2,
    dispose: () => {},
    load: (_url: string, onLoad: (t: CompressedTexture) => void) => {
      const mips = [
        { data: new Uint8Array(16 * 16), width: 16, height: 16 },
        { data: new Uint8Array(8 * 8), width: 8, height: 8 },
      ]
      mips[0].data.fill(7)
      onLoad(new CompressedTexture(mips as never, 16, 16, RGBA_BPTC_Format, UnsignedByteType))
    },
  }
  loader.setKTX2Loader(ktx2 as never)
}

async function parseMeshes(name: string, ktx2 = true) {
  const loader = new GLTFLoader()
  configureTileLoader(loader)
  if (ktx2) fakeKtx2(loader)
  const gltf = await loader.parseAsync(fixture(name), '')
  gltf.scene.updateMatrixWorld(true)
  const meshes: Mesh[] = []
  gltf.scene.traverse((n) => (n as Mesh).isMesh && meshes.push(n as Mesh))
  return { gltf, meshes }
}

describe('compressed planet tiles', () => {
  it('fixture declares meshopt, quantization and KTX2', () => {
    const bytes = new Uint8Array(fixture('tile-meshopt-ktx2.glb'))
    const len = new DataView(bytes.buffer).getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)))
    expect(json.extensionsRequired).toEqual(
      expect.arrayContaining([
        'EXT_meshopt_compression',
        'KHR_mesh_quantization',
        'KHR_texture_basisu',
      ]),
    )
  })

  it('decodes meshopt + quantized geometry to the same float32 arrays as the plain GLB', async () => {
    const plain = await parseMeshes('tile-plain.glb', false)
    const packed = await parseMeshes('tile-meshopt-ktx2.glb')
    expect(packed.meshes).toHaveLength(1)
    const opts = { kind: 'terrain', anchorAltitude: 0 }
    const a = convertPlanetGlbMesh(plain.meshes[0], opts)!.mesh
    const b = convertPlanetGlbMesh(packed.meshes[0], opts)!.mesh
    expect(b.position).toBeInstanceOf(Float32Array)
    expect(b.normal).toBeInstanceOf(Float32Array)
    expect(b.uv).toBeInstanceOf(Float32Array)
    expect(b.index!.length).toBe(a.index!.length)
    // Vertex order may change (meshopt reorders); compare as sorted position sets.
    const key = (p: Float32Array) =>
      Array.from({ length: p.length / 3 }, (_, i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]).sort(
        (x, y) => x[0] - y[0] || x[2] - y[2],
      )
    const pa = key(a.position),
      pb = key(b.position)
    for (let i = 0; i < pa.length; i++)
      for (let k = 0; k < 3; k++) expect(Math.abs(pa[i][k] - pb[i][k])).toBeLessThan(0.01)
    for (let i = 0; i < b.uv!.length; i++) {
      expect(b.uv![i]).toBeGreaterThanOrEqual(-1e-4)
      expect(b.uv![i]).toBeLessThanOrEqual(1 + 1e-4)
    }
    for (let i = 1; i < b.normal.length; i += 3) expect(b.normal[i]).toBeCloseTo(1, 2)
  })

  it('turns a KTX2 texture into a transferable compressed payload, not an image', async () => {
    const { meshes } = await parseMeshes('tile-meshopt-ktx2.glb')
    const converted = convertPlanetGlbMesh(meshes[0], { kind: 'terrain', anchorAltitude: 0 })!
    expect(converted.image).toBeUndefined()
    const map = converted.mesh.compressedMap!
    expect(map.format).toBe(RGBA_BPTC_Format)
    expect(map.colorSpace).toBe(SRGBColorSpace)
    expect(map.mipmaps.map((m) => m.width)).toEqual([16, 8])
    expect(map.mipmaps[0].data[0]).toBe(7)
    // Each mip owns its buffer, so the worker can transfer them independently.
    expect(new Set(map.mipmaps.map((m) => m.data.buffer)).size).toBe(2)
    expect(map.mipmaps[0].data.byteOffset).toBe(0)
    expect(compressedTextureBytes(map)).toBe(256 + 64)
  })

  it('leaves plain textures on the ImageBitmap path', () => {
    expect(isCompressedTileTexture(undefined)).toBe(false)
    const t = new CompressedTexture([], 1, 1)
    expect(isCompressedTileTexture(t)).toBe(true)
    expect(() => compressedTexturePayload(t)).toThrow()
    t.colorSpace = LinearSRGBColorSpace
  })

  it('detects renderer formats with RGBA fallback', () => {
    expect(detectCompressedTextureSupport(undefined)).toEqual(RGBA_ONLY_SUPPORT)
    const webgpu = {
      isWebGPURenderer: true,
      hasFeature: (f: string) => f === 'texture-compression-bc',
    }
    expect(detectCompressedTextureSupport(webgpu)).toMatchObject({
      bptcSupported: true,
      astcSupported: false,
    })
    const webgl = {
      extensions: {
        has: (e: string) => e === 'WEBGL_compressed_texture_astc',
        get: () => ({ getSupportedProfiles: () => ['ldr'] }),
      },
    }
    expect(detectCompressedTextureSupport(webgl)).toMatchObject({ astcSupported: true })
  })
})
