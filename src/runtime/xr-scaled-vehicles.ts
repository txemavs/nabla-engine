import * as THREE from 'three'
import { Simulation, idleInput } from '../simulation/simulation.js'
import { initPhysics } from '../simulation/physics.js'
import { createEntity, type Entity, type Transform } from '../entity/schema.js'

/** Run the ordinary vehicle simulation at full size; only the XR boundary changes units. */
export class XRScaledVehicles {
  readonly simulation: Simulation
  private surfaces = new Map<string, { geometry: THREE.BufferGeometry; matrix: string }>()
  private fallback = false
  static async create(
    entities: Entity[],
    scale: number,
    options: ConstructorParameters<typeof Simulation>[1] = {},
  ): Promise<XRScaledVehicles> {
    await initPhysics()
    return new XRScaledVehicles(entities, scale, options)
  }
  private constructor(
    readonly entities: Entity[],
    readonly scale: number,
    options: ConstructorParameters<typeof Simulation>[1],
  ) {
    if (!Number.isFinite(scale) || scale <= 0) throw new Error('Invalid XR model scale')
    this.simulation = new Simulation(
      {
        version: 1,
        name: 'XR vehicles',
        entities: [createEntity('xr-driver', 'spawn', [0, 1, 0]), ...entities],
      },
      options,
    )
    this.simulation.startInVehicle(entities[0].id)
  }
  updateSurfaces(meshes: readonly THREE.Mesh[]): void {
    const seen = new Set<string>()
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false)
      const id = mesh.uuid,
        matrix = mesh.matrixWorld.elements.join(',')
      seen.add(id)
      const old = this.surfaces.get(id)
      if (old?.geometry === mesh.geometry && old.matrix === matrix) continue
      const attribute = mesh.geometry.getAttribute('position'),
        vertices = new Float32Array(attribute.count * 3)
      const point = new THREE.Vector3()
      for (let i = 0; i < attribute.count; i++)
        point
          .fromBufferAttribute(attribute, i)
          .applyMatrix4(mesh.matrixWorld)
          .divideScalar(this.scale)
          .toArray(vertices, i * 3)
      const index = mesh.geometry.index
      const indices = index
        ? Uint32Array.from(index.array)
        : Uint32Array.from({ length: attribute.count }, (_, i) => i)
      this.simulation.setExternalCollisionMesh(id, vertices, indices)
      this.surfaces.set(id, { geometry: mesh.geometry, matrix })
    }
    for (const id of this.surfaces.keys())
      if (!seen.has(id)) {
        this.simulation.setExternalCollisionMesh(id, null)
        this.surfaces.delete(id)
      }
    const hasRoom = meshes.some((m) => !m.userData.xrSupplementalCollision)
    if (!hasRoom && !this.fallback) {
      this.simulation.setExternalCollisionMesh(
        'xr-floor',
        new Float32Array([-10000, 0, -10000, -10000, 0, 10000, 10000, 0, 10000, 10000, 0, -10000]),
        new Uint32Array([0, 1, 2, 0, 2, 3]),
      )
      this.fallback = true
    } else if (hasRoom && this.fallback) {
      this.simulation.setExternalCollisionMesh('xr-floor', null)
      this.fallback = false
    }
  }
  step(
    dt: number,
    input: {
      throttle: number
      steering: number
      brake: number
      handbrake?: boolean
      frontBrake?: number
      rearBrake?: number
      /** Existing Engine flight axes: propulsion and rudder. */
      lift?: number
      forklift?: [number, number, number]
      turn?: number
    },
  ): void {
    this.simulation.setForkliftInput(input.forklift ?? [0, 0, 0])
    this.simulation.setInput({
      ...idleInput(),
      forward: input.throttle,
      lift: input.lift,
      turn: input.turn,
      right: input.steering,
      brake: input.handbrake ?? false,
      frontBrake: input.frontBrake ?? input.brake,
      rearBrake: input.rearBrake ?? input.brake,
    })
    this.simulation.step(dt)
  }
  pose(id: string): Transform {
    const pose = this.simulation.entityTransform(id)
    return {
      position: pose.position.map((v) => v * this.scale) as Transform['position'],
      rotation: pose.rotation,
    }
  }
  /** Picking a hitched trailer releases the ordinary Engine hitch first. */
  beginGrab(id: string): void {
    if (this.simulation.vehicleList().find((vehicle) => vehicle.id === id)?.towedBy)
      this.simulation.unhitchTrailer(id)
  }
  private assemblyIds(id: string): Set<string> {
    const vehicles = this.simulation.vehicleList(),
      ids = new Set([id])
    let changed = true
    while (changed) {
      changed = false
      for (const vehicle of vehicles) {
        if (vehicle.towedBy && (ids.has(vehicle.id) || ids.has(vehicle.towedBy))) {
          if (!ids.has(vehicle.id)) {
            ids.add(vehicle.id)
            changed = true
          }
          if (!ids.has(vehicle.towedBy)) {
            ids.add(vehicle.towedBy)
            changed = true
          }
        }
      }
    }
    return ids
  }
  /** Move all attached bodies together, preserving the real hitch geometry. */
  moveAssembly(id: string, position: THREE.Vector3, rotation: THREE.Quaternion): void {
    const old = this.pose(id),
      inverse = new THREE.Quaternion(...old.rotation).normalize().invert()
    const targetRotation = rotation.clone().normalize()
    // Quaternion.invert() is a conjugate and assumes unit length. Feeding the previous
    // unnormalised result back into delta * old squares its norm on every held frame.
    const delta = targetRotation.clone().multiply(inverse).normalize()
    this.simulation.relocateEntities(
      this.entities
        .filter((entity) => this.assemblyIds(id).has(entity.id))
        .map((entity) => {
          if (entity.id === id)
            return {
              id,
              transform: {
                position: position.clone().divideScalar(this.scale).toArray(),
                rotation: targetRotation.toArray(),
              },
            }
          const pose = this.pose(entity.id)
          const p = new THREE.Vector3(...pose.position)
            .sub(new THREE.Vector3(...old.position))
            .applyQuaternion(delta)
            .add(position)
            .divideScalar(this.scale)
          const q = delta
            .clone()
            .multiply(new THREE.Quaternion(...pose.rotation).normalize())
            .normalize()
          return { id: entity.id, transform: { position: p.toArray(), rotation: q.toArray() } }
        }),
    )
  }
  /** Preserve release motion in real metres; angular speed is independent of model scale. */
  releaseAssembly(id: string, velocity: THREE.Vector3, angularVelocity: THREE.Vector3): void {
    const centre = new THREE.Vector3(...this.pose(id).position)
    this.simulation.releaseEntities(
      this.entities
        .filter((entity) => this.assemblyIds(id).has(entity.id))
        .map((entity) => {
          const offset = new THREE.Vector3(...this.pose(entity.id).position).sub(centre)
          const linear = angularVelocity
            .clone()
            .cross(offset)
            .add(velocity)
            .divideScalar(this.scale)
          return {
            id: entity.id,
            velocity: linear.toArray(),
            angularVelocity: angularVelocity.toArray(),
          }
        }),
    )
  }
  contacts(id: string) {
    return this.simulation.wheelContactInfo(id).map((c) => ({
      contactPoint: c.contactPoint ? c.contactPoint : null,
      contactNormal: c.contactNormal ? c.contactNormal : null,
      slip: c.slip,
    }))
  }
  dispose(): void {
    this.simulation.dispose()
    this.surfaces.clear()
  }
}
