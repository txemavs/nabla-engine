import * as THREE from 'three'
import type { Entity } from '../../stage/scene.js'

/** Shared fixed light budget: no shadow passes, regardless of the number of poles. */
export class Streetlights {
  private entries: {
    entity: Entity
    group: THREE.Group
    lens: THREE.Mesh
    source: THREE.Object3D
    target: THREE.Object3D
    point?: THREE.PointLight
  }[] = []
  private pool: THREE.SpotLight[] = []
  constructor(private root: THREE.Group) {}
  add(entity: Entity, group: THREE.Group): void {
    if (entity.light?.shape === 'globe') {
      this.addGlobe(entity, group)
      return
    }
    const metal = new THREE.MeshStandardMaterial({
      color: entity.color,
      metalness: 0.6,
      roughness: 0.6,
    })
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(entity.size[0] * 0.3, entity.size[0] / 2, entity.size[1], 12),
      metal,
    )
    pole.scale.z = entity.size[2] / entity.size[0]
    group.add(pole)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.14), metal)
    arm.position.set(1.08, entity.size[1] / 2 - 0.12, 0)
    group.add(arm)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.44), metal)
    head.position.set(2.2, entity.size[1] / 2 - 0.2, 0)
    group.add(head)
    const lens = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.015, 0.34),
      new THREE.MeshStandardMaterial({
        color: '#cccccc',
        emissive: entity.light!.color,
        emissiveIntensity: 0,
      }),
    )
    lens.position.copy(head.position).add(new THREE.Vector3(0, -0.09, 0))
    group.add(lens)
    const source = new THREE.Object3D(),
      target = new THREE.Object3D()
    source.position.copy(lens.position).y -= 0.03
    target.position.set(2.2, -entity.size[1] / 2, 0)
    group.add(source, target)
    this.entries.push({ entity, group, lens, source, target })
    this.ensurePool()
  }
  private addGlobe(entity: Entity, group: THREE.Group): void {
    const metal = new THREE.MeshStandardMaterial({
      color: entity.color,
      metalness: 0.4,
      roughness: 0.7,
    })
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, entity.size[1], 8), metal)
    group.add(pole)
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.165, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#1a1a1a', toneMapped: false }),
    )
    lens.position.y = entity.size[1] / 2 + 0.12
    group.add(lens)
    const source = new THREE.Object3D()
    source.position.copy(lens.position)
    const target = new THREE.Object3D()
    group.add(source, target)
    const point = new THREE.PointLight(entity.light!.color, 0, entity.light!.distance, 2)
    point.castShadow = false
    this.root.add(point)
    this.entries.push({ entity, group, lens, source, target, point })
  }
  private ensurePool(): void {
    if (this.pool.length) return
    for (let i = 0; i < 6; i++) {
      const light = new THREE.SpotLight('#ffffff', 0, 32, Math.PI / 3, 0.6, 2)
      light.castShadow = false
      this.root.add(light, light.target)
      this.pool.push(light)
    }
  }
  update(camera: THREE.Vector3, night: boolean, drawDistance: number): void {
    if (!this.entries.length) return
    this.root.updateWorldMatrix(true, false)
    const lit = (e: (typeof this.entries)[number]) =>
      !!e.group.parent && e.entity.light!.enabled && (!e.entity.light!.nightOnly || night)
    const candidates = this.entries
      .filter((e) => lit(e) && !e.point)
      .map((e) => ({ e, position: e.source.getWorldPosition(new THREE.Vector3()) }))
      .filter((e) => e.position.distanceTo(camera) < drawDistance)
      .sort((a, b) => a.position.distanceToSquared(camera) - b.position.distanceToSquared(camera))
    for (const e of this.entries) {
      const on = lit(e)
      const material = e.lens.material
      if (material instanceof THREE.MeshBasicMaterial)
        material.color.set(on ? e.entity.light!.color : '#1a1a1a')
      else if (material instanceof THREE.MeshStandardMaterial) material.emissiveIntensity = on ? 2 : 0
      if (!e.point) continue
      const position = e.source.getWorldPosition(new THREE.Vector3())
      const near = on && position.distanceTo(camera) < drawDistance
      e.point.intensity = near ? e.entity.light!.intensity : 0
      e.point.color.set(e.entity.light!.color)
      e.point.distance = e.entity.light!.distance
      e.point.position.copy(this.root.worldToLocal(position))
    }
    this.pool.forEach((light, i) => {
      const item = candidates[i]
      if (item?.e.entity.light!.intensity === 1800) item.e.entity.light!.intensity = 900
      light.intensity = item ? item.e.entity.light!.intensity : 0
      if (!item) return
      light.color.set(item.e.entity.light!.color)
      light.distance = item.e.entity.light!.distance
      light.position.copy(this.root.worldToLocal(item.position))
      light.target.position.copy(
        this.root.worldToLocal(item.e.target.getWorldPosition(new THREE.Vector3())),
      )
    })
  }
}
