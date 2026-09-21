import * as THREE from 'three'
import { createEntity, type Entity, type SceneDocument } from '../src/scene.js'
import { createPortalPair, portalMapping, portalLocal } from '../src/portal.js'
import type { Simulation } from '../src/simulation.js'
import type { SceneView } from './view.js'

export function createGallery(prefix: string): Entity[] {
  const gates = createPortalPair(
    `${prefix}-window`,
    `${prefix}-back`,
    [-1, 1.455, -4],
    [-140, 1.455, 0],
  )
  gates.forEach((e) => (e.portal!.mode = 'window'))
  gates[0].name = 'Galería 2.5D · ventana'
  gates[1].name = 'Galería 2.5D · escenario'
  const ground = createEntity(`${prefix}-ground`, 'box', [-140, -0.1, -12])
  ground.size = [28, 0.2, 32]
  ground.color = '#435a4c'
  const backdrop = createEntity(`${prefix}-wall`, 'box', [-140, 5, -27])
  backdrop.size = [28, 10, 0.5]
  backdrop.color = '#354b65'
  const entities = [...gates, ground, backdrop]
  for (let i = 0; i < 8; i++) {
    const tree = createEntity(`${prefix}-tree-${i}`, 'group', [
      -149 + (i % 4) * 6,
      0,
      -7 - Math.floor(i / 4) * 13,
    ])
    tree.size = [7, 7, 0.1]
    tree.name = 'Árbol · capa lejana'
    tree.sprite = { url: `/sprites/tree-${(i % 5) + 1}.png` }
    entities.push(tree)
  }
  for (let i = 0; i < 5; i++) {
    const target = createEntity(`${prefix}-target-${i}`, 'group', [
      -144 + i * 2,
      0.4,
      -11 - (i % 3) * 3,
    ])
    target.size = [1.6, 2, 0.1]
    target.name = 'Diana móvil'
    target.sprite = { url: '/sprites/target.png', target: true }
    entities.push(target)
  }
  return entities
}

/** Bounded one-hop ray transport: window barriers stop bodies, but gallery shots cross them. */
export function shotView(
  sim: Simulation,
  document: SceneDocument,
  camera: THREE.PerspectiveCamera,
  range = 150,
): { camera: THREE.PerspectiveCamera; range: number; throughPortal: boolean } {
  camera.updateMatrixWorld(true)
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
  let closest = range,
    gate: Entity | undefined
  for (const e of document.entities.filter((e) => e.portal)) {
    const state = sim.portalState(e.id)
    if (state.mode === 'closed' || !state.pairId) continue
    const pose = sim.entityTransform(e.id, true)
    const a = portalLocal(camera.position.toArray(), pose)
    const localDirection = direction
      .clone()
      .applyQuaternion(new THREE.Quaternion(...pose.rotation).invert())
    if (a.z <= 0 || localDirection.z >= -1e-6) continue
    const distance = -a.z / localDirection.z
    const hit = a.clone().addScaledVector(localDirection, distance)
    if (distance < closest && Math.abs(hit.x) < e.size[0] / 2 && Math.abs(hit.y) < e.size[1] / 2) {
      closest = distance
      gate = e
    }
  }
  if (
    !gate ||
    sim.shoot(
      camera.position.toArray(),
      direction.toArray(),
      Math.max(0.001, closest - gate.size[2] - 0.02),
      0,
    )
  )
    return { camera, range, throughPortal: false }
  const destination = sim.portalState(gate.id).pairId!
  const mapping = portalMapping(
    sim.entityTransform(gate.id, true),
    sim.entityTransform(destination, true),
  )
  const remote = camera.clone()
  const point = camera.position
    .clone()
    .addScaledVector(direction, closest + 0.02)
    .applyMatrix4(mapping)
  remote.position.copy(point)
  remote.quaternion.premultiply(new THREE.Quaternion().setFromRotationMatrix(mapping))
  remote.updateMatrixWorld(true)
  return { camera: remote, range: range - closest, throughPortal: true }
}

export class Gallery {
  private elapsed = 0
  private remaining = 60
  private started = false
  private hits = 0
  private shots = 0
  private respawn = new Map<string, number>()
  private readonly hud = document.createElement('div')
  constructor(viewport: HTMLElement) {
    this.hud.className = 'gallery-score'
    this.hud.hidden = true
    viewport.append(this.hud)
  }
  reset(): void {
    this.elapsed = 0
    this.remaining = 60
    this.started = false
    this.hits = 0
    this.shots = 0
    this.respawn.clear()
  }
  update(view: SceneView, playing: boolean, dt: number): void {
    const targets = view.document.entities.filter((e) => e.sprite?.target)
    this.hud.hidden = !playing || !targets.length
    if (!playing) return
    this.elapsed += Math.min(dt, 0.1)
    if (this.started) this.remaining = Math.max(0, this.remaining - Math.min(dt, 0.1))
    targets.forEach((e, i) => {
      const sprite = view.sprites.get(e.id)!
      sprite.visible = this.remaining > 0 && (this.respawn.get(e.id) ?? 0) <= this.elapsed
      sprite.position.x = Math.sin(this.elapsed * 0.8 + i) * 1.5
    })
    this.hud.textContent = `Galería · ${this.hits}/${this.shots} · ${Math.ceil(this.remaining)} s · N reiniciar`
    this.hud.dataset.hits = String(this.hits)
  }
  shoot(sim: Simulation, view: SceneView, camera: THREE.PerspectiveCamera): boolean {
    let rayView = shotView(sim, view.document, camera)
    const foreground = new THREE.Raycaster()
    foreground.setFromCamera(new THREE.Vector2(), camera)
    const obstruction = view.hitSprite(foreground)
    if (rayView.throughPortal && obstruction && obstruction.distance < 150 - rayView.range)
      rayView = { camera, range: 150, throughPortal: false }
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(), rayView.camera)
    ray.far = rayView.range
    const solid = sim.shoot(ray.ray.origin.toArray(), ray.ray.direction.toArray(), rayView.range, 0)
    const sprite = view.hitSprite(ray)
    const spriteFirst =
      sprite &&
      (!solid || sprite.distance < ray.ray.origin.distanceTo(new THREE.Vector3(...solid.point)))
    const targetHit =
      spriteFirst &&
      view.document.entities.find((e) => e.id === sprite.object.userData.entityId)?.sprite?.target
    if (
      (rayView.throughPortal || targetHit) &&
      view.document.entities.some((e) => e.sprite?.target)
    ) {
      if (this.remaining <= 0) return false
      this.started = true
      this.shots++
    }
    if (spriteFirst) {
      const id = sprite.object.userData.entityId as string
      if (view.document.entities.find((e) => e.id === id)?.sprite?.target && this.remaining > 0) {
        this.started = true
        this.hits++
        this.respawn.set(id, this.elapsed + 1.5)
        sprite.object.visible = false
      }
      return true
    }
    return !!sim.shoot(ray.ray.origin.toArray(), ray.ray.direction.toArray(), rayView.range)
  }
}
