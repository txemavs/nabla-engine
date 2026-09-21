import { driverHeadPose } from './driving-camera.js'
import { createMonitorAvatar, MonitorMotion } from './avatar.js'
import { createPortalSurface, type PortalSurface } from './portals.js'
import { PORTAL_BAR } from '../src/portal.js'
import { assets, disposeObject } from './assets.js'
import { vehicleDefinition, type VisualDefinition } from '../src/index.js'
import * as THREE from 'three'
import {
  SceneGraph,
  type SceneDocument,
  type Entity,
  type Simulation,
  type Transform,
} from '../src/index.js'

function mesh(geometry: THREE.BufferGeometry, color: string, roughness = 0.72): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({ color, roughness })
  const m = new THREE.Mesh(geometry, material)
  m.castShadow = true
  m.receiveShadow = true
  return m
}
function box(size: number[], color: string): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(...(size as [number, number, number])), color)
}
export function applyPose(object: THREE.Object3D, pose: Transform): void {
  object.position.fromArray(pose.position)
  object.quaternion.fromArray(pose.rotation)
}
export class SceneView {
  readonly root = new THREE.Group()
  readonly objects = new Map<string, THREE.Group>()
  readonly portals = new Map<string, PortalSurface>()
  readonly wheels = new Map<string, THREE.Group[]>()
  readonly steering = new Map<string, THREE.Group>()
  readonly ramps = new Map<string, THREE.Group>()
  readonly ready: Promise<void>
  private readonly loading: Promise<void>[] = []
  private disposed = false
  readonly avatar = new THREE.Group()
  private readonly monitor = createMonitorAvatar()
  private readonly monitorMotion = new MonitorMotion()
  private readonly graph: SceneGraph
  constructor(readonly document: SceneDocument) {
    this.graph = new SceneGraph(document)
    for (const e of document.entities) {
      const group = new THREE.Group()
      group.userData.entityId = e.id
      this.objects.set(e.id, group)
      this.root.add(group)
      applyPose(group, this.graph.worldTransform(e.id))
      if (e.portal) {
        const portal = createPortalSurface(e)
        this.portals.set(e.id, portal)
        group.add(portal.mesh)
        const [w, h, d] = e.size
        this.addAsset(
          group,
          {
            url: '/world/portal.frame.glb',
            transform: { position: [0, -(h + 2 * PORTAL_BAR) / 2, 0], rotation: [0, 0, 0, 1] },
          },
          undefined,
          (model) => {
            model.scale.set((w + 2 * PORTAL_BAR) / 3.436068, (h + 2 * PORTAL_BAR) / 2.2, d / 0.08)
          },
        )
        const light = mesh(
          new THREE.BoxGeometry(w * 0.7, 0.035, 0.02),
          e.portal.mode === 'open' ? '#5bacff' : e.portal.mode === 'window' ? '#accbff' : '#354254',
        )
        light.position.set(0, h / 2 + PORTAL_BAR / 2, d / 2 + 0.015)
        group.add(light)
      }
      if (e.kind === 'box') group.add(box(e.size, e.color))
      if (e.kind === 'vehicle') {
        if (e.visual) this.assetVehicle(e, group)
        else this.car(e, group)
      }
      if (e.kind === 'spawn') {
        const ring = mesh(new THREE.TorusGeometry(0.55, 0.04, 8, 40), '#79b7ff')
        ring.rotation.x = -Math.PI / 2
        ring.position.y = 0.05
        const marker = mesh(new THREE.ConeGeometry(0.18, 0.5, 4), '#79b7ff')
        marker.position.y = 0.65
        group.add(ring, marker)
      }
    }
    for (const entity of this.document.entities) {
      if (!entity.surface) continue
      const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 })
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(entity.size[0], entity.size[2]),
        material,
      )
      plane.rotation.x = -Math.PI / 2
      plane.position.y = entity.size[1] / 2 + 0.006
      plane.receiveShadow = true
      this.objects.get(entity.id)!.add(plane)
      this.loading.push(
        new Promise<void>((resolve, reject) => {
          new THREE.TextureLoader().load(
            entity.surface!.url,
            (texture) => {
              if (this.disposed) {
                texture.dispose()
                resolve()
                return
              }
              texture.colorSpace = THREE.SRGBColorSpace
              material.map = texture
              material.needsUpdate = true
              this.surfaceTextures.push(texture)
              resolve()
            },
            undefined,
            reject,
          )
        }),
      )
    }
    this.avatar.add(this.monitor)
    this.avatar.visible = false
    this.root.add(this.avatar)
    this.ready = Promise.all(this.loading).then(() => undefined)
  }
  private addAsset(
    parent: THREE.Group,
    part: VisualDefinition['body'],
    fallback?: THREE.Object3D,
    prepare?: (model: THREE.Group) => void,
  ): void {
    this.loading.push(
      assets.instantiate(part.url).then((model) => {
        if (this.disposed) {
          disposeObject(model)
          return
        }
        applyPose(model, part.transform)
        parent.add(model)
        prepare?.(model)
        if (fallback) {
          fallback.removeFromParent()
          disposeObject(fallback)
        }
      }),
    )
  }
  private assetVehicle(e: Entity, group: THREE.Group): void {
    const visual = e.visual!,
      definition = vehicleDefinition(e)
    const fallback = box(e.size, e.color)
    group.add(fallback)
    this.addAsset(group, visual.body, fallback, (model) => {
      if (!visual.ramp) return
      const hinge = new THREE.Group()
      hinge.position.fromArray(visual.ramp.hinge)
      model.add(hinge)
      for (const name of visual.ramp.nodes) {
        const part = model.getObjectByName(name)
        if (!part) throw new Error('Missing ramp node: ' + name)
        hinge.attach(part)
      }
      this.ramps.set(e.id, hinge)
    })
    if (visual.wheel) {
      const wheels = definition.hubs.map((hub, i) => {
        const wheel = new THREE.Group()
        wheel.position.fromArray(hub)
        group.add(wheel)
        const orientation = new THREE.Group()
        if (visual.wheelRotations) orientation.quaternion.fromArray(visual.wheelRotations[i])
        wheel.add(orientation)
        this.addAsset(orientation, visual.wheel!)
        return wheel
      })
      this.wheels.set(e.id, wheels)
    }
    if (visual.steering) {
      const mount = new THREE.Group(),
        spin = new THREE.Group()
      applyPose(mount, visual.steering.transform)
      mount.add(spin)
      group.add(mount)
      this.addAsset(spin, {
        url: visual.steering.url,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
      })
      this.steering.set(e.id, spin)
    }
  }
  private car(e: Entity, group: THREE.Group): void {
    const [w, h, l] = e.size
    const body = box(e.size, e.color)
    const cabin = box([w * 0.83, 0.63, l * 0.45], '#273d49')
    cabin.position.set(0, h / 2 + 0.25, l * 0.045)
    const roof = box([w * 0.84, 0.08, l * 0.46], e.color)
    roof.position.copy(cabin.position).y += 0.34
    group.add(body, cabin, roof)
    for (const x of [-w * 0.32, w * 0.32]) {
      const light = box([0.32, 0.12, 0.045], '#fff0cb')
      light.position.set(x, 0.06, -l / 2 - 0.025)
      const tail = box([0.32, 0.1, 0.045], '#db6a5f')
      tail.position.set(x, 0.06, l / 2 + 0.025)
      group.add(light, tail)
    }
    const wheels: THREE.Group[] = []
    for (const [x, z] of [
      [-w / 2, -l * 0.32],
      [w / 2, -l * 0.32],
      [-w / 2, l * 0.32],
      [w / 2, l * 0.32],
    ]) {
      const geometry = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 20)
      geometry.rotateZ(Math.PI / 2)
      const wheel = mesh(geometry, '#202b33')
      const hub = mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.251, 12), '#afbbc0', 0.4)
      hub.rotation.z = Math.PI / 2
      wheel.add(hub)
      wheel.position.set(x, -h * 0.3 - 0.35, z)
      group.add(wheel)
      const wrapper = new THREE.Group()
      wrapper.position.copy(wheel.position)
      wheel.position.set(0, 0, 0)
      wrapper.add(wheel)
      group.add(wrapper)
      wheels.push(wrapper)
    }
    this.wheels.set(e.id, wheels)
  }
  setPlaying(playing: boolean): void {
    this.avatar.visible = playing
    for (const e of this.document.entities)
      if (e.kind === 'spawn' || (e.kind === 'group' && !e.portal))
        this.objects.get(e.id)!.visible = !playing
  }
  sync(sim: Simulation, elapsed = 1 / 60, cockpit = false, headYaw = 0, headPitch = 0.05): void {
    for (const e of this.document.entities)
      applyPose(this.objects.get(e.id)!, sim.entityTransform(e.id, true))
    for (const [id, wheels] of this.wheels) {
      const poses = sim.wheelTransforms(id, true)
      poses.forEach((p, i) => {
        // Wheel snapshots are in world space; render beneath an identity root.
        this.root.add(wheels[i])
        applyPose(wheels[i], p)
      })
    }
    for (const [id, ramp] of this.ramps)
      ramp.rotation.x = sim.vehicleInfo(id).rampClosed
        ? this.document.entities.find((e) => e.id === id)!.visual!.ramp!.closeAngle
        : 0
    for (const [id, wheel] of this.steering)
      wheel.rotation.z =
        -THREE.MathUtils.clamp(sim.vehicleInfo(id).steer / 0.45, -1, 1) * (Math.PI / 2)
    const vehicleId = sim.player.vehicleId
    if (vehicleId) {
      const info = sim.vehicleInfo(vehicleId, true)
      const head = driverHeadPose(
        info.driver,
        sim.entityTransform(vehicleId, true).rotation,
        info.isCarrier,
        headYaw,
        headPitch,
      )
      this.avatar.position.copy(head.position)
      this.avatar.quaternion.copy(head.quaternion)
      this.monitor.position.set(0, 0, 0)
      this.monitor.quaternion.identity()
      this.monitor.scale.setScalar(1)
      this.monitorMotion.reset()
      this.avatar.visible = !cockpit
    } else {
      this.avatar.position.fromArray(sim.renderPlayerPosition)
      this.avatar.rotation.set(0, sim.player.yaw, 0)
      this.monitor.scale.setScalar(1.65)
      this.monitorMotion.update(this.monitor, this.avatar.position, sim.player.yaw, elapsed)
      this.avatar.visible = true
    }
  }
  private readonly surfaceTextures: THREE.Texture[] = []
  dispose(): void {
    for (const portal of this.portals.values()) portal.target.dispose()
    this.portals.clear()
    this.surfaceTextures.forEach((texture) => texture.dispose())
    this.disposed = true
    this.root.removeFromParent()
    disposeObject(this.root)
  }
}
