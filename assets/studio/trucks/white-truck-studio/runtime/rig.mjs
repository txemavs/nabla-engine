/** Borrowed Rapier world. Host owns initialization, fixed stepping and world lifetime. */
export function vector(values) {
  return { x: values[0], y: values[1], z: values[2] }
}

export function rotate(q, v) {
  const tx = 2 * (q.y * v.z - q.z * v.y)
  const ty = 2 * (q.z * v.x - q.x * v.z)
  const tz = 2 * (q.x * v.y - q.y * v.x)
  return {
    x: v.x + q.w * tx + q.y * tz - q.z * ty,
    y: v.y + q.w * ty + q.z * tx - q.x * tz,
    z: v.z + q.w * tz + q.x * ty - q.y * tx,
  }
}

export function anchorWorld(vehicle) {
  const offset = rotate(vehicle.body.rotation(), vector(vehicle.config.anchor))
  const p = vehicle.body.translation()
  return { x: p.x + offset.x, y: p.y + offset.y, z: p.z + offset.z }
}

function speed(body) {
  const v = body.linvel()
  return Math.hypot(v.x, v.y, v.z)
}

export function massProperties(config) {
  const tare = config.tareMassKg ?? config.massKg
  const cargo = config.cargoMassKg ?? 0
  if (!Number.isFinite(tare) || tare <= 0 || !Number.isFinite(cargo) || cargo < 0)
    throw new Error('Tare must be positive and cargo must be nonnegative, in kilograms')
  const mass = tare + cargo
  const center = (config.cargoCenterOfMass ?? [0, 0, 0]).map((n) => (n * cargo) / mass)
  const offset = config.cargoCenterOfMass ?? [0, 0, 0]
  const size = config.cargoSize ?? [0, 0, 0]
  const inertia = config.inertiaKgM2.map((value, axis) => {
    const others = [0, 1, 2].filter((i) => i !== axis)
    return (
      value +
      others.reduce(
        (sum, i) =>
          sum +
          (cargo * size[i] ** 2) / 12 +
          tare * center[i] ** 2 +
          cargo * (offset[i] - center[i]) ** 2,
        0,
      )
    )
  })
  return { mass, center, inertia }
}

function applyMass(body, config) {
  const properties = massProperties(config)
  body.setAdditionalMassProperties(
    properties.mass,
    vector(properties.center),
    vector(properties.inertia),
    { x: 0, y: 0, z: 0, w: 1 },
    true,
  )
  body.recomputeMassPropertiesFromColliders()
}

function createVehicle(R, world, config, position) {
  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(...position)
      .setLinearDamping(0.025)
      .setAngularDamping(0.4)
      .setCanSleep(false)
      .setCcdEnabled(true),
  )
  for (const shape of config.colliders) {
    const collider = R.ColliderDesc.cuboid(...shape.size.map((n) => n / 2))
      .setTranslation(...shape.position)
      .setDensity(0)
      .setFriction(0.6)
    world.createCollider(collider, body)
  }
  const landingGear = (config.landingGear ?? []).map((shape) =>
    world.createCollider(
      R.ColliderDesc.cuboid(...shape.size.map((n) => n / 2))
        .setTranslation(...shape.position)
        .setDensity(0)
        .setFriction(1),
      body,
    ),
  )
  applyMass(body, config)
  const controller = world.createVehicleController(body)
  controller.indexUpAxis = 1
  controller.setIndexForwardAxis = 2
  config.wheels.forEach((wheel, index) => {
    const hub = [...wheel.hub]
    hub[1] += config.suspensionRest
    controller.addWheel(
      vector(hub),
      vector([0, -1, 0]),
      vector([1, 0, 0]),
      config.suspensionRest,
      wheel.radius,
    )
    controller.setWheelSuspensionStiffness(index, config.stiffness)
    controller.setWheelSuspensionCompression(index, 5.5)
    controller.setWheelSuspensionRelaxation(index, 4)
    controller.setWheelMaxSuspensionTravel(index, 0.25)
    controller.setWheelMaxSuspensionForce(index, 150000)
    controller.setWheelFrictionSlip(index, 3)
  })
  return { body, controller, config, landingGear, steer: 0 }
}

export function createRig(R, world, manifest, options = {}) {
  manifest = structuredClone(manifest)
  massProperties(manifest.tractor)
  massProperties(manifest.trailer)
  const mode = options.mode ?? 'coupled'
  if (!manifest.modes.includes(mode)) throw new Error('Unknown vehicle mode')
  const origin = options.origin ?? [0, 0, 0]
  const base = [origin[0], origin[1] + manifest.tractor.spawnHeight, origin[2]]
  const tractorPosition = [...base]
  if (mode === 'separated') tractorPosition[2] -= 2
  const tractor =
    mode === 'trailer' ? null : createVehicle(R, world, manifest.tractor, tractorPosition)
  const trailerPosition =
    mode === 'trailer'
      ? base
      : base.map((n, i) => n + manifest.tractor.anchor[i] - manifest.trailer.anchor[i])
  const trailer =
    mode === 'tractor' ? null : createVehicle(R, world, manifest.trailer, trailerPosition)
  let joint = null
  let disposed = false

  function assertLive() {
    if (disposed) throw new Error('Rig has been disposed')
  }

  function anchorError() {
    if (!tractor || !trailer) return null
    const a = anchorWorld(tractor)
    const b = anchorWorld(trailer)
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
  }

  function attach() {
    assertLive()
    if (joint) return { ok: true }
    if (!tractor || !trailer) return { ok: false, reason: 'Both vehicles are required' }
    const forwardA = rotate(tractor.body.rotation(), vector([0, 0, -1]))
    const forwardB = rotate(trailer.body.rotation(), vector([0, 0, -1]))
    const alignment = forwardA.x * forwardB.x + forwardA.z * forwardB.z
    if (alignment < Math.cos(0.2)) return { ok: false, reason: 'Align the vehicles first' }
    if (Math.max(speed(tractor.body), speed(trailer.body)) > manifest.coupling.captureSpeed)
      return { ok: false, reason: 'Stop both vehicles first' }
    if (anchorError() > manifest.coupling.captureDistance)
      return { ok: false, reason: 'Coupling anchors are too far apart' }
    const description = R.JointData.revolute(
      vector(tractor.config.anchor),
      vector(trailer.config.anchor),
      vector(manifest.coupling.axis),
    )
    joint = world.createImpulseJoint(description, tractor.body, trailer.body, true)
    joint.setLimits(...manifest.coupling.limits)
    joint.setContactsEnabled(false)
    trailer.landingGear.forEach((collider) => collider.setEnabled(false))
    return { ok: true }
  }

  function detach() {
    assertLive()
    if (!joint) return { ok: true }
    if (Math.max(speed(tractor.body), speed(trailer.body)) > manifest.coupling.captureSpeed)
      return { ok: false, reason: 'Stop both vehicles before uncoupling' }
    world.removeImpulseJoint(joint, true)
    joint = null
    trailer.landingGear.forEach((collider) => collider.setEnabled(true))
    return { ok: true }
  }

  function beforeStep(dt, input = {}) {
    assertLive()
    if (!Number.isFinite(dt) || dt <= 0 || dt > 1 / 30)
      throw new Error('Use a fixed physics step between 0 and 1/30 seconds')
    const throttle = input.throttle ?? 0
    const steering = input.steering ?? 0
    const brake = input.brake ?? 0
    if (
      ![throttle, steering, brake].every(Number.isFinite) ||
      Math.abs(throttle) > 1 ||
      Math.abs(steering) > 1 ||
      brake < 0 ||
      brake > 1
    )
      throw new Error('Inputs must be finite and normalized')
    const bodies = [tractor, trailer].filter(Boolean)
    for (const vehicle of bodies) {
      const { controller, config, body } = vehicle
      const parked = vehicle === trailer && !joint
      const velocity = speed(body)
      const desired = vehicle === tractor ? (-steering * 0.42) / (1 + velocity * 0.04) : 0
      vehicle.steer += Math.max(-dt, Math.min(dt, desired - vehicle.steer))
      config.wheels.forEach((wheel, index) => {
        controller.setWheelSteering(index, wheel.steering ? vehicle.steer : 0)
        controller.setWheelEngineForce(
          index,
          wheel.driven && !brake && !input.parkingBrake ? throttle * config.engineForcePerWheel : 0,
        )
        controller.setWheelBrake(
          index,
          config.brakeImpulse * (parked || input.parkingBrake ? 1 : brake),
        )
      })
      controller.updateVehicle(
        dt,
        undefined,
        undefined,
        (collider) => !bodies.some((other) => collider.parent()?.handle === other.body.handle),
      )
    }
  }

  function telemetry() {
    assertLive()
    return {
      coupled: !!joint,
      anchorError: anchorError(),
      speedMps: tractor ? speed(tractor.body) : 0,
      trailerMassKg: trailer ? massProperties(trailer.config).mass : null,
      vehicles: [tractor, trailer].filter(Boolean).map((v) => ({
        position: v.body.translation(),
        rotation: v.body.rotation(),
        contacts: v.config.wheels.map((_, i) => v.controller.wheelIsInContact(i)),
      })),
    }
  }

  function setCargoMass(kilograms) {
    assertLive()
    if (!trailer) return { ok: false, reason: 'A trailer is required' }
    if (!Number.isFinite(kilograms) || kilograms < 0)
      throw new Error('Cargo must be finite and nonnegative, in kilograms')
    if ([tractor, trailer].filter(Boolean).some((v) => speed(v.body) > 0.3))
      return { ok: false, reason: 'Stop before changing cargo' }
    trailer.config.cargoMassKg = kilograms
    applyMass(trailer.body, trailer.config)
    return { ok: true }
  }

  function dispose() {
    if (disposed) return
    if (joint) world.removeImpulseJoint(joint, false)
    for (const vehicle of [tractor, trailer].filter(Boolean)) {
      world.removeVehicleController(vehicle.controller)
      world.removeRigidBody(vehicle.body)
    }
    disposed = true
  }

  if (mode === 'coupled') {
    const result = attach()
    if (!result.ok) {
      dispose()
      throw new Error(result.reason)
    }
  }
  return { tractor, trailer, beforeStep, attach, detach, setCargoMass, telemetry, dispose }
}
