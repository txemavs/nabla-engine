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

/**
 * Rider thrown off a crashed two-wheeler (`twoWheeledDefaults.crash.ejectKmh`). The player
 * leaves the seat with the machine's velocity and a hop, flies, takes the hit and slides on
 * the ground with friction, lies still for a moment, then gets up: the floating monitor rises
 * back to its cushion (or the walker stands up) and control returns. Gameplay values.
 */
export const ejectionDefaults = Object.freeze({
  /** Share of the machine's velocity the rider keeps when thrown. */
  carry: 0.9,
  /** Upward speed added when thrown, m/s. */
  hop: 3,
  /** Height above the vehicle's driver (head) point where the rider starts, metres. */
  clearance: 0.5,
  /** Contacts in the first moments of the flight (the machine, the obstacle) are not the landing, s. */
  minFlightSeconds: 0.2,
  /** Sliding friction on the ground, as a share of gravity. */
  friction: 0.8,
  /** Speed below which the rider has stopped sliding, m/s. */
  restSpeed: 0.8,
  /** Time lying on the ground after the slide stops, seconds. */
  downSeconds: 1.2,
  /** Time to get up (the monitor rises back to its cushion), seconds. Input stays off. */
  riseSeconds: 0.9,
  /** Safety: control returns after this long even without landing (e.g. off an edge), seconds. */
  maxSeconds: 10,
})

/** Road-vehicle selector timing, gear-change feel and baseline engine speed. */
export const roadVehicleDefaults = Object.freeze({
  /**
   * Default hysteresis of the soft speed limiter (`powertrain.speedLimiter`), km/h: after a cut
   * at the limit the drive returns once the speed is this far below it. A gameplay value.
   */
  limiterHysteresisKmh: 2,
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
   * Engine mode a car with `powertrain.modes` starts in when its preset sets no `defaultMode`:
   * `normal` (D) or `beast` (S). Hosts choose per vehicle with `defaultMode` (`?engineMode=`).
   */
  engineMode: 'normal' as 'normal' | 'beast',
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
  /**
   * Full lean ("total estribo"): holding full steer in a turn raises the lean limit from
   * `maxLean` towards the preset's `pegLean` for that side (the lean at which the footpeg, or
   * the first part, touches the ground) over `seconds`; letting go relaxes it back over
   * `relaxSeconds`. Never beyond the peg: at that lean the peg scrapes (sparks and sound). Off
   * for presets without `pegLean`. Gameplay timing values.
   */
  fullLean: Object.freeze({
    /** Seconds of held full steer from `maxLean` to the peg lean. */
    seconds: 2,
    /** Seconds to relax back to `maxLean` after the steer eases. */
    relaxSeconds: 1,
    /** Steering demand that counts as full steer (0..1). */
    steer: 0.95,
    /** The peg scrapes within this lean of the peg angle, radians (~0.6°). */
    scrapeMargin: 0.01,
  }),
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
    /**
     * Automatic rider: with no counterweight keys pressed the rider hangs off into turns, moves
     * forward under hard acceleration and back under hard front braking, and sits centred
     * when cruising. The keys take over at once and hand back after `releaseDelay`.
     */
    auto: Object.freeze({
      enabled: true,
      /** TODO(unverified): sideways input (share of `lateral`) at the largest lean. */
      hangOff: 0.8,
      /** TODO(unverified): sideways input per unit of steering demand. */
      steer: 0.2,
      /**
       * TODO(unverified): extra hang-off at the full (peg) lean, as a share of `lateral` on top
       * of the normal full hang-off; it grows with the lean past `maxLean`.
       */
      pegHangOff: 0.35,
      /** TODO(unverified): lean below which the rider stays centred, radians (~6°). */
      leanDeadband: 0.1,
      /** TODO(unverified): forward input per g of acceleration past the deadband. */
      accelGain: 2.5,
      /** TODO(unverified): rearward input per g of front-brake deceleration past the deadband. */
      brakeGain: 2,
      /** TODO(unverified): acceleration below which the rider stays centred, g. */
      accelDeadband: 0.12,
      /** Seconds for the keys to take over from the automatic rider. */
      takeover: 0.1,
      /** Seconds without keys before the automatic rider takes back over. */
      releaseDelay: 1,
      /** Seconds to blend back to the automatic rider. */
      blend: 0.6,
    }),
    /**
     * Tuck behind the windscreen at speed. The automatic rider's head starts to go down at `kmh`
     * and reaches the full tuck at `fullKmh` along an eased ramp (no step). Slowing down it comes
     * back up along the same ramp shifted `kmh - releaseKmh` lower (hysteresis), fully sat up at
     * `releaseKmh`; hard braking sits it up at once. The forward key (I) reaches into the tuck
     * along the same `kmh` → `fullKmh` ramp; below `kmh` it keeps its normal range. `eye` is the
     * full-tuck cockpit eye relative to the seated one (chassis metres, +y up, +z back): down and
     * forward behind the screen, but high enough that the horizon clears the fairing (road
     * through and above the screen, tacho at the bottom of the view); partial tucks scale it.
     */
    tuck: Object.freeze({
      enabled: true,
      kmh: 180,
      fullKmh: 200,
      releaseKmh: 170,
      /** Seconds for a full tuck (and back). */
      seconds: 0.6,
      /** Deceleration that counts as hard braking and sits the rider up, g. */
      brakeG: 0.35,
      eye: Object.freeze([0, -0.22, -0.34] as [number, number, number]),
    }),
  }),
  /**
   * TODO(unverified): pitch beyond which a wheelie has looped or a stoppie has gone over the
   * front, radians (~75°): the machine has crashed until R recovers it. The assists never get
   * near it; only the Shift hooligan modifier (assists off) can.
   */
  crashPitch: 1.3,
  /**
   * Crashes besides the hooligan loop (two-wheelers). Gameplay values, not measurements.
   * - Impact: the horizontal velocity changes faster than `impactG` (low-passed over
   *   `impactSeconds`) while the machine was doing at least `minKmh`: a wall, a car, a pole.
   *   Hard braking (~1.3 g) and the steepest turns (~1.4 g) stay far below it.
   * - Lowside: the machine falls past `fallLean` at `minKmh` or more.
   * Either one is a crash until R, like a looped wheelie. At the onset the machine gets a spin
   * of `spin` rad/s per m/s of speed (at most `maxSpin`) and, for impacts, a hop of `hop` s
   * × speed (at most `maxHop` m/s): it tumbles instead of just lying down. At `ejectKmh` or more
   * the rider is thrown off (see `ejectionDefaults`).
   */
  crash: Object.freeze({
    impactG: 5,
    impactSeconds: 0.05,
    minKmh: 30,
    /** The crash speed is the fastest of the last moments, decaying by this many m/s per second. */
    speedMemory: 40,
    spin: 0.25,
    maxSpin: 10,
    hop: 0.1,
    maxHop: 5,
    ejectKmh: 120,
  }),
  /**
   * Shift hooligan modifier (two-wheelers). While Shift is held the wheelie and stoppie assists,
   * the combined brakes and the automatic rider's fore-aft moves are off, and:
   * - Shift + throttle from standstill or low speed: launch burnout, the rear wheel spins up well
   *   past road speed (smoke and marks) and the bike still drives forward, sliding a little.
   * - Shift + rider back (L) + throttle: a bigger wheelie with no assist; held too long it loops.
   * - Shift + front lever (S) + rear pedal (Space) + throttle: stationary burnout, front locked.
   * - Shift while braking with the lever: stoppie; held too long it goes over the front.
   * Without Shift nothing changes.
   */
  /**
   * Foot paddling (two-wheelers have no reverse gear). Stopped (below `startKmh`) with the cars'
   * reverse key held (S, the front lever) for `delay` seconds, the rider walks the bike backwards
   * with his feet: the brakes let go and it eases back (at most `accel` m/s², closing on the
   * target at `response` 1/s) to `maxKmh`. Released, the feet stop it. No engine, no gear: the
   * selector and the dash are untouched. Gameplay values.
   */
  paddle: Object.freeze({
    enabled: true,
    startKmh: 2,
    delay: 0.4,
    maxKmh: 2.5,
    accel: 0.8,
    response: 3,
  }),
  hooligan: Object.freeze({
    enabled: true,
    /** TODO(unverified): launch burnout below this road speed, m/s, fading out over `burnoutFade`. */
    burnoutSpeed: 6,
    burnoutFade: 5,
    /** TODO(unverified): rear wheel surface speed above road speed at full spin, m/s. */
    spinSpeed: 18,
    /** TODO(unverified): how fast the rear spins up and down, m/s per second. */
    spinRate: 30,
    /** TODO(unverified): share of the drive that still reaches the road while it spins. */
    burnoutTraction: 0.6,
    /** TODO(unverified): sideways slide of the spinning rear, yaw acceleration amplitude, rad/s². */
    slide: 1.5,
    /** TODO(unverified): drive multiplier for the Shift wheelie (rider back). */
    wheelieDrive: 1.2,
    /** Pitch rise the rider holds in the Shift wheelie by feathering the throttle, rad/s (~20°/s). */
    wheelieRate: 0.35,
    /** TODO(unverified): front brake multiplier for the Shift stoppie. */
    stoppieBrake: 1.2,
    /** Pitch rise the rider holds in the Shift stoppie by feathering the lever, rad/s (~26°/s). */
    stoppieRate: 0.45,
    /** How firmly the rise rate is held, 1/s. */
    riseResponse: 60,
    /** Rider back share (0..1 of `rider.back`) that turns Shift + throttle into a wheelie. */
    wheelieRiderBack: 0.3,
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
  /**
   * TODO(unverified): aerodynamic drag factor standing in for ½·ρ·CdA, N per (m/s)² (0.18 ≈
   * CdA 0.29 m² at sea level). Tuned, not measured: low enough that the vfr800 reaches the
   * ~250 km/h its owner's bike cuts out at (unlimited it would run on to ~262 km/h). Was 0.3,
   * which held it near 222 km/h.
   */
  dragFactor: 0.18,
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
