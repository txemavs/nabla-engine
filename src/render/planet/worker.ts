import { seaCoverageIndex } from '../../planet/sea-coverage.js'
import { planetChart } from './chart.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { LoadingManager, Mesh, MeshStandardMaterial, Matrix3, Vector3 } from 'three'
import {
  planetCollisionChunks,
  type PlanetManifest,
  type PlanetMesh,
  type PlanetPayload,
} from '../../planet/index.js'
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
    for (const name of ['terrain', 'buildings-osm'] as const) {
      if (name === 'buildings-osm' && event.data.buildings === false) continue
      const file = manifest.files[name],
        url = directory + file.path
      const cache = mapCache('nabla-planet-glb-v2')
      const bytes = await phase('fetch', async () => {
        let response = await cache.match(url).catch(() => undefined)
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
      await phase('fetch', () => cache.put(url, new Response(bytes)).catch(() => {}))
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
          const g = mesh.geometry,
            position = g.getAttribute('position'),
            normal = g.getAttribute('normal'),
            color = g.getAttribute('color'),
            uvAttr = g.getAttribute('uv')
          if (!position || !normal || position.count > 4000000) throw Error('Invalid planet mesh')
          const p = new Float32Array(position.count * 3),
            n = new Float32Array(position.count * 3),
            c = color ? new Float32Array(position.count * 3) : undefined,
            uv = uvAttr ? new Float32Array(uvAttr.count * 2) : undefined
          const nm = new Matrix3().getNormalMatrix(mesh.matrixWorld)
          for (let i = 0; i < position.count; i++) {
            p.set(
              new Vector3()
                .fromBufferAttribute(position, i)
                .applyMatrix4(mesh.matrixWorld)
                .toArray(),
              i * 3,
            )
            n.set(
              new Vector3().fromBufferAttribute(normal, i).applyMatrix3(nm).normalize().toArray(),
              i * 3,
            )
            if (c && color) c.set([color.getX(i), color.getY(i), color.getZ(i)], i * 3)
            if (uv && uvAttr) uv.set([uvAttr.getX(i), uvAttr.getY(i)], i * 2)
          }
          if (!p.every(Number.isFinite) || !n.every(Number.isFinite))
            throw Error('Invalid GLB coordinates')
          const material = (
            Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
          ) as MeshStandardMaterial
          const originalIndex = g.index ? new Uint32Array(g.index.array) : undefined
          const index = seaCoverageIndex(p, originalIndex, mesh.userData, manifest.anchor.altitude)
          if (index?.length === 0) return
          const metadata = { ...mesh.userData }
          // Atlas LiDAR terrain (`terrain-lidar-*.glb`) has no category: it is one 2 m grid mesh. Declare
          // it as terrain so it is rendered, collided with and draped like the engine's own terrain.
          if (metadata.nablaTerrainLidar && !metadata.category) metadata.category = 'Terrain'
          if (index !== originalIndex) delete metadata.parts
          meshes.push({
            name: mesh.name,
            position: p,
            normal: n,
            color: c,
            uv,
            index,
            tint: '#' + material.color.getHexString(),
            side: material.side,
            metadata,
          })
          const image = material.map?.image
          if (uv && image)
            photos.push({
              mesh: meshes[meshes.length - 1],
              image: image as CanvasImageSource,
            })
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
