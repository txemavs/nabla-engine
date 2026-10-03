import { expect, it, describe } from 'vitest'
import { Body, Box, Vec3, World, HitchConstraint } from '../../src/simulation/physics.js'
import {
  createWheeledVehicle,
  stepWheeledVehicle,
  idleWheeledInput,
  wheelContacts,
  wheeledTelemetry,
  createDrivetrain,
  stepDrivetrain,
  engineBrakingForce,
  getDrivetrainTuning,
  type WheeledDefinition,
  type DrivetrainProfile,
} from '../../src/simulation/vehicles/wheeled/index.js'
import {
  createTrailer,
  stepTrailer,
  idleTrailerInput,
  trailerWheelContacts,
  type TrailerDefinition,
} from '../../src/simulation/vehicles/trailer/index.js'

const truckDefinition = (profile?: DrivetrainProfile): WheeledDefinition => ({
  hubConfigs: [
    {
      position: [-1.0751686, -0.6225349, -1.3792322],
      steered: true,
      driven: false,
      radius: 0.577465,
    },
    {
      position: [1.0808938, -0.6225349, -1.379232],
      steered: true,
      driven: false,
      radius: 0.577465,
    },
    {
      position: [-0.9568073, -0.6276177, 2.2889794],
      steered: false,
      driven: true,
      radius: 0.5723822,
    },
    {
      position: [0.9319417, -0.6276177, 2.2882289],
      steered: false,
      driven: true,
      radius: 0.5723822,
    },
  ],
  wheelRadius: 0.5723822,
  suspensionRest: 0.22,
  suspensionTravel: 0.35,
  stiffness: 110,
  engineForce: 24000,
  brakeForce: 120,
  powertrain: {
    powerCv: 420,
    torqueNm: 2100,
    ratios: [12.0, 8.5, 6.0, 4.2, 3.0, 2.1, 1.5, 1.0, 0.75],
    finalDrive: 3.5,
    grip: 5.0,
    profile,
  },
})

const trailerDefinition = (): TrailerDefinition => ({
  kingpin: [0, 0, -5.565219856],
  axles: [
    {
      hubs: [
        [-0.892075, -0.6276177, 1.775093],
        [0.9086138, -0.6276177, 1.790873],
      ],
      wheelRadius: 0.5723822,
    },
    {
      hubs: [
        [-0.8920751, -0.6276177, 3.07269],
        [0.9086138, -0.6276177, 3.087616],
      ],
      wheelRadius: 0.5723822,
    },
    {
      hubs: [
        [-0.892075, -0.6276177, 4.395842],
        [0.9086138, -0.6276177, 4.410768],
      ],
      wheelRadius: 0.5723822,
    },
  ],
  suspensionRest: 0.22,
  suspensionTravel: 0.35,
  stiffness: 110,
  brakeForce: 120,
})

const tractorChassis = (x = 0) =>
  new Body({
    mass: 7500,
    position: new Vec3(x, 1.2, 0),
    shape: new Box(new Vec3(1.0, 0.5, 2.5)),
  })

const trailerChassis = (x = 0) =>
  new Body({
    mass: 6500,
    position: new Vec3(x, 1.2, 8),
    shape: new Box(new Vec3(1.24, 1.22, 6.7)),
  })

describe('truck tractor', () => {
  it('accelerates and steers with rear-wheel drive and truck powertrain', () => {
    const world = new World()
    const floor = new Body({
      shape: new Box(new Vec3(500, 0.5, 500)),
      position: new Vec3(0, -0.5, 0),
    })
    world.addBody(floor)

    const truck = createWheeledVehicle(tractorChassis(), truckDefinition())
    truck.raycast.addToWorld(world)

    const tick = (n: number, input: ReturnType<typeof idleWheeledInput>, active = true) => {
      for (let i = 0; i < n; i++) {
        stepWheeledVehicle(truck, input, 1 / 60, active)
        world.step(1 / 60)
        for (let w = 0; w < 4; w++) truck.raycast.updateWheelTransform(w)
      }
    }

    try {
      tick(120, idleWheeledInput(), false)

      const settledContacts = wheelContacts(truck, idleWheeledInput(), false)
      const numInContact = settledContacts.filter((c) => c.isInContact).length
      expect(numInContact).toBeGreaterThanOrEqual(3)

      tick(300, { ...idleWheeledInput(), throttle: 1 }, true)

      const telemetry = wheeledTelemetry(truck, { ...idleWheeledInput(), throttle: 1 }, true)
      expect(telemetry.speedMps).toBeGreaterThan(3)

      const contacts = wheelContacts(truck, idleWheeledInput(), true)
      expect(contacts.filter((c) => c.isInContact).length).toBeGreaterThanOrEqual(2)
    } finally {
      truck.raycast.removeFromWorld(world)
      for (const body of [...world.bodies]) world.removeBody(body)
      world.raw.free()
    }
  })

  it('uses N-hub configuration with per-hub steering/driven flags', () => {
    const definition: WheeledDefinition = {
      hubConfigs: [
        { position: [-0.95, -0.5, -2.2], steered: true, driven: false },
        { position: [0.95, -0.5, -2.2], steered: true, driven: false },
        { position: [-0.95, -0.5, 1.8], steered: false, driven: true },
        { position: [0.95, -0.5, 1.8], steered: false, driven: true },
      ],
      wheelRadius: 0.52,
      suspensionRest: 0.25,
      stiffness: 120,
      engineForce: 8000,
      brakeForce: 120,
      powertrain: {
        powerCv: 420,
        torqueNm: 2100,
        ratios: [12.0, 8.5, 6.0],
        finalDrive: 3.5,
        grip: 5.0,
      },
    }

    const world = new World()
    const floor = new Body({
      shape: new Box(new Vec3(500, 0.5, 500)),
      position: new Vec3(0, -0.5, 0),
    })
    world.addBody(floor)

    const truck = createWheeledVehicle(tractorChassis(), definition)
    truck.raycast.addToWorld(world)

    try {
      expect(truck.hubConfigs.length).toBe(4)
      expect(truck.hubConfigs[0].steered).toBe(true)
      expect(truck.hubConfigs[0].driven).toBe(false)
      expect(truck.hubConfigs[2].steered).toBe(false)
      expect(truck.hubConfigs[2].driven).toBe(true)

      for (let i = 0; i < 60; i++) {
        stepWheeledVehicle(truck, { ...idleWheeledInput(), throttle: 1 }, 1 / 60)
        world.step(1 / 60)
      }

      expect(truck.raycast.wheelInfos[2].engineForce).toBeGreaterThan(0)
      expect(truck.raycast.wheelInfos[0].engineForce).toBe(0)
    } finally {
      truck.raycast.removeFromWorld(world)
      for (const body of [...world.bodies]) world.removeBody(body)
      world.raw.free()
    }
  })
})

describe('trailer', () => {
  it('creates passive axles with no steering or drive', () => {
    const world = new World()
    const floor = new Body({
      shape: new Box(new Vec3(500, 0.5, 500)),
      position: new Vec3(0, -0.5, 0),
    })
    world.addBody(floor)

    const trailer = createTrailer(trailerChassis(), trailerDefinition())
    trailer.raycast.addToWorld(world)

    try {
      expect(trailer.raycast.wheelInfos.length).toBe(6)

      stepTrailer(trailer, idleTrailerInput(), 1 / 60)
      world.step(1 / 60)

      for (let i = 0; i < 6; i++) {
        trailer.raycast.updateWheelTransform(i)
        expect(trailer.raycast.wheelInfos[i].steering).toBe(0)
        expect(trailer.raycast.wheelInfos[i].engineForce).toBe(0)
      }

      const contacts = trailerWheelContacts(trailer)
      expect(contacts.length).toBe(6)
    } finally {
      trailer.raycast.removeFromWorld(world)
      for (const body of [...world.bodies]) world.removeBody(body)
      world.raw.free()
    }
  })

  it('applies parking brake force', () => {
    const trailer = createTrailer(trailerChassis(), trailerDefinition())

    stepTrailer(trailer, { brake: 0, parkingBrake: true }, 1 / 60)

    for (const wheel of trailer.raycast.wheelInfos) {
      expect(wheel.brake).toBe(trailerDefinition().brakeForce)
    }
  })
})

describe('trailer coupling', () => {
  it('couples tractor and trailer with a hitch constraint', () => {
    const world = new World()
    const floor = new Body({
      shape: new Box(new Vec3(500, 0.5, 500)),
      position: new Vec3(0, -0.5, 0),
    })
    world.addBody(floor)

    const tractorBody = tractorChassis()
    const truck = createWheeledVehicle(tractorBody, truckDefinition())
    truck.raycast.addToWorld(world)

    const trailerBody = trailerChassis()
    const trailer = createTrailer(trailerBody, trailerDefinition())
    trailer.raycast.addToWorld(world)

    const fifthWheelPosition = new Vec3(0, 0, 1.766745487)
    const kingpinPosition = new Vec3(...trailerDefinition().kingpin)
    const hitch = new HitchConstraint(tractorBody, trailerBody, fifthWheelPosition, kingpinPosition)
    world.addHitchConstraint(hitch)

    try {
      expect(hitch.joint).not.toBeNull()
      expect(world.constraints.size).toBe(1)

      for (let i = 0; i < 60; i++) {
        stepWheeledVehicle(truck, idleWheeledInput(), 1 / 60, false)
        stepTrailer(trailer, idleTrailerInput(), 1 / 60)
        world.step(1 / 60)
      }

      const tractorPos = tractorBody.position
      const trailerPos = trailerBody.position
      expect(tractorPos.distanceTo(trailerPos)).toBeLessThan(15)

      world.removeHitchConstraint(hitch)
      expect(hitch.joint).toBeNull()
      expect(world.constraints.size).toBe(0)
    } finally {
      truck.raycast.removeFromWorld(world)
      trailer.raycast.removeFromWorld(world)
      for (const body of [...world.bodies]) world.removeBody(body)
      world.raw.free()
    }
  })

  it('tows trailer when tractor accelerates', () => {
    const world = new World()
    const floor = new Body({
      shape: new Box(new Vec3(500, 0.5, 500)),
      position: new Vec3(0, -0.5, 0),
    })
    world.addBody(floor)

    const tractorBody = tractorChassis()
    const truck = createWheeledVehicle(tractorBody, truckDefinition())
    truck.raycast.addToWorld(world)

    const trailerBody = trailerChassis()
    const trailer = createTrailer(trailerBody, trailerDefinition())
    trailer.raycast.addToWorld(world)

    const fifthWheelPosition = new Vec3(0, 0, 1.766745487)
    const kingpinPosition = new Vec3(...trailerDefinition().kingpin)
    const hitch = new HitchConstraint(tractorBody, trailerBody, fifthWheelPosition, kingpinPosition)
    world.addHitchConstraint(hitch)

    try {
      for (let i = 0; i < 120; i++) {
        stepWheeledVehicle(truck, idleWheeledInput(), 1 / 60, false)
        stepTrailer(trailer, idleTrailerInput(), 1 / 60)
        world.step(1 / 60)
        for (let w = 0; w < 4; w++) truck.raycast.updateWheelTransform(w)
        for (let w = 0; w < 6; w++) trailer.raycast.updateWheelTransform(w)
      }

      const initialTrailerZ = trailerBody.position.z

      for (let i = 0; i < 300; i++) {
        stepWheeledVehicle(truck, { ...idleWheeledInput(), throttle: 1 }, 1 / 60, true)
        stepTrailer(trailer, idleTrailerInput(), 1 / 60)
        world.step(1 / 60)
        for (let w = 0; w < 4; w++) truck.raycast.updateWheelTransform(w)
        for (let w = 0; w < 6; w++) trailer.raycast.updateWheelTransform(w)
      }

      // Verify the trailer moved (coupling transferred motion)
      expect(Math.abs(trailerBody.position.z - initialTrailerZ)).toBeGreaterThan(1)
      // Verify the combined rig has velocity
      expect(tractorBody.velocity.length()).toBeGreaterThan(1)
    } finally {
      world.removeHitchConstraint(hitch)
      truck.raycast.removeFromWorld(world)
      trailer.raycast.removeFromWorld(world)
      for (const body of [...world.bodies]) world.removeBody(body)
      world.raw.free()
    }
  })
})

describe('diesel drivetrain', () => {
  it('has lower RPM range than gasoline', () => {
    const gasolineTuning = getDrivetrainTuning('gasoline')
    const dieselTuning = getDrivetrainTuning('diesel')

    expect(dieselTuning.idleRpm).toBeLessThan(gasolineTuning.idleRpm)
    expect(dieselTuning.redlineRpm).toBeLessThan(gasolineTuning.redlineRpm)
    expect(dieselTuning.upshiftRpm).toBeLessThan(gasolineTuning.upshiftRpm)
    expect(dieselTuning.downshiftRpm).toBeLessThan(gasolineTuning.downshiftRpm)
  })

  it('has stronger engine braking than gasoline', () => {
    const gasolineTuning = getDrivetrainTuning('gasoline')
    const dieselTuning = getDrivetrainTuning('diesel')

    expect(dieselTuning.brakingTorqueBase).toBeGreaterThan(gasolineTuning.brakingTorqueBase)
    expect(dieselTuning.brakingTorquePerRpm).toBeGreaterThan(gasolineTuning.brakingTorquePerRpm)
  })

  it('creates drivetrain state with profile-specific idle RPM', () => {
    const gasolineState = createDrivetrain('gasoline')
    const dieselState = createDrivetrain('diesel')

    expect(gasolineState.rpm).toBe(900)
    expect(dieselState.rpm).toBe(550)
  })

  it('shifts at lower RPM thresholds for diesel', () => {
    const dieselSpec = {
      powerCv: 420,
      torqueNm: 2100,
      ratios: [12.0, 8.5, 6.0, 4.2, 3.0],
      finalDrive: 3.5,
      grip: 5.0,
      profile: 'diesel' as const,
    }

    const state = createDrivetrain('diesel')
    const radius = 0.57
    let speed = 0

    for (let i = 0; i < 600; i++) {
      stepDrivetrain(state, dieselSpec, radius, speed, 1.0, false, 1 / 60)
      speed += (state.force / 7500) * (1 / 60)
      speed = Math.max(0, speed)
    }

    expect(state.gear).toBeGreaterThan(1)
    expect(state.rpm).toBeLessThan(2200)
  })

  it('applies stronger engine braking force for diesel', () => {
    const gasolineSpec = {
      powerCv: 420,
      torqueNm: 2100,
      ratios: [3.5, 2.0, 1.0],
      finalDrive: 3.5,
      grip: 5.0,
      profile: 'gasoline' as const,
    }
    const dieselSpec = { ...gasolineSpec, profile: 'diesel' as const }

    const gasolineState = createDrivetrain('gasoline')
    gasolineState.gear = 2
    gasolineState.rpm = 3000

    const dieselState = createDrivetrain('diesel')
    dieselState.gear = 2
    dieselState.rpm = 1500

    const gasolineBraking = Math.abs(engineBrakingForce(gasolineState, gasolineSpec, 0.57, 10))
    const dieselBraking = Math.abs(engineBrakingForce(dieselState, dieselSpec, 0.57, 10))

    expect(dieselBraking).toBeGreaterThan(gasolineBraking)
  })

  it('accelerates truck with diesel profile', () => {
    const world = new World()
    const floor = new Body({
      shape: new Box(new Vec3(500, 0.5, 500)),
      position: new Vec3(0, -0.5, 0),
    })
    world.addBody(floor)

    const truck = createWheeledVehicle(tractorChassis(), truckDefinition('diesel'))
    truck.raycast.addToWorld(world)

    try {
      for (let i = 0; i < 60; i++) {
        stepWheeledVehicle(truck, idleWheeledInput(), 1 / 60, false)
        world.step(1 / 60)
      }

      for (let i = 0; i < 300; i++) {
        stepWheeledVehicle(truck, { ...idleWheeledInput(), throttle: 1 }, 1 / 60, true)
        world.step(1 / 60)
        for (let w = 0; w < 4; w++) truck.raycast.updateWheelTransform(w)
      }

      const telemetry = wheeledTelemetry(truck, { ...idleWheeledInput(), throttle: 1 }, true)
      expect(telemetry.speedMps).toBeGreaterThan(2)
      expect(telemetry.rpm).toBeLessThan(2200)
      expect(telemetry.gear).toBeGreaterThan(1)
    } finally {
      truck.raycast.removeFromWorld(world)
      for (const body of [...world.bodies]) world.removeBody(body)
      world.raw.free()
    }
  })

  it('does not allow burnout for diesel vehicles', () => {
    const dieselSpec = {
      powerCv: 420,
      torqueNm: 2100,
      ratios: [12.0, 8.5],
      finalDrive: 3.5,
      grip: 5.0,
      profile: 'diesel' as const,
    }

    const state = createDrivetrain('diesel')
    stepDrivetrain(state, dieselSpec, 0.57, 0, 1.0, true, 1 / 60)

    expect(state.burnout).toBe(false)
    expect(state.launchSlip).toBe(0)
  })
})

describe('fallback ground', () => {
  it('vehicle rests on fallback ground when no terrain tiles', () => {
    const world = new World()

    // Add fallback ground at Y=0
    const fallbackGround = new Body({ mass: 0 })
    fallbackGround.addShape(new Box(new Vec3(5000, 0.5, 5000)))
    fallbackGround.position.set(0, -0.5, 0)
    world.addBody(fallbackGround)

    // Create truck at Y=0.62 (typical vehicle height offset)
    const truck = createWheeledVehicle(tractorChassis(0), truckDefinition('diesel'))
    truck.body.position.set(0, 1.2, 0)
    truck.raycast.addToWorld(world)

    try {
      // Simulate 10 seconds of physics
      for (let i = 0; i < 600; i++) {
        stepWheeledVehicle(truck, idleWheeledInput(), 1 / 60, false)
        world.step(1 / 60)
        for (let w = 0; w < 4; w++) truck.raycast.updateWheelTransform(w)
      }

      // After 10 seconds, truck should be resting on the ground (Y around 1.0-1.5)
      // and NOT falling through (Y should not be negative or very low)
      expect(truck.body.position.y).toBeGreaterThan(0.5)
      expect(truck.body.position.y).toBeLessThan(3.0)

      // Velocity should be near zero (settled)
      expect(Math.abs(truck.body.velocity.y)).toBeLessThan(0.5)

      // Wheels should be in contact
      const contacts = wheelContacts(truck, idleWheeledInput(), false)
      const inContact = contacts.filter((c) => c.isInContact).length
      expect(inContact).toBeGreaterThanOrEqual(3)
    } finally {
      truck.raycast.removeFromWorld(world)
      world.removeBody(fallbackGround)
      for (const body of [...world.bodies]) world.removeBody(body)
      world.raw.free()
    }
  })
})
