/**
 * Exhaust outlets and smoke of a vehicle from its data (`vehicle.exhaust`), the same for every
 * vehicle: no model, adapter or vehicle class decides where smoke comes out or how much.
 */
import * as THREE from 'three'
import type { VehicleDefinition } from '../../entity/vehicle/field.js'
import { s3SmokeAmount, type ExhaustSmokeOptions } from '../entity/exhaust-smoke.js'

export type ExhaustData = NonNullable<VehicleDefinition['exhaust']>
export type ExhaustAmount = NonNullable<NonNullable<ExhaustData['smoke']>['amount']>

/** First node of a model tagged `extras.nabla.anchor = name`, if any. */
export function anchoredNode(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined
  root.traverse((node) => {
    if (!found && node.userData.nabla?.anchor === name) found = node
  })
  return found
}

/**
 * The outlet nodes of a model: sockets created at `data.outlets` when it lists them, else one
 * socket on the node tagged `extras.nabla.anchor = "exhaust"` (centred on its geometry; the node
 * named `Exhaust_Outlet_Closure` is the deprecated fallback). Empty when the model has neither.
 */
export function exhaustOutlets(model: THREE.Object3D, data?: ExhaustData): THREE.Object3D[] {
  if (data?.outlets?.length)
    return data.outlets.map((position) => {
      const socket = new THREE.Object3D()
      socket.name = 'Exhaust smoke outlet'
      socket.position.fromArray(position)
      model.add(socket)
      return socket
    })
  const outlet = anchoredNode(model, 'exhaust') ?? model.getObjectByName('Exhaust_Outlet_Closure')
  if (!outlet) return []
  const socket = new THREE.Object3D()
  socket.name = 'Exhaust smoke socket'
  if (outlet instanceof THREE.Mesh) {
    outlet.geometry.computeBoundingBox()
    outlet.geometry.boundingBox?.getCenter(socket.position)
  }
  outlet.add(socket)
  return [socket]
}

/** Smoke options of the data: only what the vehicle states, the rest stays at the smoke defaults. */
export function exhaustSmokeOptions(data?: ExhaustData): ExhaustSmokeOptions {
  const smoke = data?.smoke
  const options: ExhaustSmokeOptions = {}
  if (data?.direction) options.direction = data.direction
  if (smoke?.emissionRate !== undefined) options.emissionRate = smoke.emissionRate
  if (smoke?.capacity !== undefined) options.capacity = smoke.capacity
  if (smoke?.color) options.color = smoke.color
  if (smoke?.clearColor) options.clearColor = smoke.clearColor
  if (smoke?.clearAtKmh !== undefined) options.clearAtKmh = smoke.clearAtKmh
  if (smoke?.size !== undefined) options.size = smoke.size
  return options
}

/** Smoke quantity multiplier for the current engine state; `manual` is the player's slider. */
export function exhaustSmokeAmount(
  mode: ExhaustAmount | undefined,
  engine: { rpm: number; engineLoad: number },
  manual = 1,
): number {
  switch (mode) {
    case 'load':
      return THREE.MathUtils.lerp(0.1, 1, THREE.MathUtils.clamp(engine.engineLoad, 0, 1))
    case 'rpm':
      return s3SmokeAmount(engine.rpm, engine.engineLoad)
    case 'manual':
      return manual
    default:
      return 1
  }
}
