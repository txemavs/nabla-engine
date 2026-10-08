/**
 * Visual kinematics of a motorcycle GLB: handlebar and fork about the steering head axis,
 * telescopic fork travel, swingarm, rear shock and chain, and wheel spin. Presentation only:
 * the pose comes from the simulation (`Simulation.twoWheeledPose`) and nothing here feeds
 * back into physics.
 *
 * The GLB contract (see docs/motorcycles.md) is a set of named parts, each also tagged with
 * `extras.nabla.part`: `Steering_Pivot` (parent of `Fork_Slider`, parent of `Wheel_Front`),
 * `Swingarm_Pivot` (parent of `Wheel_Rear`), `Shock_Body`, `Shock_Rod` and `Chain`, all at
 * their authored rest pose. `Steering_Pivot.extras.nabla` carries the head `axis` and
 * `limits`; `Fork_Slider.extras.nabla.compressionRange` the fork travel.
 *
 * Ported from the asset-only `vfr800fi-1999-controls.mjs` helper of PR #150 (same math), with every
 * point taken from the model's own nodes so all of it shares one frame.
 */
import {
  Box3,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferAttribute,
  type Mesh,
  type Object3D,
} from 'three'

/** Rig parameters the model alone may not carry. Points are in the parts' parent frame. */
export interface MotorcycleRig {
  /** Steering head axis, pointing up the head stock. */
  steeringAxis: [number, number, number]
  /** Handlebar lock each side, radians. */
  steerLimit: number
  /** Fork travel along the steering axis, metres. */
  frontTravel: number
  /** Rear wheel vertical travel, metres. */
  rearTravel: number
  /**
   * Chain span between the sprockets along the model's Z axis, in the chain's local frame.
   * Vertices blend from fixed (front) to moving with the rear hub (rear).
   */
  chain?: { frontZ: number; rearZ: number }
}

/** One frame of articulation. Missing fields are 0 (the authored rest pose). */
export interface MotorcyclePose {
  /** Handlebar rotation about the steering axis, radians, positive to the left. */
  steeringAngle?: number
  /** Fork compression along the steering axis, metres; negative extends. */
  frontCompression?: number
  /** Rear hub rise, metres; negative extends. */
  rearCompression?: number
  /** Wheel rotation about the axle (+X), radians; negative rolls forward (−Z). */
  frontRoll?: number
  rearRoll?: number
}

export interface MotorcycleRigState {
  steeringAngle: number
  swingarmAngle: number
  shockLength: number
}

export interface MotorcycleRigBinding {
  readonly rig: MotorcycleRig
  update(pose?: MotorcyclePose): MotorcycleRigState
  /** Restore the authored rest pose and free the private chain geometry copy. */
  dispose(): void
}

const PARTS = [
  'Steering_Pivot',
  'Fork_Slider',
  'Wheel_Front',
  'Wheel_Rear',
  'Swingarm_Pivot',
  'Shock_Body',
  'Shock_Rod',
  'Chain',
] as const
type PartName = (typeof PARTS)[number]

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))
/** Small extension below the authored pose that the visuals allow, metres. */
const EXTENSION = 0.03

function nablaExtras(object: Object3D): Record<string, unknown> | undefined {
  const nabla = (object.userData as { nabla?: unknown }).nabla
  return nabla && typeof nabla === 'object' ? (nabla as Record<string, unknown>) : undefined
}

/** Find a part by node name, falling back to its `extras.nabla.part` tag. */
function findPart(root: Object3D, name: PartName): Object3D | undefined {
  let found = root.getObjectByName(name)
  if (!found)
    root.traverse((object) => {
      if (!found && nablaExtras(object)?.part === name) found = object
    })
  return found
}

/** True when `root` carries every part `bindMotorcycleRig` needs. */
export function hasMotorcycleRig(root: Object3D): boolean {
  return PARTS.every((name) => findPart(root, name))
}

function requirePart(root: Object3D, name: PartName): Object3D {
  const part = findPart(root, name)
  if (!part) throw new Error(`Missing motorcycle node: ${name}`)
  return part
}

const finiteTuple = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every((n) => Number.isFinite(n))

/**
 * Rig parameters from the GLB extras. The chain span runs from the chain's frontmost vertex
 * to the rear hub; `overrides` replace any field (e.g. from the vehicle definition).
 */
export function motorcycleRigFromModel(
  root: Object3D,
  overrides: Partial<MotorcycleRig> = {},
): MotorcycleRig {
  const steering = nablaExtras(requirePart(root, 'Steering_Pivot')) ?? {}
  const fork = nablaExtras(requirePart(root, 'Fork_Slider')) ?? {}
  const axis = overrides.steeringAxis ?? (finiteTuple(steering.axis) ? steering.axis : null)
  if (!axis) throw new Error('Steering_Pivot needs extras.nabla.axis or a steeringAxis override')
  const limits = steering.limits
  const limit =
    overrides.steerLimit ??
    (Array.isArray(limits) && limits.every(Number.isFinite)
      ? Math.max(...(limits as number[]).map(Math.abs))
      : undefined)
  if (limit === undefined) throw new Error('Steering_Pivot needs extras.nabla.limits')
  const range = fork.compressionRange
  const travel =
    overrides.frontTravel ??
    (Array.isArray(range) && Number.isFinite(range[1]) ? (range[1] as number) : 0.1)
  let chain = overrides.chain
  if (!chain) {
    const mesh = requirePart(root, 'Chain') as Mesh
    const box = mesh.geometry
      ? new Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position') as BufferAttribute)
      : null
    root.updateMatrixWorld(true)
    const hub = requirePart(root, 'Wheel_Rear').getWorldPosition(new Vector3())
    const rearZ = mesh.worldToLocal(hub).z
    if (box && Number.isFinite(box.min.z) && rearZ > box.min.z) chain = { frontZ: box.min.z, rearZ }
  }
  return {
    steeringAxis: [axis[0], axis[1], axis[2]],
    steerLimit: limit,
    frontTravel: travel,
    rearTravel: overrides.rearTravel ?? travel,
    ...(chain ? { chain } : {}),
  }
}

/** Rig parameters from an authored `*.rig.json` (as shipped next to the VFR800 GLB). */
export function motorcycleRigFromJson(json: {
  front: { axis: number[]; steerLimit: number; travel: number }
  rear: { compression: number }
  chain?: { frontSprocket: number[]; rearSprocket: number[] }
}): MotorcycleRig {
  if (!finiteTuple(json.front.axis)) throw new Error('Rig front.axis must be three numbers')
  return {
    steeringAxis: [json.front.axis[0], json.front.axis[1], json.front.axis[2]],
    steerLimit: json.front.steerLimit,
    frontTravel: json.front.travel,
    rearTravel: json.rear.compression,
    ...(json.chain
      ? { chain: { frontZ: json.chain.frontSprocket[2], rearZ: json.chain.rearSprocket[2] } }
      : {}),
  }
}

/** Bind the visual articulation of a motorcycle model; starts at the rest pose. */
export function bindMotorcycleRig(
  root: Object3D,
  rig: MotorcycleRig = motorcycleRigFromModel(root),
): MotorcycleRigBinding {
  const steering = requirePart(root, 'Steering_Pivot'),
    fork = requirePart(root, 'Fork_Slider'),
    arm = requirePart(root, 'Swingarm_Pivot'),
    front = requirePart(root, 'Wheel_Front'),
    rear = requirePart(root, 'Wheel_Rear'),
    shockBody = requirePart(root, 'Shock_Body'),
    shockRod = requirePart(root, 'Shock_Rod'),
    chain = requirePart(root, 'Chain') as Mesh
  if (rear.parent !== arm) throw new Error('Wheel_Rear must be a child of Swingarm_Pivot')
  if (front.parent !== fork || fork.parent !== steering)
    throw new Error('Wheel_Front must hang from Fork_Slider under Steering_Pivot')
  const steerAxis = new Vector3(...rig.steeringAxis).normalize()
  const rest = {
    steering: steering.quaternion.clone(),
    fork: fork.position.clone(),
    arm: arm.quaternion.clone(),
    front: front.quaternion.clone(),
    rear: rear.quaternion.clone(),
    rearPosition: rear.position.clone(),
    shockBody: shockBody.quaternion.clone(),
    shockRod: shockRod.quaternion.clone(),
    rodPosition: shockRod.position.clone(),
  }
  // Shock ends in the shared parent frame: the upper eye is fixed, the lower one rides the arm.
  const top = shockBody.position.clone()
  const restShock = rest.rodPosition.clone().sub(top).normalize()
  const lowerOnArm = rest.rodPosition
    .clone()
    .sub(arm.position)
    .applyQuaternion(rest.arm.clone().invert())
  const restHubParent = rest.rearPosition.clone().applyQuaternion(rest.arm).add(arm.position)
  // Private chain geometry: the model may share buffers with other instances.
  const originalGeometry = chain.geometry
  const chainGeometry = rig.chain && originalGeometry ? originalGeometry.clone() : null
  if (chainGeometry) chain.geometry = chainGeometry
  const chainPositions = chainGeometry?.getAttribute('position') as BufferAttribute | undefined
  const originalChain = chainPositions
    ? Float32Array.from(chainPositions.array as ArrayLike<number>)
    : null
  const radius = Math.hypot(rest.rearPosition.y, rest.rearPosition.z)
  const restAngle = Math.atan2(rest.rearPosition.y, rest.rearPosition.z)
  const axisX = new Vector3(1, 0, 0),
    axisMinusX = new Vector3(-1, 0, 0)
  const spin = new Quaternion(),
    turn = new Quaternion()
  const toChain = new Matrix4()

  function update(pose: MotorcyclePose = {}): MotorcycleRigState {
    const steeringAngle = pose.steeringAngle ?? 0,
      frontCompression = pose.frontCompression ?? 0,
      rearCompression = pose.rearCompression ?? 0,
      frontRoll = pose.frontRoll ?? 0,
      rearRoll = pose.rearRoll ?? 0
    for (const v of [steeringAngle, frontCompression, rearCompression, frontRoll, rearRoll])
      if (!Number.isFinite(v)) throw new Error('Non-finite motorcycle pose')
    const angle = clamp(steeringAngle, -rig.steerLimit, rig.steerLimit)
    steering.quaternion.copy(turn.setFromAxisAngle(steerAxis, angle)).multiply(rest.steering)
    fork.position
      .copy(rest.fork)
      .addScaledVector(steerAxis, clamp(frontCompression, -EXTENSION, rig.frontTravel))
    const rise = clamp(rearCompression, -EXTENSION, rig.rearTravel)
    const theta = Math.asin(clamp((rest.rearPosition.y + rise) / radius, -1, 1)) - restAngle
    arm.quaternion.copy(turn.setFromAxisAngle(axisMinusX, theta)).multiply(rest.arm)
    front.quaternion.copy(spin.setFromAxisAngle(axisX, frontRoll)).multiply(rest.front)
    rear.quaternion.copy(spin.setFromAxisAngle(axisX, rearRoll)).multiply(rest.rear)
    const lower = lowerOnArm.clone().applyQuaternion(arm.quaternion).add(arm.position)
    const swing = new Quaternion().setFromUnitVectors(restShock, lower.clone().sub(top).normalize())
    shockBody.quaternion.copy(swing).multiply(rest.shockBody)
    shockRod.quaternion.copy(swing).multiply(rest.shockRod)
    shockRod.position.copy(lower)
    root.updateMatrixWorld(true)
    if (rig.chain && chainPositions && originalChain && arm.parent) {
      // Hub displacement in the arm's parent frame, then into the chain's local frame.
      const moved = rest.rearPosition.clone().applyQuaternion(arm.quaternion).add(arm.position)
      toChain.copy(chain.matrixWorld).invert().multiply(arm.parent.matrixWorld)
      const a = restHubParent.clone().applyMatrix4(toChain),
        b = moved.applyMatrix4(toChain)
      const delta = b.sub(a)
      const span = rig.chain.rearZ - rig.chain.frontZ
      for (let k = 0; k < chainPositions.count; k++) {
        const t = clamp((originalChain[k * 3 + 2] - rig.chain.frontZ) / span, 0, 1)
        chainPositions.setXYZ(
          k,
          originalChain[k * 3] + delta.x * t,
          originalChain[k * 3 + 1] + delta.y * t,
          originalChain[k * 3 + 2] + delta.z * t,
        )
      }
      chainPositions.needsUpdate = true
      chainGeometry!.computeBoundingSphere()
    }
    return { steeringAngle: angle, swingarmAngle: theta, shockLength: lower.distanceTo(top) }
  }

  update()
  return {
    rig,
    update,
    dispose() {
      update()
      if (chainGeometry) {
        chain.geometry = originalGeometry
        chainGeometry.dispose()
      }
    },
  }
}
