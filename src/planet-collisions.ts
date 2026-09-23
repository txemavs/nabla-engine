import { Body, ConvexPolyhedron, Material, Quaternion, Vec3, World } from 'cannon-es'
import type { Transform, Vec3Tuple } from './scene.js'

export interface PlanetCollisionChunk {
  key: string
  bounds: [number, number, number, number, number, number]
  buildings: boolean
  triangles: Float32Array
}
export interface PlanetCollisionTile {
  id: string
  pose: Transform
  chunks: PlanetCollisionChunk[]
}
/** Nearby convex triangle prisms use the GLB vertices, including roads and the curved ground.
 * Cannon's Trimesh cannot collide with all vehicle box shapes; these prisms can. */
export class PlanetCollisions {
  private tiles: PlanetCollisionTile[] = []
  private built = new Map<string, Body>()
  private pending?: { key: string; body: Body; chunk: PlanetCollisionChunk; cursor: number }
  private wanted = new Set<string>()
  private selectionKey = ''
  private tileKey = ''
  private candidates: {
    key: string
    tile: PlanetCollisionTile
    chunk: PlanetCollisionChunk
    distance: number
  }[] = []
  ready = false
  constructor(
    private world: World,
    private material: Material,
  ) {}
  setTiles(tiles: PlanetCollisionTile[]) {
    const key = tiles
      .map((t) => t.id + ':' + t.pose.position.join(',') + ':' + t.pose.rotation.join(','))
      .join('|')
    if (key !== this.tileKey) {
      this.tileKey = key
      this.selectionKey = ''
      this.tiles = tiles
    }
  }
  update(positions: Vec3Tuple[], buildings: boolean, budgetMs = 3): void {
    // A 65 m working set has ample margin for an 8 m selection grid. Reuse it
    // between movements instead of scanning every triangle chunk every frame.
    const selectionKey =
      String(buildings) +
      ':' +
      positions.map((p) => p.map((n) => Math.floor(n / 8)).join(',')).join('|')
    if (selectionKey !== this.selectionKey) {
      this.selectionKey = selectionKey
      const candidates: typeof this.candidates = []
      for (const tile of this.tiles) {
        const inverse = new Quaternion(...tile.pose.rotation).inverse()
        const origin = new Vec3(...tile.pose.position)
        const local = positions.map((p) => inverse.vmult(new Vec3(...p).vsub(origin)))
        for (const chunk of tile.chunks) {
          if (chunk.buildings && !buildings) continue
          const b = chunk.bounds
          const distance = Math.min(
            ...local.map((p) =>
              Math.hypot(
                Math.max(b[0] - p.x, 0, p.x - b[3]),
                Math.max(b[1] - p.y, 0, p.y - b[4]),
                Math.max(b[2] - p.z, 0, p.z - b[5]),
              ),
            ),
          )
          if (distance < 65)
            candidates.push({ key: tile.id + ':' + chunk.key, tile, chunk, distance })
        }
      }
      candidates.sort((a, b) => a.distance - b.distance)
      this.candidates = candidates
      this.wanted = new Set(candidates.map((c) => c.key))
    }
    const candidates = this.candidates
    if (this.pending && !this.wanted.has(this.pending.key)) this.pending = undefined
    const end = performance.now() + budgetMs
    do {
      if (!this.pending) {
        const next = candidates.find((c) => !this.built.has(c.key))
        if (!next) break
        const body = new Body({ mass: 0, material: this.material })
        body.position.set(...next.tile.pose.position)
        body.quaternion.set(...next.tile.pose.rotation)
        this.pending = { key: next.key, body, chunk: next.chunk, cursor: 0 }
      }
      const job = this.pending
      for (
        let count = 0;
        count < 24 && job.cursor < job.chunk.triangles.length;
        count++, job.cursor += 9
      ) {
        const a = job.chunk.triangles
        const p = [0, 3, 6].map(
          (offset) =>
            new Vec3(
              a[job.cursor + offset],
              a[job.cursor + offset + 1],
              a[job.cursor + offset + 2],
            ),
        )
        const normal = p[1].vsub(p[0]).cross(p[2].vsub(p[0]))
        if (normal.lengthSquared() < 1e-12) continue
        normal.normalize()
        // Top is exactly the rendered face; thickness extends inward only.
        const center = p[0]
          .vadd(p[1])
          .vadd(p[2])
          .scale(1 / 3)
          .vsub(normal.scale(0.025))
        const vertices = [...p, ...p.map((v) => v.vsub(normal.scale(0.05)))].map((v) =>
          v.vsub(center),
        )
        job.body.addShape(
          new ConvexPolyhedron({
            vertices,
            faces: [
              [0, 1, 2],
              [5, 4, 3],
              [0, 3, 4, 1],
              [1, 4, 5, 2],
              [2, 5, 3, 0],
            ],
          }),
          center,
        )
      }
      if (job.cursor >= job.chunk.triangles.length) {
        this.built.set(job.key, job.body)
        this.pending = undefined
      }
    } while (performance.now() < end)
    this.ready = candidates.every((c) => this.built.has(c.key))
    // Swap complete nearby coverage atomically; never collide with both LODs.
    if (this.ready) {
      for (const [key, body] of this.built) {
        if (!this.wanted.has(key)) {
          if (body.world) this.world.removeBody(body)
          this.built.delete(key)
        } else if (!body.world) this.world.addBody(body)
      }
    }
  }
  dispose() {
    for (const body of this.built.values()) if (body.world) this.world.removeBody(body)
    this.built.clear()
    this.pending = undefined
    this.tiles = []
  }
}
