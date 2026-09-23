import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { LoadingManager, type Mesh, type BufferAttribute } from 'three'
import type { GeoPoint } from '../src/geography.js'
import { decodePrepared, preparedPath } from './prepared-world.js'

/** Optional generated, texture-free GLBs. Preserve normal batching, selection and physics. */
export async function loadGlbWorld(
  origin: GeoPoint,
  key: string,
  signal: AbortSignal,
  base: string,
) {
  if (!base) return undefined
  const directory = `${base}/${preparedPath(origin, key).replace(/\.json$/, '.glb-tile')}/`
  try {
    const response = await fetch(directory + 'manifest.json', {
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    })
    if (!response.ok) return undefined
    const data = await response.json()
    if (data.format !== 'nabla-tile-glb-v1' || !Array.isArray(data.geometryIds))
      throw Error('Invalid GLB manifest')
    if (data.groundGridMetres && data.groundRevision !== 4)
      throw Error('Obsolete ground quantization')
    decodePrepared({ ...data, geometry: {} }, origin, key)
    const manager = new LoadingManager()
    manager.setURLModifier(() => {
      throw Error('Generated world GLBs must be self-contained')
    })
    const loader = new GLTFLoader(manager)
    const ids = new Set<string>(data.geometryIds)
    const geometry: Record<string, Record<string, ArrayBuffer>> = Object.create(null)
    for (const name of ['terrain', 'buildings-osm']) {
      const filename = data.files?.[name]
      if (filename !== name + '.glb') throw Error('Invalid layer filename')
      const result = await fetch(directory + filename + '?v=' + data.hashes?.[name], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      })
      if (!result.ok) throw Error('Missing GLB layer')
      const bytes = await result.arrayBuffer()
      if (bytes.byteLength > 128 * 1024 * 1024) throw Error('Oversized GLB')
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      if (hash !== data.hashes?.[name]) throw Error('GLB revision mismatch')
      const gltf = await loader.parseAsync(bytes, '')
      try {
        gltf.scene.traverse((node) => {
          const mesh = node as Mesh
          if (!mesh.isMesh) return
          const id = mesh.userData.entityId
          if (!ids.has(id) || geometry[id]) throw Error('Invalid GLB entity')
          const buffers: Record<string, ArrayBuffer> = {}
          for (const name of ['position', 'normal', 'color']) {
            const attr = mesh.geometry.getAttribute(name) as BufferAttribute | undefined
            if (!attr) continue
            if (attr.itemSize !== 3) throw Error('Invalid GLB attribute')
            if (
              attr.array instanceof Float32Array &&
              !attr.normalized &&
              attr.array.length === attr.count * 3
            ) {
              buffers[name] = new Float32Array(attr.array).buffer
              continue
            }
            const values = new Float32Array(attr.count * 3)
            for (let i = 0; i < attr.count; i++)
              values.set([attr.getX(i), attr.getY(i), attr.getZ(i)], i * 3)
            buffers[name] = values.buffer
          }
          if (mesh.geometry.index) buffers.index = new Uint32Array(mesh.geometry.index.array).buffer
          geometry[id] = buffers
        })
      } finally {
        gltf.scene.traverse((node) => {
          const mesh = node as Mesh
          if (!mesh.isMesh) return
          mesh.geometry.dispose()
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
            material.dispose()
        })
      }
      signal.throwIfAborted()
    }
    for (const id of data.emptyGeometryIds ?? []) {
      if (!ids.has(id) || geometry[id]) throw Error('Invalid empty geometry')
      geometry[id] = { position: new ArrayBuffer(0), normal: new ArrayBuffer(0) }
    }
    if (data.geometryIds.some((id: string) => !geometry[id])) throw Error('Incomplete GLB tile')
    return {
      ...decodePrepared({ ...data, geometry }, origin, key),
      artifact: {
        format: 'glb' as const,
        key,
        revision: data.groundRevision,
        directory,
        downloads: data.downloads,
      },
    }
  } catch (error) {
    if (import.meta.env.DEV) console.debug('GLB tile fallback', error)
    signal.throwIfAborted()
    return undefined
  }
}
