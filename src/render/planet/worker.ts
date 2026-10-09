import { planetChart } from './chart.js'
import { convertPlanetGlbMesh } from './convert-mesh.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { LoadingManager, Mesh } from 'three'
import {
  applyCandidateAsphaltPolicy,
  isCandidateRoadKind,
  planetCellVersion,
  planetCollisionChunks,
  planetGlbCacheKey,
  planetTileGlbLayers,
  type PlanetLayerFile,
  type PlanetManifest,
  type PlanetMesh,
  type PlanetPayload,
} from '../../planet/index.js'
import type { PlanetGlbKind } from '../../planet/contract.js'
import { mapCache } from './cache.js'
import { sha256 } from '../../util/sha256.js'
import { buildDrapes } from './drape.js'
const controllers = new Map<number, AbortController>()
/** Download, verify and decode a package orthophoto, flipped so the texture needs no `flipY`. */
async function loadPhoto(
  url: string,
  photo: { bytes: number; sha256: string },
  phase: <T>(name: 'fetch' | 'verify' | 'photo', work: () => Promise<T> | T) => Promise<T>,
): Promise<ImageBitmap> {
  const cache = mapCache('nabla-planet-photo-v1')
  const bytes = await phase('fetch', async () => {
    let response = await cache.match(url).catch(() => undefined)
    if (!response) response = await fetch(url, { signal: AbortSignal.timeout(60000) })
    if (!response.ok) throw Error(`Photo HTTP ${response.status}`)
    return response.arrayBuffer()
  })
  if (bytes.byteLength !== photo.bytes) throw Error('Photo size mismatch')
  if ((await phase('verify', () => sha256(bytes))) !== photo.sha256)
    throw Error('Photo checksum mismatch')
  await phase('fetch', () => cache.put(url, new Response(bytes.slice(0))).catch(() => {}))
  return phase('photo', () => createImageBitmap(new Blob([bytes]), { imageOrientation: 'flipY' }))
}
self.onmessage = async (
  event: MessageEvent<{
    id: number
    manifest: PlanetManifest
    directory: string
    buildings?: boolean
    /** Load `roads.files.collision` / `roadCandidates.layers.collision` as an inspect mesh. Default off. */
    inspectRoadCollision?: boolean
    /** Show v2+ OSM road asphalt as an inspect-only mesh (visible, no collision). Default off. */
    osmRoads?: boolean
    /** Package photo to drape: the projected layer ids and the cell's ground width in metres. */
    drape?: { layers: string[]; width: number }
    cancel?: boolean
  }>,
) => {
  const { id, manifest, directory, cancel } = event.data
  if (cancel) {
    controllers.get(id)?.abort()
    return
  }
  const controller = new AbortController()
  controllers.set(id, controller)
  const meshes: PlanetMesh[] = []
  const photos: { mesh: PlanetMesh; image: CanvasImageSource }[] = []
  let vegetation: { position: [number, number, number]; size: [number, number] }[] = []
  let bytesTotal = 0
  /** Road layer files that failed (the cell still loads; a fallback file may have been used). */
  const roadErrors: string[] = []
  /** Milliseconds per phase, reported with the payload so slow cells can be explained. */
  const timings = { fetch: 0, verify: 0, parse: 0, photo: 0, collision: 0 }
  const phase = async <T>(name: keyof typeof timings, work: () => Promise<T> | T): Promise<T> => {
    const started = performance.now()
    try {
      return await work()
    } finally {
      timings[name] += performance.now() - started
    }
  }
  try {
    const manager = new LoadingManager()
    manager.setURLModifier((url) => {
      // Embedded roof photos are blob URLs created from the GLB buffer.
      if (url.startsWith('blob:') || url.startsWith('data:')) return url
      throw Error('Planet GLBs must be self-contained')
    })
    const loader = new GLTFLoader(manager)
    /** Download, verify (size + SHA-256, in the worker) and convert one GLB layer into `meshes`. */
    const loadLayer = async (name: string, file: PlanetLayerFile, kind: PlanetGlbKind) => {
      const url = directory + file.path
      const cache = mapCache('nabla-planet-glb-v2')
      const cacheKey = planetGlbCacheKey(url, file, kind)
      const bytes = await phase('fetch', async () => {
        let response = await cache.match(cacheKey).catch(() => undefined)
        if (!response)
          response = await fetch(url, {
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]),
          })
        if (!response.ok) throw Error(`GLB HTTP ${response.status}`)
        return response.arrayBuffer()
      })
      if (bytes.byteLength !== file.bytes) throw Error('GLB size mismatch')
      // The check runs here, in the worker, never on the main thread.
      const hash = await phase('verify', () => sha256(bytes))
      if (hash !== file.sha256) throw Error('GLB checksum mismatch')
      await phase('fetch', () => cache.put(cacheKey, new Response(bytes)).catch(() => {}))
      bytesTotal += bytes.byteLength
      const gltf = await phase('parse', () => loader.parseAsync(bytes, ''))
      const convertStarted = performance.now()
      gltf.scene.updateMatrixWorld(true)
      try {
        photos.length = 0
        gltf.scene.traverse((node) => {
          if (name === 'terrain' && Array.isArray(node.userData.nablaTile?.vegetation))
            vegetation = node.userData.nablaTile.vegetation
              .filter(
                (v: any) =>
                  Array.isArray(v.position) &&
                  v.position.length === 3 &&
                  v.position.every(Number.isFinite) &&
                  Array.isArray(v.size) &&
                  v.size.length === 2 &&
                  v.size.every((n: number) => Number.isFinite(n) && n > 0 && n < 100),
              )
              .slice(0, 20000)
          const mesh = node as Mesh
          if (!mesh.isMesh) return
          const converted = convertPlanetGlbMesh(mesh, {
            kind,
            anchorAltitude: manifest.anchor.altitude,
          })
          if (!converted) return
          meshes.push(converted.mesh)
          if (converted.image) photos.push({ mesh: converted.mesh, image: converted.image })
        })
        timings.parse += performance.now() - convertStarted
        for (const photo of photos) {
          // Copy before the source material is disposed. That dispose closes the original bitmap.
          photo.mesh.map = await phase('photo', () => createImageBitmap(photo.image))
        }
      } finally {
        gltf.scene.traverse((node) => {
          const m = node as Mesh
          if (m.isMesh) {
            m.geometry.dispose()
            for (const material of Array.isArray(m.material) ? m.material : [m.material])
              material.dispose()
          }
        })
      }
    }
    for (const layer of planetTileGlbLayers(manifest, {
      buildings: event.data.buildings !== false,
      inspectRoadCollision: event.data.inspectRoadCollision === true,
    })) {
      if (!isCandidateRoadKind(layer.kind)) {
        // Terrain and buildings are the cell: a failure fails the cell.
        await loadLayer(layer.name, layer.file, layer.kind)
        continue
      }
      // Road layers (asphalt, bridge supports) fall back per layer and never fail the cell.
      const files = layer.fallback ? [layer.file, layer.fallback] : [layer.file]
      for (const file of files) {
        const before = meshes.length
        try {
          await loadLayer(layer.name, file, layer.kind)
          break
        } catch (error) {
          if (controller.signal.aborted) throw error
          meshes.length = before
          roadErrors.push(`${layer.name} ${file.path}: ${String(error)}`)
        }
      }
    }
    if (roadErrors.length) console.warn('Planet road layers:', manifest.id, roadErrors)
    // v2+ terrain.lidar already has the ground road. The separate OSM road asphalt (ground-road,
    // elevated-or-unresolved, untagged) is dropped here — before the orthophoto drape and collision
    // — so no ghost road plane floats over the fused terrain or collides; with `osmRoads` it stays
    // as an inspect-only mesh. Bridge-deck asphalt and supports always stay (bridges have priority).
    applyCandidateAsphaltPolicy(meshes, planetCellVersion(manifest), {
      osmRoads: event.data.osmRoads === true,
    })
    // The orthophoto drape: geometry cut here, photo downloaded, verified and decoded here, so the
    // main thread only wraps the arrays. A photo failure leaves the cell playable without it.
    let drape: PlanetPayload['drape']
    if (event.data.drape && manifest.photo) {
      const baked = new Set<string>(
        meshes.filter((m) => m.name === 'Drape' && m.map).map((m) => String(m.metadata.drape)),
      )
      const layers = await phase('photo', () =>
        buildDrapes(meshes, {
          width: event.data.drape!.width,
          layers: new Set(event.data.drape!.layers),
          baked,
        }),
      )
      drape = { layers }
      if (layers.length)
        try {
          drape.photo = await loadPhoto(directory + manifest.photo.path, manifest.photo, phase)
          if (manifest.roofPhoto)
            drape.roofPhoto = await loadPhoto(
              directory + manifest.roofPhoto.path,
              manifest.roofPhoto,
              phase,
            )
        } catch (error) {
          drape.error = String(error)
        }
    }
    const collisionStarted = performance.now()
    const chunks = planetCollisionChunks(meshes)
    const chart = planetChart(meshes)
    timings.collision = performance.now() - collisionStarted
    controller.signal.throwIfAborted()
    const transfers = [
      ...meshes.flatMap((m) => [
        m.position.buffer,
        m.normal.buffer,
        ...(m.color ? [m.color.buffer] : []),
        ...(m.index ? [m.index.buffer] : []),
        ...(m.uv ? [m.uv.buffer] : []),
      ]),
      ...chunks.map((c) => c.triangles.buffer),
      ...meshes.flatMap((m) => (m.map ? [m.map] : [])),
      ...(drape?.layers.flatMap((d) => [d.position.buffer, d.uv.buffer]) ?? []),
      ...(drape?.photo ? [drape.photo] : []),
      ...(drape?.roofPhoto ? [drape.roofPhoto] : []),
    ] as Transferable[]
    self.postMessage(
      {
        id,
        payload: {
          meshes,
          chart,
          chunks,
          bytes: bytesTotal,
          buildings: event.data.buildings !== false,
          vegetation,
          timings,
          drape,
          ...(roadErrors.length ? { roadErrors } : {}),
        },
      },
      { transfer: [...transfers, ...(chart ? [chart.bitmap] : [])] },
    )
  } catch (error) {
    self.postMessage({ id, error: String(error) })
  } finally {
    controllers.delete(id)
  }
}
