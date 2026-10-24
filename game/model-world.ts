/** Local authored GLB world, independent of planetary streaming. Coordinates are metres, Y up. */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { Mesh, Vector3 } from 'three'
import type { GameRuntime } from '@nabla/engine/runtime/browser'

/** Download/decode before play; install triangles into the same worker-backed physics session before reveal. */
export async function prepareModelWorld(
  url: string,
): Promise<(runtime: GameRuntime) => Promise<void>> {
  const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url)
  scene.updateMatrixWorld(true)
  const vertices: number[] = [],
    indices: number[] = []
  const point = new Vector3()
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const positions = object.geometry.attributes.position
    if (!positions) return
    const base = vertices.length / 3
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld)
      vertices.push(point.x, point.y, point.z)
    }
    const index = object.geometry.index
    for (let i = 0; i < (index?.count ?? positions.count); i++)
      indices.push(base + (index ? index.getX(i) : i))
  })
  if (!indices.length) throw new Error('World GLB contains no collision triangles')
  return async (runtime) => {
    runtime.attachSceneryLayer(scene)
    const simulation = runtime.game.session.simulation!
    simulation.setExternalCollisionMesh(
      'local-model-world',
      new Float32Array(vertices),
      new Uint32Array(indices),
    )
    await simulation.step(0)
  }
}
