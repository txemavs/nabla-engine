/**
 * Nearby GLB triangles as static trimeshes.
 * The old set stays until the replacement is built.
 */
import { Body, Box, Material, Quaternion, Trimesh, Vec3, type World } from '../../simulation/physics.js'
import type { QuatTuple, Transform, Vec3Tuple } from '../../math/frame/vectors.js'
import type { PlanetCollisionChunk } from '../contract.js'

export interface PlanetPole {
  key: string
  bounds: PlanetCollisionChunk['bounds']
  center: Vec3Tuple
  half: Vec3Tuple
}
export interface PlanetCollisionTile {
  id: string
  pose: Transform
  chunks: PlanetCollisionChunk[]
  poles?: PlanetPole[]
}

/** A chunk this close to an actor (metres, to its bounds) is built at once, never deferred. */
export const URGENT_CHUNK_DISTANCE = 4

/**
 * Nearby trimeshes use the GLB vertices, including roads and the curved ground.
 * Rapier cooks a trimesh when its body is mounted, so bodies are mounted one trimesh per
 * update with their colliders disabled, and the complete set is switched on together.
 */
export class PlanetCollisions {
  private tiles: PlanetCollisionTile[] = []
  private built = new Map<string, Body>()
  private wanted = new Set<string>()
  private selectionKey = ''
  private tileKey = ''
  private bounds = new WeakMap<PlanetCollisionChunk[], number[]>()
  private candidates: {
    key: string
    tile: PlanetCollisionTile
    chunk?: PlanetCollisionChunk
    pole?: PlanetPole
    distance: number
  }[] = []
  ready = false
  constructor(
    private world: World,
    private material: Material,
    /** Staged: mount disabled bodies, never switch them on; the owner commits them. */
    private staged = false,
  ) {}
  setTiles(tiles: PlanetCollisionTile[]) {
    const key = tiles
      .map((t) => t.id + ':' + t.pose.position.join(',') + ':' + t.pose.rotation.join(','))
      .join('|')
    if (key !== this.tileKey) {
      this.tileKey = key
      this.selectionKey = ''
      this.tiles = tiles
      for (const tile of tiles)
        if (!this.bounds.has(tile.chunks)) {
          const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
          for (const c of [...tile.chunks, ...(tile.poles ?? [])])
            for (let i = 0; i < 3; i++) {
              b[i] = Math.min(b[i], c.bounds[i])
              b[i + 3] = Math.max(b[i + 3], c.bounds[i + 3])
            }
          this.bounds.set(tile.chunks, b)
        }
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
        const bounds = this.bounds.get(tile.chunks)!
        if (
          !local.some(
            (p) =>
              Math.max(
                bounds[0] - p.x,
                p.x - bounds[3],
                bounds[1] - p.y,
                p.y - bounds[4],
                bounds[2] - p.z,
                p.z - bounds[5],
              ) < 65,
          )
        )
          continue
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
        for (const pole of tile.poles ?? []) {
          const b = pole.bounds
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
            candidates.push({ key: tile.id + ':pole:' + pole.key, tile, pole, distance })
        }
      }
      candidates.sort((a, b) => a.distance - b.distance)
      this.candidates = candidates
      this.wanted = new Set(candidates.map((c) => c.key))
    }
    const candidates = this.candidates
    const end = performance.now() + budgetMs
    let trimeshes = 0
    for (const next of candidates) {
      if (this.built.has(next.key)) continue
      // Chunks under an actor are built now; the rest at most one trimesh per update.
      const urgent = next.distance <= URGENT_CHUNK_DISTANCE
      if (!urgent && (trimeshes > 0 || performance.now() >= end)) break
      const body = new Body({ mass: 0, material: this.material })
      body.position.set(...(next.tile.pose.position as Vec3Tuple))
      body.quaternion.set(...(next.tile.pose.rotation as QuatTuple))
      if (next.pole) {
        body.addShape(new Box(new Vec3(...next.pole.half)), new Vec3(...next.pole.center))
      } else {
        const count = next.chunk!.triangles.length / 3
        if (count >= 3) {
          const indices = new Uint32Array(count)
          for (let i = 0; i < count; i++) indices[i] = i
          body.addShape(new Trimesh(next.chunk!.triangles, indices))
          trimeshes++
        }
      }
      body.setCollisionEnabled(false)
      this.world.addBody(body, false)
      this.built.set(next.key, body)
    }
    this.ready = candidates.every((c) => this.built.has(c.key))
    // Swap complete nearby coverage atomically; never collide with both LODs.
    if (this.ready && !this.staged) {
      let changed = false
      for (const [key, body] of this.built) {
        if (!this.wanted.has(key)) {
          if (body.world) this.world.removeBody(body, false)
          this.built.delete(key)
          changed = true
        } else if (!body.collisionEnabled) {
          body.setCollisionEnabled(true)
          changed = true
        }
      }
      if (changed) this.world.raw.updateSceneQueries()
    }
  }
  private replacement: { id: string; staged: PlanetCollisions } | undefined
  /** Cook a replacement in an isolated physics world; commit is synchronous with the visual swap. */
  prepareReplacement(
    previousId: string,
    tile: PlanetCollisionTile,
    positions: Vec3Tuple[],
    buildings: boolean,
    budgetMs = 3,
  ): (() => void) | undefined {
    if (this.replacement?.id !== tile.id) {
      this.discardReplacement()
      // Cooked in the live world, disabled, so the commit only switches colliders.
      this.replacement = {
        id: tile.id,
        staged: new PlanetCollisions(this.world, this.material, true),
      }
    }
    const staged = this.replacement.staged
    staged.setTiles([tile])
    staged.update(positions, buildings, budgetMs)
    if (!staged.ready) return undefined
    return () => {
      for (const [key, body] of this.built)
        if (key.startsWith(previousId + ':')) {
          if (body.world) this.world.removeBody(body, false)
          this.built.delete(key)
        }
      for (const [key, body] of staged.built) {
        body.setCollisionEnabled(true)
        this.built.set(key, body)
      }
      staged.built.clear()
      this.world.raw.updateSceneQueries()
      this.tiles = this.tiles.map((existing) => (existing.id === previousId ? tile : existing))
      this.tileKey = ''
      this.selectionKey = ''
      this.discardReplacement()
    }
  }
  discardReplacement(): void {
    this.replacement?.staged.dispose()
    this.replacement = undefined
  }
  dispose() {
    this.discardReplacement()
    for (const body of this.built.values()) if (body.world) this.world.removeBody(body, false)
    if (this.built.size) this.world.raw.updateSceneQueries()
    this.built.clear()
    this.tiles = []
  }
}
