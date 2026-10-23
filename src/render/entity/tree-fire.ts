import * as THREE from 'three'

/**
 * Fire spreading into trees. Trees are one instanced draw per tile (`userData.category ===
 * 'Trees'`); this never edits their geometry or materials beyond the instance colour (charring)
 * and matrix (collapse and removal), both restored by {@link TreeFires.clear}.
 *
 * A fire burning under a crown (within its radius, below ~60 % of its height) for a moment
 * ignites the tree. Flames then climb the trunk into the crown with a delay, the tree chars,
 * burns out, smoulders, sinks and is removed. A fully burning tree can ignite touching
 * neighbours. Queries use a coarse grid per tree mesh, built once, and run at 4 Hz.
 */

export type FlameKit = {
  flames: THREE.Group
  material: THREE.MeshBasicMaterial
  clock: { value: number }
  dispose(): void
  update(dt: number, strength: number): void
}
/** Smoke column of a tree fire (the same smoke as wrecks). */
export type SmokeKit = {
  root: THREE.Object3D
  update(dt: number, emitting: boolean, amount: number): void
  dispose(): void
}

/** A fire that can light trees: scene-space position (`space` frame) and strength 0..1. */
export type FireSource = { position: THREE.Vector3; strength: number }

const CELL = 8
const QUERY_HZ = 4
const MAX_TREE_FIRES = 12
/** Seconds of exposure before a tree catches. */
const IGNITE_SECONDS = 1.6
/** Timeline of a tree fire (seconds since ignition). */
export const TREE_FIRE = {
  climbSeconds: 4,
  fullSeconds: 7,
  burnOutSeconds: 20,
  smoulderSeconds: 28,
  sinkSeconds: 32,
}

type TreeRef = { mesh: THREE.InstancedMesh; index: number }
type TreeFire = TreeRef & {
  age: number
  base: THREE.Vector3
  height: number
  width: number
  anchors: { kit: FlameKit; at: number; delay: number; dx: number; dz: number }[]
  smoke: SmokeKit
  matrix: THREE.Matrix4
}

const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()
const scale = new THREE.Vector3()
const quat = new THREE.Quaternion()
const color = new THREE.Color()
const white = new THREE.Color(1, 1, 1)
const char = new THREE.Color('#1c1814')
const ember = new THREE.Color('#5a1e08')

/** Fuel curve of one flame anchor: ignition, flare-up, decay, out (0..~1.25). */
export function fuelCurve(t: number, burnOut: number): number {
  if (t <= 0) return 0
  const ignite = Math.min(1, t / 1.2)
  const flare = 1 + 0.25 * Math.exp(-((t - 2.5) ** 2) / 1.5)
  const decay = t < burnOut * 0.45 ? 1 : Math.max(0, 1 - (t - burnOut * 0.45) / (burnOut * 0.55))
  return ignite * ignite * flare * decay * decay
}

export class TreeFires {
  private grids = new Map<THREE.InstancedMesh, Map<string, number[]>>()
  private exposure = new Map<string, number>()
  private burning = new Map<string, TreeFire>()
  /** Trees burnt and removed: key → original matrix (restored on clear). */
  private removed = new Map<string, { ref: TreeRef; matrix: THREE.Matrix4 }>()
  private originalColors = new Set<THREE.InstancedMesh>()
  private sinceQuery = 0
  private sinceSearch = Infinity
  private meshes: THREE.InstancedMesh[] = []

  constructor(
    private readonly space: THREE.Group,
    private readonly makeFlames: () => FlameKit,
    private readonly makeSmoke: (parent: THREE.Object3D) => SmokeKit,
  ) {}

  /** Trees currently burning (tests, tools). */
  get active(): number {
    return this.burning.size
  }
  /** Trees burnt down and removed (tests, tools). */
  get removedCount(): number {
    return this.removed.size
  }

  /** Use these tree meshes instead of searching the scene (tests, tools). */
  setTrees(meshes: THREE.InstancedMesh[]): void {
    this.meshes = meshes
    this.sinceSearch = -Infinity
  }

  private findTrees(): void {
    let top: THREE.Object3D = this.space
    while (top.parent) top = top.parent
    const found: THREE.InstancedMesh[] = []
    top.traverse((node) => {
      if ((node as THREE.InstancedMesh).isInstancedMesh && node.userData.category === 'Trees')
        found.push(node as THREE.InstancedMesh)
    })
    this.meshes = found
    for (const mesh of this.grids.keys()) if (!found.includes(mesh)) this.grids.delete(mesh)
  }

  private grid(mesh: THREE.InstancedMesh): Map<string, number[]> {
    let grid = this.grids.get(mesh)
    if (grid) return grid
    grid = new Map()
    const m = new THREE.Matrix4()
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m)
      const key = `${Math.floor(m.elements[12] / CELL)},${Math.floor(m.elements[14] / CELL)}`
      let cell = grid.get(key)
      if (!cell) grid.set(key, (cell = []))
      cell.push(i)
    }
    this.grids.set(mesh, grid)
    return grid
  }

  /** Trees whose crown can be reached from `p` (mesh-local) within `reach` metres. */
  private near(
    mesh: THREE.InstancedMesh,
    p: THREE.Vector3,
    reach: number,
    visit: (index: number, m: THREE.Matrix4) => void,
  ): void {
    const grid = this.grid(mesh)
    const m = new THREE.Matrix4()
    const cx = Math.floor(p.x / CELL),
      cz = Math.floor(p.z / CELL)
    const span = Math.ceil(reach / CELL) + 1
    for (let x = cx - span; x <= cx + span; x++)
      for (let z = cz - span; z <= cz + span; z++)
        for (const i of grid.get(`${x},${z}`) ?? []) {
          mesh.getMatrixAt(i, m)
          visit(i, m)
        }
  }

  update(dt: number, sources: FireSource[]): void {
    this.sinceQuery += dt
    this.sinceSearch += dt
    const hot = sources.some((s) => s.strength > 0.3) || this.burning.size > 0
    if (hot && this.sinceSearch > 5) {
      this.sinceSearch = 0
      if (!this.meshes.length || this.meshes.some((m) => !m.parent)) this.findTrees()
    }
    if (hot && this.sinceQuery >= 1 / QUERY_HZ) {
      this.query(this.sinceQuery, sources)
      this.sinceQuery = 0
    }
    for (const [key, fire] of this.burning) this.advance(key, fire, dt)
  }

  private query(dt: number, sources: FireSource[]): void {
    const touched = new Set<string>()
    const all: FireSource[] = [...sources]
    // Fully burning crowns light touching neighbours.
    for (const fire of this.burning.values())
      if (fire.age > TREE_FIRE.fullSeconds && fire.age < TREE_FIRE.burnOutSeconds * 0.7) {
        const p = fire.mesh.localToWorld(tmp2.copy(fire.base).setY(fire.base.y + fire.height * 0.6))
        all.push({ position: this.space.worldToLocal(p.clone()), strength: -fire.width })
      }
    for (const mesh of this.meshes) {
      mesh.updateWorldMatrix(true, false)
      for (const source of all) {
        if (Math.abs(source.strength) < 0.3 && source.strength >= 0) continue
        const local = mesh.worldToLocal(this.space.localToWorld(tmp.copy(source.position)))
        const crown = source.strength < 0
        this.near(mesh, local, crown ? 8 : 6, (i, m) => {
          const key = `${mesh.uuid}:${i}`
          if (this.burning.has(key) || this.removed.has(key)) return
          m.decompose(tmp2, quat, scale)
          const width = scale.x,
            height = scale.y
          if (width < 0.05 || height < 0.05) return
          const baseY = tmp2.y - height / 2
          const dx = local.x - tmp2.x,
            dz = local.z - tmp2.z
          const d = Math.hypot(dx, dz)
          const ok = crown
            ? d < (width - source.strength) * 0.45 &&
              Math.abs(local.y - (baseY + height * 0.6)) < height * 0.5
            : d < width / 2 + 1.2 && local.y > baseY - 1 && local.y < baseY + height * 0.6
          if (!ok) return
          touched.add(key)
          const e =
            (this.exposure.get(key) ?? 0) + dt * (crown ? 0.6 : Math.min(1, source.strength))
          this.exposure.set(key, e)
          if (e >= IGNITE_SECONDS && this.burning.size < MAX_TREE_FIRES)
            this.ignite(key, { mesh, index: i }, tmp2.clone().setY(baseY), width, height, m.clone())
        })
      }
    }
    for (const key of this.exposure.keys()) if (!touched.has(key)) this.exposure.delete(key)
  }

  private ignite(
    key: string,
    ref: TreeRef,
    base: THREE.Vector3,
    width: number,
    height: number,
    matrix: THREE.Matrix4,
  ): void {
    this.exposure.delete(key)
    // Four anchors: the trunk foot, then three spread over the crown volume (low, mid, high, a
    // third of a turn apart, off the axis towards the branches), each lighting later as the fire
    // climbs. The crown flames are smaller than the former single crown flame, so the three
    // cover about the same screen area (fill cost) for one extra draw.
    const turn = Math.random() * Math.PI * 2
    const anchors = [0.08, 0.45, 0.62, 0.78].map((at, k) => {
      const kit = this.makeFlames()
      kit.flames.visible = false
      ref.mesh.add(kit.flames)
      const r = k === 0 ? 0 : width * (0.18 + 0.1 * (k % 2))
      const a = turn + k * 2.09
      return {
        kit,
        at,
        dx: Math.cos(a) * r,
        dz: Math.sin(a) * r,
        delay:
          (Math.min(k, 2) * TREE_FIRE.climbSeconds) / 2 +
          (k > 1 ? (k - 2) * 0.8 : 0) +
          Math.random() * 0.6,
      }
    })
    const smoke = this.makeSmoke(ref.mesh)
    this.burning.set(key, { ...ref, age: 0, base, height, width, anchors, smoke, matrix })
    this.originalColors.add(ref.mesh)
  }

  private advance(key: string, fire: TreeFire, dt: number): void {
    fire.age += dt
    const t = fire.age
    const { mesh, index, base, height, width } = fire
    for (const a of fire.anchors) {
      const local = t - a.delay
      const strength = fuelCurve(local, TREE_FIRE.burnOutSeconds - a.delay)
      const flames = a.kit.flames
      flames.visible = strength > 0.02
      if (!flames.visible) continue
      // Crown flames are wider; flicker on top of the fuel curve.
      const size =
        (a.at > 0.4 ? width * 0.46 : Math.min(1.2, width * 0.35)) * (0.55 + 0.6 * strength)
      const flicker =
        1 + 0.08 * Math.sin(local * 13.7 + a.delay * 7) + 0.05 * Math.sin(local * 23.1)
      flames.position.set(base.x + a.dx, base.y + height * a.at - size * 0.15, base.z + a.dz)
      flames.scale.set(size, size * (1.3 + 0.5 * strength) * flicker, size)
      a.kit.update(dt, strength)
    }
    fire.smoke.root.position.set(base.x, base.y + height * 0.85, base.z)
    const smoking = t > 1 && t < TREE_FIRE.smoulderSeconds
    fire.smoke.update(dt, smoking, Math.min(1, t / 3) * (t > TREE_FIRE.burnOutSeconds ? 0.35 : 1))
    // Charring: green → black from the foot upward as it burns; a faint ember glow while it
    // smoulders.
    const burnt = THREE.MathUtils.smoothstep(t, 1.5, TREE_FIRE.burnOutSeconds * 0.6)
    color.copy(white).lerp(char, burnt)
    if (t > TREE_FIRE.burnOutSeconds && t < TREE_FIRE.smoulderSeconds)
      color.lerp(ember, 0.25 * (0.6 + 0.4 * Math.sin(t * 3.1)))
    mesh.setColorAt(index, color)
    mesh.instanceColor!.needsUpdate = true
    // Burnt out: sink and shrink into the ground, then the instance is gone.
    if (t > TREE_FIRE.smoulderSeconds) {
      const k = Math.min(
        1,
        (t - TREE_FIRE.smoulderSeconds) / (TREE_FIRE.sinkSeconds - TREE_FIRE.smoulderSeconds),
      )
      fire.matrix.decompose(tmp, quat, scale)
      const s = 1 - k * k
      scale.multiplyScalar(Math.max(1e-4, s))
      tmp.y = base.y + (height * s) / 2 - height * 0.15 * k
      const m = new THREE.Matrix4().compose(tmp, quat, scale)
      if (k >= 1) m.makeScale(0, 0, 0)
      mesh.setMatrixAt(index, m)
      mesh.instanceMatrix.needsUpdate = true
      if (k >= 1) {
        this.finish(fire)
        this.burning.delete(key)
        this.removed.set(key, { ref: { mesh, index }, matrix: fire.matrix })
      }
    }
  }

  private finish(fire: TreeFire): void {
    for (const a of fire.anchors) {
      a.kit.flames.removeFromParent()
      a.kit.dispose()
    }
    fire.smoke.dispose()
  }

  /** Put every tree back (session reset). */
  clear(): void {
    for (const [key, fire] of this.burning) {
      this.finish(fire)
      fire.mesh.setMatrixAt(fire.index, fire.matrix)
      fire.mesh.instanceMatrix.needsUpdate = true
      this.removed.delete(key)
    }
    for (const { ref, matrix } of this.removed.values()) {
      ref.mesh.setMatrixAt(ref.index, matrix)
      ref.mesh.instanceMatrix.needsUpdate = true
    }
    // Tree meshes carry no instance colours of their own; white is the uncharred tint.
    for (const mesh of this.originalColors) {
      if (!mesh.instanceColor) continue
      for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, white)
      mesh.instanceColor.needsUpdate = true
    }
    this.burning.clear()
    this.removed.clear()
    this.exposure.clear()
  }

  dispose(): void {
    this.clear()
    this.grids.clear()
    this.meshes = []
  }
}
