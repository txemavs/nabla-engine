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
  /** Generic petrol-engine idle speed; vehicle powertrains may override it. */
  idleRpm: 900,
  /**
   * Instrument self-test on entering a vehicle: every needle sweeps to full scale and back,
   * seconds. The vehicle is in P and held by its brakes; the engine is still off.
   */
  ignitionSweepSeconds: 1,
  /** Starter-motor cranking after the needle sweep, seconds. Still in P, no drive torque. */
  ignitionCrankSeconds: 1,
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
