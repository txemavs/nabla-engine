import { planetChart } from './planet-chart.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { LoadingManager, Mesh, MeshStandardMaterial, Matrix3, Vector3 } from 'three'
import {
  planetCollisionChunks,
  type PlanetManifest,
  type PlanetMesh,
} from '../src/planet-artifact.js'
import { mapCache } from './map-cache.js'
const controllers = new Map<number, AbortController>()
self.onmessage = async (
  event: MessageEvent<{
    id: number
    manifest: PlanetManifest
    directory: string
    buildings?: boolean
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
  let vegetation: { position: [number, number, number]; size: [number, number] }[] = []
  let bytesTotal = 0
  try {
    const manager = new LoadingManager()
    manager.setURLModifier(() => {
      throw Error('Planet GLBs must be self-contained')
    })
    const loader = new GLTFLoader(manager)
    for (const name of ['terrain', 'buildings-osm'] as const) {
      if (name === 'buildings-osm' && event.data.buildings === false) continue
      const file = manifest.files[name],
        url = directory + file.path
      const cache = mapCache('nabla-planet-glb-v2')
      let response = await cache.match(url).catch(() => undefined)
      if (!response)
        response = await fetch(url, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]),
        })
      if (!response.ok) throw Error(`GLB HTTP ${response.status}`)
      const bytes = await response.arrayBuffer()
      if (bytes.byteLength !== file.bytes) throw Error('GLB size mismatch')
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      if (hash !== file.sha256) throw Error('GLB checksum mismatch')
      await cache.put(url, new Response(bytes)).catch(() => {})
      bytesTotal += bytes.byteLength
      const gltf = await loader.parseAsync(bytes, '')
      gltf.scene.updateMatrixWorld(true)
      try {
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
            color = g.getAttribute('color')
          if (!position || !normal || position.count > 4000000) throw Error('Invalid planet mesh')
          const p = new Float32Array(position.count * 3),
            n = new Float32Array(position.count * 3),
            c = color ? new Float32Array(position.count * 3) : undefined
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
          }
          if (!p.every(Number.isFinite) || !n.every(Number.isFinite))
            throw Error('Invalid GLB coordinates')
          const material = (
            Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
          ) as MeshStandardMaterial
          meshes.push({
            name: mesh.name,
            position: p,
            normal: n,
            color: c,
            index: g.index ? new Uint32Array(g.index.array) : undefined,
            tint: '#' + material.color.getHexString(),
            side: material.side,
            metadata: mesh.userData,
          })
        })
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
    const chunks = planetCollisionChunks(meshes)
    const chart = planetChart(meshes)
    controller.signal.throwIfAborted()
    const transfers = [
      ...meshes.flatMap((m) => [
        m.position.buffer,
        m.normal.buffer,
        ...(m.color ? [m.color.buffer] : []),
        ...(m.index ? [m.index.buffer] : []),
      ]),
      ...chunks.map((c) => c.triangles.buffer),
    ] as ArrayBuffer[]
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
