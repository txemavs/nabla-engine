/** Build-time physics and player tuning. Keep all consumers on the same values. */
export const simulationDefaults = Object.freeze({
  /** Fixed physics timestep, seconds. Changing this requires physics regression testing. */
  fixedStepSeconds: 1 / 60,
  /** Maximum fixed steps accepted from one elapsed-time submission. */
  maxSubsteps: 4,
  /** Host frame-duration cap in seconds before physics performs its own substep cap. */
  maxFrameSeconds: 0.1,
  /** Gravitational acceleration in metres per second squared. */
  gravity: 9.81,
  /** Rapier solver iterations per step; integer greater than zero. */
  solverIterations: 15,
  /** Dimensionless friction coefficient for solid scene bodies. */
  solidFriction: 0.55,
  /** Walking player's collider half-height and radius in metres. */
  playerHalfHeight: 0.9,
  playerRadius: 0.32,
  /** Walking and sprinting target speeds in metres per second. */
  walkSpeed: 4.2,
  sprintSpeed: 7,
  /** Horizontal acceleration on ground and in air, metres per second squared. */
  groundAcceleration: 35,
  airAcceleration: 9,
  /** Initial upward jump velocity, metres per second. */
  jumpSpeed: 5.5,
})

/** Road-vehicle selector timing, gear-change feel and baseline engine speed. */
export const roadVehicleDefaults = Object.freeze({
  /**
   * Time the vehicle must stay stopped (below `directionChangeSpeed`, brakes held,
   * opposite pedal still down) before D or R is engaged, seconds. The clock only runs
   * once the vehicle has really stopped, so braking from speed is never delayed by it.
   * A powertrain may override it with `shift.directionSeconds`.
   */
  directionChangeSeconds: 0.3,
  /** Absolute road speed below which the vehicle counts as stopped for D/R changes, m/s. */
  directionChangeSpeed: 0.5,
  /**
   * Stopped with the handbrake on and no pedal pressed, D/R drops to N after this many
   * seconds. `shift.neutralSeconds`.
   */
  neutralSeconds: 0.4,
  /** Further seconds stopped in N with the handbrake on before P engages. `shift.parkSeconds`. */
  parkSeconds: 1.5,
  /** Torque-cut time after a D/R selection is engaged, seconds. `shift.directionShiftSeconds`. */
  directionShiftSeconds: 0.15,
  /** Torque-cut time of an automatic or manual gear change, seconds. `shift.seconds`. */
  gearShiftSeconds: 0.12,
  /** Minimum time between two gear changes, seconds. `shift.cooldownSeconds`. */
  gearShiftCooldownSeconds: 0.45,
  /** Share of the throttle that still reaches the wheels while shifting. `shift.torqueFraction`. */
  gearShiftTorqueFraction: 0.15,
  /** First-order engine speed response, 1/s. Lower is a heavier flywheel. `shift.rpmResponse`. */
  engineRpmResponse: 16,
  /** Engine speed commanded by a fully pressed pedal at rest, rpm. `shift.launchRpm`. */
  launchRpm: 2400,
  /**
   * Generic petrol-engine idle speed (S3, A3, procedural cars); the rev counter rests here at a
   * standstill. Vehicle powertrains may override it (the diesel truck idles at 750).
   */
  idleRpm: 1000,
  /**
   * Starter-motor cranking, the first step after entering a vehicle, seconds. The vehicle is in
   * P and held by its brakes; no drive torque.
   */
  ignitionCrankSeconds: 0.6,
  /**
   * Instrument self-test once the engine has caught: every needle sweeps to full scale and back,
   * seconds. The engine settles from its catch to idle meanwhile; still P, no drive torque.
   */
  ignitionSweepSeconds: 1,
  /** Engine speed shown while the starter cranks, rpm. */
  crankingRpm: 250,
  /** Engine speed of the catch when the engine fires; it then settles to idle, x idle rpm. */
  ignitionFlare: 1.6,
  /**
   * P holds like a parking pawl: a stiff, damped longitudinal spring (per unit mass, 1/s^2 and
   * 1/s) on the distance crept since P engaged. The wheel brakes alone resolve velocity before
   * gravity is integrated, so a braked car otherwise creeps g*sin(slope)*dt per step downhill.
   */
  parkHoldStiffness: 400,
  parkHoldDamping: 40,
  /** Holding force limit as a tyre friction coefficient (0.8 holds about a 38 degree slope). */
  parkHoldFriction: 0.8,
  /** Above this speed relative to the ground the hold lets go (pushed hard or sliding), m/s. */
  parkHoldSlipSpeed: 1.5,
  /** Maximum tractor/trailer yaw either side of straight ahead, radians (65 degrees). */
  trailerArticulationRadians: (65 * Math.PI) / 180,
  /** Sustained horizontal contact load that breaks a reversing trailer coupling, newtons. */
  couplingBreakForce: 45000,
  /** Duration above the sustained load threshold, seconds. */
  couplingBreakSeconds: 0.12,
  /** A severe impact breaks immediately, newtons. */
  couplingImpactForce: 250000,
})

/**
 * Two-wheeled (motorcycle) controller defaults. A preset's `vehicle.twoWheeled` overrides any of
 * them. TODO(unverified): every value here is a conservative gameplay placeholder chosen for
 * stability in the fixed-step Rapier simulation. None is measured or published data for any
 * machine; calibrate against real rider/tyre data before treating the result as realistic.
 */
export const twoWheeledDefaults = Object.freeze({
  /** TODO(unverified): largest cornering lean the rider model aims for, radians (~40°). */
  maxLean: 0.7,
  /** TODO(unverified): lean beyond which the machine has fallen and balance stops, radians. */
  fallLean: 1.15,
  /** TODO(unverified): below this speed the balance assist holds the machine upright, m/s. */
  balanceSpeed: 3,
  /** Low-speed balance assist on by default, so a stopped machine stays on its wheels. */
  balanceAssist: true,
  /** TODO(unverified): lean controller natural frequency while riding, rad/s. */
  leanResponse: 5,
  /** TODO(unverified): stiffer natural frequency of the low-speed balance assist, rad/s. */
  assistResponse: 8,
  /** Lean controller damping ratio (1 = critically damped, no overshoot). */
  leanDampingRatio: 1,
  /** TODO(unverified): largest commanded roll acceleration, rad/s². Caps crash recovery. */
  maxLeanAcceleration: 60,
  /**
   * Low-pass rate of the roll disturbance observer, 1/s. It estimates the roll acceleration the
   * tyres and gravity add every tick and cancels it, so the lean follows its target in turns.
   */
  disturbanceResponse: 30,
  /** TODO(unverified): handlebar slew rate, rad/s. */
  steerRate: 2.5,
  /** TODO(unverified): front brake at full lever, same units as `brakeForce`. */
  frontBrakeForce: 24,
  /** TODO(unverified): rear brake at full lever, same units as `brakeForce`. */
  rearBrakeForce: 6,
  /** TODO(unverified): tyre friction slip for both wheels. */
  frictionSlip: 4,
  /** TODO(unverified): suspension relaxation (rebound) and compression damping. */
  dampingRelaxation: 2.6,
  dampingCompression: 4.4,
  /**
   * Wheelie and stoppie assist (phase 2). The pitch itself is physical: drive and brake forces
   * act at the tyre contacts below the centre of mass, so the front lifts when
   * drive force × CoM height exceeds weight × CoM-to-rear-contact distance, and the rear lifts
   * when braking deceleration exceeds g × CoM-to-front-contact / CoM height. The assist only
   * keeps it fun and recoverable: between the soft and the maximum angle it fades the drive
   * (wheelie) or the front brake (stoppie), and past the maximum it adds a restoring pitch
   * torque. Angles are radians, relative to the ground under the wheel that is still down.
   */
  pitchAssist: Object.freeze({
    /** Wheelie assist on by default. Off: only physics, so the bike can loop out. */
    wheelie: true,
    /**
     * TODO(unverified): wheelie angle where the drive starts to fade with the rider sat fully
     * back, radians (~15°). With a rider model, the soft and maximum angles blend from 0 and
     * `wheelieNeutralAngle` (rider centred or forward) to these as the rider moves back, so a
     * full-throttle start only lifts the front a little unless the rider asks for a wheelie.
     */
    wheelieSoftAngle: 0.26,
    /** TODO(unverified): wheelie angle with no drive left, rider fully back (~30°). */
    wheelieMaxAngle: 0.52,
    /** TODO(unverified): largest wheelie angle with the rider centred or forward (~4°). */
    wheelieNeutralAngle: 0.07,
    /** Stoppie assist on by default. Off: the front brake can flip the bike over the bar. */
    stoppie: true,
    /**
     * TODO(unverified): stoppie (rear lift) angle where the front brake starts to ease with the
     * rider fully forward (~7°). Like the wheelie, the angles blend from 0 and
     * `stoppieNeutralAngle` (rider centred or back) as the rider moves forward.
     */
    stoppieSoftAngle: 0.12,
    /** TODO(unverified): stoppie angle with the front brake eased to `stoppieMinBrake` (~17°). */
    stoppieMaxAngle: 0.3,
    /** TODO(unverified): largest stoppie angle with the rider centred or back (~3°). */
    stoppieNeutralAngle: 0.05,
    /** TODO(unverified): share of the front brake kept at `stoppieMaxAngle`, 0..1. */
    stoppieMinBrake: 0.35,
    /** TODO(unverified): natural frequency of the restoring pitch torque past the maximum, rad/s. */
    response: 6,
    /** Damping ratio of that restoring torque (1 = critically damped). */
    dampingRatio: 1,
    /**
     * TODO(unverified): fastest pitch rate back towards the ground before the assist damps the
     * landing, rad/s. Keeps a dropped wheelie from slamming the fork.
     */
    landingRate: 2.5,
    /** Look-ahead of the fade, seconds: it reacts to where the pitch is heading. */
    anticipation: 0.15,
  }),
  /**
   * Clutch kick: Shift (the launch input) with the throttle open in a low gear slips the
   * clutch and dumps the spinning engine's energy into the rear wheel for a moment, which is
   * how a rider lifts the front in a gear where the steady drive force cannot.
   * TODO(unverified): gain and duration are gameplay placeholders, not crank-inertia data.
   */
  clutchKick: Object.freeze({
    /** Extra drive force at the start of the kick, as a share of the current drive force. */
    gain: 0.5,
    /** Kick length, seconds (linear fade). */
    seconds: 0.35,
    /** Highest gear the kick works in. */
    maxGear: 2,
  }),
  /**
   * Rider counterweight (phase 2). The rider is part of the vehicle mass; moving the rider
   * moves the chassis centre of mass in Rapier, so weight shift changes load transfer, wheelie
   * and stoppie thresholds and the lean needed for a turn (hanging off leans the bike less).
   */
  rider: Object.freeze({
    /** TODO(unverified): rider mass inside the vehicle mass, kg (the assumed ~76 kg rider). */
    mass: 76,
    /** TODO(unverified): largest sideways rider shift (hanging off), metres. */
    lateral: 0.25,
    /** TODO(unverified): largest forward rider shift (chest over the tank), metres. */
    forward: 0.2,
    /** TODO(unverified): largest rearward rider shift (sitting back), metres. */
    back: 0.25,
    /** TODO(unverified): how fast the rider moves, full travel per second. */
    rate: 3,
    /**
     * TODO(unverified): body steering. A full sideways shift adds this much steering input
     * (0..1) towards the side the rider moves to.
     */
    steer: 0.2,
  }),
  /**
   * Combined braking (Dual CBS style), used only when a preset declares `twoWheeled.cbs`.
   * Each control feeds both wheels; values are shares of each wheel's full brake force
   * (`frontBrakeForce`, `rearBrakeForce`). Without `cbs` the lever brakes only the front and the
   * pedal only the rear (phase-1 behaviour).
   *
   * TODO(unverified): these shares are NOT Honda data. They follow the piston allocation
   * described for the 1998–2001 VFR800 (lever: 4 of 6 front pistons plus 1 of 3 rear pistons
   * through the secondary master cylinder; pedal: the other 2 front and 2 rear pistons), read as
   * piston counts only. Real hydraulic shares depend on piston areas, the proportional control
   * valve and the delay valve, which are not modelled from data.
   */
  cbs: Object.freeze({
    leverFront: 4 / 6,
    leverRear: 1 / 3,
    pedalFront: 2 / 6,
    pedalRear: 2 / 3,
    /** TODO(unverified): lag of the linked (cross-coupled) circuits, seconds. */
    linkLag: 0.12,
  }),
  /** TODO(unverified): aerodynamic drag factor standing in for ½·ρ·CdA, N per (m/s)². */
  dragFactor: 0.3,
})

/** Conservative map collision streaming. Safety margins are in metres; budgets are soft. */
export const mapCollisionDefaults = Object.freeze({
  /** Resort deferred colliders at this interval in milliseconds. */
  reorderIntervalMs: 200,
  /** Travel margin for stale ordering, metres. */
  orderingMargin: 100,
  /** Colliders inside this distance bypass the soft cooking budget, metres. */
  criticalDistance: 80,
  /** Maximum noncritical collider creations per submission. */
  installCount: 4,
  /** Noncritical cooking time budget per submission, milliseconds. */
  installBudgetMs: 2,
  /** Additional coverage based on actor velocity, seconds. */
  lookAheadSeconds: 2,
  /** Refresh active map collider membership every this many fixed physics steps. */
  activationIntervalTicks: 15,
})
