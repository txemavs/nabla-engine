/**
 * Compressed planet tiles: `EXT_meshopt_compression` + `KHR_mesh_quantization` geometry and
 * `KHR_texture_basisu` (KTX2) textures. Everything here runs in the tile worker except
 * {@link detectCompressedTextureSupport}, which needs the renderer and runs on the main thread.
 *
 * Uncompressed GLBs never touch these paths: GLTFLoader only calls the decoders when a file
 * declares the extensions, so existing tiles and manifests load exactly as before.
 */
import { CompressedTexture, LoadingManager, type Texture } from 'three'
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'meshoptimizer'
import type { PlanetCompressedTexture } from '../../planet/contract.js'

/** GPU block formats the renderer can sample (the shape KTX2Loader's transcoder expects). */
export interface CompressedTextureSupport {
  astcSupported: boolean
  astcHDRSupported: boolean
  etc1Supported: boolean
  etc2Supported: boolean
  dxtSupported: boolean
  bptcSupported: boolean
  pvrtcSupported: boolean
}

/** No GPU format: Basis textures are transcoded to plain RGBA8 (always valid, 4× the VRAM). */
export const RGBA_ONLY_SUPPORT: CompressedTextureSupport = {
  astcSupported: false,
  astcHDRSupported: false,
  etc1Supported: false,
  etc2Supported: false,
  dxtSupported: false,
  bptcSupported: false,
  pvrtcSupported: false,
}

export const DEFAULT_BASIS_TRANSCODER_PATH = '/basis/'

/**
 * Main thread: read the renderer's compressed formats (WebGL2 extensions or WebGPU features)
 * with KTX2Loader's own rules, including its Linux/Mesa emulated-format filter.
 */
export function detectCompressedTextureSupport(renderer: unknown): CompressedTextureSupport {
  try {
    const loader = new KTX2Loader()
    loader.detectSupport(renderer as Parameters<KTX2Loader['detectSupport']>[0])
    const config = (loader as unknown as { workerConfig?: Partial<CompressedTextureSupport> })
      .workerConfig
    loader.dispose()
    return { ...RGBA_ONLY_SUPPORT, ...config }
  } catch {
    return RGBA_ONLY_SUPPORT
  }
}

/**
 * Worker: wire meshopt and KTX2 decoding into the tile GLTFLoader. The KTX2 loader gets its own
 * LoadingManager so the tile manager's "self-contained GLB" URL guard does not block the
 * transcoder download. Basis transcoding runs in KTX2Loader's nested workers, off the main thread.
 */
export function configureTileLoader(
  loader: GLTFLoader,
  options: { support?: CompressedTextureSupport; transcoderPath?: string } = {},
): { ktx2: KTX2Loader } {
  loader.setMeshoptDecoder(MeshoptDecoder)
  const ktx2 = new KTX2Loader(new LoadingManager())
  ktx2.setTranscoderPath(options.transcoderPath ?? DEFAULT_BASIS_TRANSCODER_PATH)
  ;(ktx2 as unknown as { workerConfig: CompressedTextureSupport }).workerConfig = {
    ...RGBA_ONLY_SUPPORT,
    ...options.support,
  }
  loader.setKTX2Loader(ktx2)
  return { ktx2 }
}

/** True for a texture produced by the KTX2 path (block-compressed or RGBA mip chain). */
export function isCompressedTileTexture(texture: Texture | null | undefined): boolean {
  return !!(texture as CompressedTexture | null | undefined)?.isCompressedTexture
}

/**
 * Copy a transcoded texture into a transferable payload: one owned ArrayBuffer per mip level, so
 * the worker can transfer them and dispose the source texture right after.
 */
export function compressedTexturePayload(texture: CompressedTexture): PlanetCompressedTexture {
  const mipmaps = (texture.mipmaps as { data: ArrayBufferView; width: number; height: number }[])
    .filter((m) => m?.data)
    .map((m) => ({
      data: new Uint8Array(
        m.data.buffer.slice(
          m.data.byteOffset,
          m.data.byteOffset + m.data.byteLength,
        ) as ArrayBuffer,
      ),
      width: m.width,
      height: m.height,
    }))
  if (!mipmaps.length) throw Error('Compressed tile texture has no mip data')
  return {
    width: texture.image.width,
    height: texture.image.height,
    format: texture.format as number,
    type: texture.type as number,
    colorSpace: texture.colorSpace,
    mipmaps,
  }
}

/** Bytes the compressed texture occupies on the GPU (sum of mip levels). */
export function compressedTextureBytes(texture: PlanetCompressedTexture): number {
  return texture.mipmaps.reduce((n, m) => n + m.data.byteLength, 0)
}
