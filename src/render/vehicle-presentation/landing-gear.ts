import { Box3, Group, Mesh, Vector3, type Object3D } from 'three'

const STUETZBEIN = /stuetzbein/i

/** Host-driven Stützbein drop; the meshes stay visible when raised. */
export class LandingGearVisual {
  deployed = true
  private progress = 1
  private from = 1
  private started = 0
  private moving = false
  private readonly rest: Vector3
  constructor(
    readonly root: Object3D,
    readonly travel: number,
    readonly durationMs = 700,
  ) {
    this.rest = root.position.clone()
    this.update(0)
  }
  setDeployed(deployed: boolean, now: number): void {
    if (deployed === this.deployed) return
    this.update(now)
    this.from = this.progress
    this.started = now
    this.deployed = deployed
    this.moving = true
  }
  update(now: number): void {
    if (this.moving) {
      const t = Math.max(0, Math.min(1, (now - this.started) / this.durationMs))
      const target = this.deployed ? 1 : 0
      this.progress = this.from + (target - this.from) * t * t * (3 - 2 * t)
      this.moving = t < 1
    }
    this.root.position.copy(this.rest)
    this.root.position.y += this.travel * this.progress
  }
}

/** Parent every Stützbein mesh under one group so the legs drop as a unit. */
export function mountLandingGear(model: Object3D, travel: number): LandingGearVisual | undefined {
  const meshes: Mesh[] = []
  model.traverse((node) => {
    if (node instanceof Mesh && STUETZBEIN.test(node.name)) meshes.push(node)
  })
  if (!meshes.length || !Number.isFinite(travel) || travel >= 0) return undefined
  model.updateWorldMatrix(true, true)
  const group = new Group()
  group.name = 'landing-gear'
  model.add(group)
  for (const mesh of meshes) group.attach(mesh)
  return new LandingGearVisual(group, travel)
}

export function landingGearMeshBounds(model: Object3D): Box3 | null {
  const box = new Box3()
  let found = false
  model.updateWorldMatrix(true, true)
  model.traverse((node) => {
    if (!(node instanceof Mesh) || !STUETZBEIN.test(node.name)) return
    box.expandByObject(node)
    found = true
  })
  return found ? box : null
}
