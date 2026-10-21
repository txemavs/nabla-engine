import * as THREE from 'three'
import { balloonTuning } from '../config/gameplay-tuning.js'
import { createRuntimeText, type RuntimeText } from './messages.js'
import { type Entity, type Vec3Tuple } from '../entity/schema.js'
import {
  isImpactSurface,
  sceneryImpactSurface,
  vehicleImpactSurface,
  type ImpactSurface,
} from '../config/impact-sounds.js'
import { type SceneDocument } from '../scene/document.js'
import { portalMapping, portalLocal } from '../entity/portal/portal.js'
import type { Simulation } from '../simulation/simulation.js'
import type { SceneView } from '../render/entity/view.js'

/** Bounded one-hop ray transport: window barriers stop bodies, but gallery shots cross them. */
/**
 * Order raycast hits on hand-handled scenery for a shot: nearest first. Hits closer together than
 * `tolerance` (coplanar or back-to-back plates a few millimetres apart, double-sided instanced
 * batches) count as the same distance, and then the face turned to the shooter wins, so the plate
 * the player sees takes the mark, sound and knock instead of the one behind it.
 */
export function orderSceneryHits(
  hits: THREE.Intersection[],
  direction: THREE.Vector3,
  tolerance = 0.005,
): THREE.Intersection[] {
  const facing = (hit: THREE.Intersection) => {
    if (!hit.face) return 1
    const world = hit.object.matrixWorld.clone()
    if (hit.instanceId !== undefined && hit.object instanceof THREE.InstancedMesh) {
      const instance = new THREE.Matrix4()
      hit.object.getMatrixAt(hit.instanceId, instance)
      world.multiply(instance)
    }
    const normal = hit.face.normal.clone().transformDirection(world)
    const material = (hit.object as THREE.Mesh).material
    const side = Array.isArray(material) ? material[0]?.side : material?.side
    // A BackSide hit is on the geometry's back face: its visible side faces the other way.
    const dot = normal.dot(direction) * (side === THREE.BackSide ? -1 : 1)
    return dot < 0 ? 0 : 1
  }
  return [...hits].sort((a, b) =>
    Math.abs(a.distance - b.distance) > tolerance ? a.distance - b.distance : facing(a) - facing(b),
  )
}

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
  // Rapier reports a hit at distance zero when a ray begins inside the window's
  // solid barrier. Start beyond the destination thickness, including oblique rays.
  const exit = document.entities.find((e) => e.id === destination)!
  const localDirection = direction
    .clone()
    .applyQuaternion(new THREE.Quaternion(...sim.entityTransform(gate.id, true).rotation).invert())
  const travel = closest + (exit.size[2] / 2 + 0.02) / Math.abs(localDirection.z)
  if (travel >= range) return { camera, range, throughPortal: false }
  const remote = camera.clone()
  const point = camera.position.clone().addScaledVector(direction, travel).applyMatrix4(mapping)
  remote.position.copy(point)
  remote.quaternion.premultiply(new THREE.Quaternion().setFromRotationMatrix(mapping))
  remote.updateMatrixWorld(true)
  return { camera: remote, range: range - travel, throughPortal: true }
}

export class Gallery {
  lastGlassImpact: [number, number, number] | null = null
  /** Where the last shot rang a surface, and which kind (`config/impact-sounds.ts`); null when silent. */
  lastImpact: { point: [number, number, number]; surface: ImpactSurface } | null = null
  /** Solid hit of the last `shoot` (entity, world point and normal, damage applied); else null. */
  lastHit: {
    entityId: string | null
    point: Vec3Tuple
    normal: Vec3Tuple
    damage: number
  } | null = null
  /** Where the last shot burst a balloon and how big the explosion is (1 = a vehicle); null when none. */
  lastBurst: { point: [number, number, number]; scale: number } | null = null
  private elapsed = 0
  private remaining = 60
  private started = false
  private hits = 0
  private shots = 0
  private respawn = new Map<string, number>()
  private readonly hud = document.createElement('div')
  constructor(
    viewport: HTMLElement,
    private readonly text: RuntimeText = createRuntimeText(),
  ) {
    this.hud.className = 'gallery-score'
    Object.assign(this.hud.style, {
      position: 'absolute',
      right: '18px',
      top: '18px',
      padding: '8px 12px',
      background: '#102035dd',
      border: '1px solid #5bacff',
      borderRadius: '5px',
      font: '12px system-ui',
      color: '#fff',
      pointerEvents: 'none',
      zIndex: '5',
    })
    this.hud.hidden = true
    viewport.append(this.hud)
  }
  dispose(): void {
    this.hud.remove()
    this.respawn.clear()
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
      const sprite = view.sprites.get(e.id)
      if (!sprite) return
      sprite.visible = this.remaining > 0 && (this.respawn.get(e.id) ?? 0) <= this.elapsed
      sprite.position.x = Math.sin(this.elapsed * 0.8 + i) * 1.5
    })
    this.hud.textContent = this.text(
      'Gallery · {0}/{1} · {2} s · N restart',
      this.hits,
      this.shots,
      Math.ceil(this.remaining),
    )
    this.hud.dataset.hits = String(this.hits)
  }
  shoot(
    sim: Simulation,
    view: SceneView,
    camera: THREE.PerspectiveCamera,
    range = 150,
    impulse = 12,
    damage = 0,
  ): boolean {
    this.lastGlassImpact = null
    this.lastImpact = null
    this.lastHit = null
    this.lastBurst = null
    let rayView = shotView(sim, view.document, camera, range)
    const foreground = new THREE.Raycaster()
    foreground.setFromCamera(new THREE.Vector2(), camera)
    const obstruction = view.hitSprite(foreground)
    if (rayView.throughPortal && obstruction && obstruction.distance < range - rayView.range)
      rayView = { camera, range, throughPortal: false }
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
    // Trunk balloons are render-only: a shot that reaches one first bursts it like a small explosion.
    const popped = view.destruction.balloons.shoot(
      ray.ray.origin,
      ray.ray.direction,
      solid ? ray.ray.origin.distanceTo(new THREE.Vector3(...solid.point)) : rayView.range,
    )
    if (popped) {
      const { scale, damagesVehicles, vehiclePush } = balloonTuning.burst
      view.destruction.burst(popped.point, scale)
      sim.blast(popped.point.toArray(), scale, damagesVehicles, vehiclePush)
      this.lastBurst = { point: popped.point.toArray() as Vec3Tuple, scale }
      return true
    }
    // Host instanced scenery can handle exact visible-surface hits (including instance id).
    const sceneryRay = new THREE.Raycaster(
      ray.ray.origin.clone().add(view.root.position),
      ray.ray.direction,
      0,
      solid
        ? Math.min(
            rayView.range,
            ray.ray.origin.distanceTo(new THREE.Vector3(...solid.point)) + 0.02,
          )
        : rayView.range,
    )
    const scenery: THREE.Object3D[] = []
    view.root.traverseVisible((object) => {
      if (typeof object.userData.sceneryShot === 'function') scenery.push(object)
    })
    for (const surface of orderSceneryHits(
      sceneryRay.intersectObjects(scenery, false),
      ray.ray.direction,
    )) {
      if (surface.object.userData.sceneryShot(surface, ray.ray.direction, impulse)) {
        // Hand-handled scenery (instanced signs) rings as the mesh says, else as a sign.
        const kind = surface.object.userData.impactSurface
        const ringing = kind === null ? null : isImpactSurface(kind) ? kind : sceneryImpactSurface
        if (ringing)
          this.lastImpact = {
            point: surface.point.clone().sub(view.root.position).toArray() as Vec3Tuple,
            surface: ringing,
          }
        return true
      }
    }
    const glassPoint = view.brokenGlass.hit(
      view.document.entities
        .filter((entity) => entity.vehicle)
        .map((entity) => view.objects.get(entity.id))
        .filter((object): object is THREE.Group => !!object),
      ray.ray.origin.clone().add(view.root.position),
      ray.ray.direction,
      solid
        ? Math.min(range, ray.ray.origin.distanceTo(new THREE.Vector3(...solid.point)) + 0.75)
        : range,
    )
    if (glassPoint) {
      const point = glassPoint.clone().sub(view.root.position)
      this.lastGlassImpact = point.toArray()
      view.destruction.glass(point, ray.ray.direction)
      return true
    }
    const hit = sim.shoot(
      ray.ray.origin.toArray(),
      ray.ray.direction.toArray(),
      rayView.range,
      impulse,
    )
    if (hit) {
      sim.damageVehicle(hit.entityId, damage)
      this.lastHit = {
        entityId: hit.entityId,
        point: [...hit.point] as Vec3Tuple,
        normal: [...hit.normal] as Vec3Tuple,
        damage,
      }
      // Scene entities (vehicles, props): parent the mark so it rides with them.
      // Planet buildings and other static colliders have no entity id — anchor in
      // view.root, which shares the floating-origin shift with world meshes.
      const object = hit.entityId ? view.objects.get(hit.entityId) : undefined
      const surface =
        hit.surface ??
        (hit.entityId &&
        view.document.entities.some((entity) => entity.id === hit.entityId && entity.vehicle)
          ? vehicleImpactSurface
          : null)
      if (surface) this.lastImpact = { point: [...hit.point] as Vec3Tuple, surface }
      if (object && hit.entityId) {
        // Physics hulls can sit inside truck/trailer bodywork. Find the visible skin
        // along the same shot instead of leaving the mark hidden inside that hull.
        object.updateWorldMatrix(true, true)
        const skinRay = new THREE.Raycaster(
          ray.ray.origin.clone().add(view.root.position),
          ray.ray.direction.clone(),
          0,
          ray.ray.origin.distanceTo(new THREE.Vector3(...hit.point)) + 2,
        )
        const skin = skinRay.intersectObject(object, true).find((candidate) => {
          if (!candidate.face || !(candidate.object as THREE.Mesh).isMesh) return false
          let node: THREE.Object3D | null = candidate.object
          while (node) {
            if (!node.visible || node.name === 'shot-impact') return false
            node = node.parent
          }
          return true
        })
        if (skin?.face) {
          const normal = skin.face.normal
            .clone()
            .applyMatrix3(new THREE.Matrix3().getNormalMatrix(skin.object.matrixWorld))
            .normalize()
          if (normal.dot(skinRay.ray.direction) > 0) normal.negate()
          view.impacts.addSurface(skin.object, skin.point.toArray(), normal.toArray())
        } else {
          view.impacts.add(object, sim.entityTransform(hit.entityId), hit.point, hit.normal)
        }
        if (damage > 0)
          view.destruction.balloons.hit(object, new THREE.Vector3(...hit.point), ray.ray.direction)
      } else {
        // Static colliders (host scenery layers, pole boxes, terrain) can differ from what is
        // drawn: put the mark on the visible surface met along the same shot near the hit.
        const skin = visibleSurfaceNear(view.root, ray.ray, new THREE.Vector3(...hit.point))
        view.impacts.addWorld(view.root, skin?.point ?? hit.point, skin?.normal ?? hit.normal)
      }
    }
    return !!hit
  }
}

/** How far from the physics hit the drawn surface may be and still take the mark, metres. */
const SKIN_REACH = 0.5

/**
 * The first visible mesh surface (instanced meshes included) along `ray` within
 * {@link SKIN_REACH} of `hit`, in `root`'s frame. Only meshes whose bounds reach the hit are
 * tested, so a shot costs a few bounding-sphere checks plus the nearby triangles.
 */
function visibleSurfaceNear(
  root: THREE.Object3D,
  ray: THREE.Ray,
  hit: THREE.Vector3,
): { point: Vec3Tuple; normal: Vec3Tuple } | null {
  root.updateWorldMatrix(true, true)
  const offset = root.position
  const at = hit.clone().add(offset)
  const sphere = new THREE.Sphere()
  const candidates: THREE.Mesh[] = []
  root.traverseVisible((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh || object.name === 'shot-impact' || !mesh.geometry) return
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
    const bounds = (mesh as THREE.InstancedMesh).isInstancedMesh
      ? ((mesh as THREE.InstancedMesh).boundingSphere ??
        ((mesh as THREE.InstancedMesh).computeBoundingSphere(),
        (mesh as THREE.InstancedMesh).boundingSphere))
      : mesh.geometry.boundingSphere
    if (!bounds) return
    sphere.copy(bounds).applyMatrix4(mesh.matrixWorld)
    if (sphere.distanceToPoint(at) <= SKIN_REACH) candidates.push(mesh)
  })
  if (!candidates.length) return null
  const origin = ray.origin.clone().add(offset)
  const distance = origin.distanceTo(at)
  const caster = new THREE.Raycaster(
    origin,
    ray.direction.clone().normalize(),
    Math.max(0, distance - SKIN_REACH),
    distance + SKIN_REACH,
  )
  const surface = caster.intersectObjects(candidates, false).find((candidate) => !!candidate.face)
  if (!surface?.face) return null
  const matrix = surface.object.matrixWorld.clone()
  const instanced = surface.object as THREE.InstancedMesh
  if (instanced.isInstancedMesh && surface.instanceId !== undefined) {
    const instance = new THREE.Matrix4()
    instanced.getMatrixAt(surface.instanceId, instance)
    matrix.multiply(instance)
  }
  const normal = surface.face.normal
    .clone()
    .applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix))
    .normalize()
  if (normal.dot(caster.ray.direction) > 0) normal.negate()
  return {
    point: surface.point.clone().sub(offset).toArray() as Vec3Tuple,
    normal: normal.toArray() as Vec3Tuple,
  }
}
