import { z } from 'zod'
import { boxCollider, finite, rotation, transform, vector } from '../coords.js'

const assetPart = z
  .object({
    url: z.string().regex(/^\/(?!\/)[a-zA-Z0-9_./-]+\.glb$/),
    transform,
  })
  .strict()

/** Steering wheel model. `axis` is the column axis in the model's own space, pointing away
 * from the driver; omit it when the rim already turns about the model's +Z. */
const steeringPart = assetPart
  .extend({
    axis: z
      .tuple([finite, finite, finite])
      .refine((v) => Math.hypot(...v) > 1e-6, 'Steering axis must not be zero')
      .optional(),
  })
  .strict()

/**
 * Single-track (two-wheeled) vehicle: a motorcycle or scooter. Its presence selects the
 * two-wheeled controller (`simulation/vehicles/two-wheeled`) and requires exactly two hubs,
 * front then rear. `wheelRadius` is then the front radius. Vectors are chassis-local metres.
 * Every optional tuning value falls back to `twoWheeledDefaults` (`config/simulation.ts`); those
 * defaults are conservative gameplay values, not measured data for any particular machine.
 */
export const twoWheeledField = z
  .object({
    /** Rear tyre radius, metres. */
    rearWheelRadius: finite.min(0.05).max(1.5),
    /** Steering head axis, chassis-local, pointing up the head stock (normalized at runtime). */
    steeringAxis: z
      .tuple([finite, finite, finite])
      .refine((v) => Math.hypot(...v) > 1e-6, 'Steering axis must not be zero'),
    /** Handlebar lock each side, about the steering axis, radians. */
    steerLimit: finite.min(0.05).max(1.2),
    /** Largest cornering lean the rider model aims for, radians. */
    maxLean: finite.min(0.05).max(1.2).optional(),
    /** Beyond this lean the machine counts as fallen and balance stops, radians. */
    fallLean: finite.min(0.1).max(1.5).optional(),
    /**
     * Full lean ("total estribo") per side: `lean` (radians) at which the footpeg, or the first
     * part, touches the ground at the static ride height, and that `point` (chassis-local
     * metres) for the scrape sparks. Holding full steer raises the limit from `maxLean` towards
     * it (`twoWheeledDefaults.fullLean`). Measure it from the GLB
     * (`scripts/vfr800-lean-clearance.mjs`); omitted = the limit stays at `maxLean`.
     */
    pegLean: z
      .object({
        left: z
          .object({ lean: finite.min(0.1).max(1.4), point: z.tuple([finite, finite, finite]) })
          .strict(),
        right: z
          .object({ lean: finite.min(0.1).max(1.4), point: z.tuple([finite, finite, finite]) })
          .strict(),
        seconds: finite.positive().max(20).optional(),
        relaxSeconds: finite.positive().max(20).optional(),
        steer: finite.min(0.1).max(1).optional(),
      })
      .strict()
      .optional(),
    /** Below this speed the low-speed balance assist holds the machine upright, m/s. */
    balanceSpeed: finite.min(0).max(30).optional(),
    /** Turn the low-speed balance assist off (the machine then falls over when stopped). */
    balanceAssist: z.boolean().optional(),
    /** Lean controller natural frequency while riding, rad/s. */
    leanResponse: finite.min(0.5).max(40).optional(),
    /** Lean controller natural frequency of the low-speed assist, rad/s. */
    assistResponse: finite.min(0.5).max(40).optional(),
    /** Largest roll acceleration the lean controller may command, rad/s². */
    maxLeanAcceleration: finite.min(1).max(500).optional(),
    /** Handlebar slew rate, rad/s. */
    steerRate: finite.min(0.1).max(20).optional(),
    /** Front and rear service brake at full lever, in the same units as `brakeForce`. */
    frontBrakeForce: finite.positive().max(1000).optional(),
    rearBrakeForce: finite.positive().max(1000).optional(),
    /** Tyre friction slip coefficient for both wheels. */
    frictionSlip: finite.min(0.1).max(20).optional(),
    /**
     * Rider counterweight. The rider mass is part of the vehicle `mass`; moving the rider moves
     * the chassis centre of mass. Omitted: no rider model and no counterweight input.
     */
    rider: z
      .object({
        /** Seated rider centre of mass, chassis-local metres. */
        seat: z.tuple([finite, finite, finite]),
        /** Rider mass inside the vehicle mass, kg. */
        mass: finite.positive().max(300).optional(),
        /** Largest sideways shift (hanging off), metres. */
        lateral: finite.min(0).max(1).optional(),
        /** Largest forward and rearward shift, metres. */
        forward: finite.min(0).max(1).optional(),
        back: finite.min(0).max(1).optional(),
        /** Full rider travel per second. */
        rate: finite.positive().max(50).optional(),
        /** Body steering: steering input added by a full sideways shift, 0..1. */
        steer: finite.min(0).max(1).optional(),
        /** Automatic rider body movement when the counterweight keys are not pressed. */
        auto: z
          .object({
            enabled: z.boolean().optional(),
            /** Sideways input (0..1 of the full shift) at the largest lean. */
            hangOff: finite.min(0).max(2).optional(),
            /** Extra hang-off at the full (peg) lean, share of `lateral` (see `pegLean`). */
            pegHangOff: finite.min(0).max(1).optional(),
            /** Sideways input per unit of steering demand. */
            steer: finite.min(0).max(2).optional(),
            /** Lean below which the rider stays centred, radians. */
            leanDeadband: finite.min(0).max(1).optional(),
            /** Forward input per g of acceleration, rearward per g of front braking. */
            accelGain: finite.min(0).max(20).optional(),
            brakeGain: finite.min(0).max(20).optional(),
            /** Acceleration below which the rider stays centred, g. */
            accelDeadband: finite.min(0).max(2).optional(),
            /** Seconds: keys take over, delay after release, blend back to automatic. */
            takeover: finite.positive().max(5).optional(),
            releaseDelay: finite.min(0).max(10).optional(),
            blend: finite.positive().max(10).optional(),
          })
          .strict()
          .optional(),
        /** Tuck behind the windscreen at speed (automatic and with the forward key). */
        tuck: z
          .object({
            enabled: z.boolean().optional(),
            /** The head starts to go down from this speed, km/h (automatic and forward key). */
            kmh: finite.min(10).max(500).optional(),
            /** Full tuck from this speed, km/h (eased ramp from `kmh`). */
            fullKmh: finite.min(10).max(500).optional(),
            /** Fully sat up again below this speed, km/h (hysteresis on the way down). */
            releaseKmh: finite.min(5).max(500).optional(),
            /** Seconds for a full tuck. */
            seconds: finite.positive().max(5).optional(),
            /** Deceleration that sits the rider up, g. */
            brakeG: finite.min(0).max(3).optional(),
            /** Tucked cockpit eye relative to the seated one, chassis metres. */
            eye: z.tuple([finite, finite, finite]).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    /** Pitch that counts as a crash (looped wheelie, over the front), radians. */
    crashPitch: finite.min(0.5).max(1.55).optional(),
    /** Shift hooligan modifier overrides (`twoWheeledDefaults.hooligan`). */
    hooligan: z
      .object({
        enabled: z.boolean().optional(),
        /** Launch burnout below this speed, m/s, fading out over `burnoutFade`. */
        burnoutSpeed: finite.min(0).max(50).optional(),
        burnoutFade: finite.min(0.1).max(50).optional(),
        /** Rear wheel surface speed above road speed at full spin, m/s, and its rate, m/s². */
        spinSpeed: finite.min(0).max(100).optional(),
        spinRate: finite.positive().max(500).optional(),
        /** Share of the drive that reaches the road while the rear spins. */
        burnoutTraction: finite.min(0).max(1).optional(),
        /** Yaw wiggle amplitude while sliding, rad/s². */
        slide: finite.min(0).max(20).optional(),
        /** Wheelie drive multiplier and held climb rate, rad/s. */
        wheelieDrive: finite.min(0).max(5).optional(),
        wheelieRate: finite.min(0).max(5).optional(),
        /** Stoppie front brake multiplier and held climb rate, rad/s. */
        stoppieBrake: finite.min(0).max(5).optional(),
        stoppieRate: finite.min(0).max(5).optional(),
        /** How firmly the climb rate is held, 1/s. */
        riseResponse: finite.min(0).max(200).optional(),
        /** Rider back share that turns Shift + throttle into a wheelie, 0..1. */
        wheelieRiderBack: finite.min(0).max(1).optional(),
      })
      .strict()
      .optional(),
    /** Wheelie and stoppie assist overrides; angles in radians. */
    pitchAssist: z
      .object({
        wheelie: z.boolean().optional(),
        wheelieSoftAngle: finite.min(0).max(1.4).optional(),
        wheelieMaxAngle: finite.min(0.01).max(1.5).optional(),
        wheelieNeutralAngle: finite.min(0.01).max(1.5).optional(),
        stoppie: z.boolean().optional(),
        stoppieSoftAngle: finite.min(0).max(1.4).optional(),
        stoppieMaxAngle: finite.min(0.01).max(1.5).optional(),
        stoppieNeutralAngle: finite.min(0.01).max(1.5).optional(),
        stoppieMinBrake: finite.min(0).max(1).optional(),
        response: finite.min(0.5).max(40).optional(),
        dampingRatio: finite.min(0.1).max(4).optional(),
        landingRate: finite.min(0).max(20).optional(),
        anticipation: finite.min(0).max(1).optional(),
      })
      .strict()
      .optional(),
    /** Clutch kick (Shift + throttle in a low gear); `gain` 0 turns it off. */
    clutchKick: z
      .object({
        gain: finite.min(0).max(3).optional(),
        seconds: finite.min(0).max(2).optional(),
        maxGear: z.number().int().min(1).max(12).optional(),
      })
      .strict()
      .optional(),
    /**
     * Combined braking (Dual CBS style): each control feeds both wheels. Shares of each wheel's
     * full brake force, 0..1; omitted fields use `twoWheeledDefaults.cbs`. Omit the block for
     * independent brakes (lever = front, pedal = rear).
     */
    cbs: z
      .object({
        leverFront: finite.min(0).max(1).optional(),
        leverRear: finite.min(0).max(1).optional(),
        pedalFront: finite.min(0).max(1).optional(),
        pedalRear: finite.min(0).max(1).optional(),
        /** Lag of the linked circuits, seconds. */
        linkLag: finite.min(0).max(2).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

/** Shift timing, shift points, engine response and the gear-change sound. */
const gearboxShiftField = z
  .object({
    seconds: finite.min(0.02).max(2).optional(),
    cooldownSeconds: finite.min(0.05).max(5).optional(),
    upshiftRpm: finite.min(400).max(20000).optional(),
    downshiftRpm: finite.min(300).max(19000).optional(),
    torqueFraction: finite.min(0).max(1).optional(),
    rpmResponse: finite.min(1).max(40).optional(),
    launchRpm: finite.min(300).max(6000).optional(),
    directionSeconds: finite.min(0).max(3).optional(),
    directionShiftSeconds: finite.min(0).max(2).optional(),
    neutralSeconds: finite.min(0).max(10).optional(),
    parkSeconds: finite.min(0).max(30).optional(),
    clack: z
      .object({
        clunkHz: finite.min(30).max(500).optional(),
        clickHz: finite.min(200).max(8000).optional(),
        gain: finite.min(0).max(2).optional(),
        decaySeconds: finite.min(0.02).max(0.8).optional(),
        echoSeconds: finite.min(0).max(0.5).optional(),
        airSeconds: finite.min(0).max(1.5).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

/** Per-mode powertrain overrides (`powertrain.modes`). */
const powertrainModeField = z
  .object({
    powerCv: finite.min(20).max(2000).optional(),
    torqueNm: finite.min(20).max(3000).optional(),
    idleRpm: finite.min(300).max(2000).optional(),
    maxRpm: finite.min(2000).max(20000).optional(),
    shift: gearboxShiftField.optional(),
  })
  .strict()

/**
 * Engine voice. `note` (default): the road-car engine note. `v4`: a procedural V4 whose uneven
 * pulse train follows the firing order of a V4 with `vAngle` between the banks and `crankpin`
 * degrees between the two crankpins. `inline`: a refined inline engine (default an inline-4
 * turbo; `cylinders: 5` for the five-cylinder warble) with a subdued turbo.
 */
const engineVoiceField = z
  .object({
    voice: z.enum(['note', 'v4', 'inline', 'diesel']),
    /** Angle between the cylinder banks, degrees. Default 90. */
    vAngle: finite.min(10).max(180).optional(),
    /** Angle between the two crankpins, degrees. Default 180. */
    crankpin: finite.min(0).max(360).optional(),
    /** Inline voice: cylinders (3–6, default 4; 5 gives the five-cylinder warble). */
    cylinders: z.number().int().min(3).max(6).optional(),
    /** Inline-5 warble (pulse-strength spread), 0..0.5. Default 0.12. */
    warble: finite.min(0).max(0.5).optional(),
    /** Inline voice: turbo whistle and blow-off multipliers, 0..2. */
    turboWhistle: finite.min(0).max(2).optional(),
    blowOff: finite.min(0).max(2).optional(),
    /** Inline voice: chance (0..1) of a soft overrun burble on a high-rpm lift. Default 0. */
    burble: finite.min(0).max(1).optional(),
    /** Diesel: exhaust-brake bark on lift-off. Default on. */
    jake: z.boolean().optional(),
    /** Diesel: air-brake hiss on brake apply and release. Default on. */
    airBrake: z.boolean().optional(),
    /** Loudness multiplier, 0..2. Default 1. */
    volume: finite.min(0).max(2).optional(),
  })
  .strict()

/** Chassis, four hubs (two for a `twoWheeled` vehicle), and the optional cabin, garage and flight flag. */
export const vehicleField = z
  .object({
    colliders: z.array(boxCollider).min(1).max(32),
    hubs: z.union([
      z.tuple([vector, vector]),
      z.tuple([vector, vector, vector, vector]),
      z.tuple([vector, vector, vector, vector, vector, vector]),
    ]),
    /** Unpowered trailer, excluded from player boarding. */
    passive: z.boolean().optional(),
    /** Chassis-local towing mount, extracted from the body's tow.hitch anchor. */
    hitch: vector.optional(),
    /** Trailer-side kingpin extracted from the tow.anchor node. */
    towAnchor: vector.optional(),
    tow: z
      .object({ vehicleId: z.string().min(1), anchor: vector, hitch: vector })
      .strict()
      .optional(),
    wheelRadius: finite.min(0.05).max(1.5),
    suspensionRest: finite.min(0.02).max(1),
    /** Metres of travel each side of the rest length. Default 0.3. */
    suspensionTravel: finite.min(0.05).max(1.2).optional(),
    stiffness: finite.min(5).max(200),
    engineForce: finite.positive().max(100000),
    /** Two-wheeled (single-track) controller and geometry; requires exactly two hubs. */
    twoWheeled: twoWheeledField.optional(),
    /** Front hubs are 0/1; rear hubs 2/3. Omitted keeps rear-wheel drive. */
    drivenWheels: z.enum(['front', 'rear', 'all']).optional(),
    /** Optional automatic powertrain. Power is metric horsepower (CV), torque is N·m. */
    powertrain: z
      .object({
        powerCv: finite.min(20).max(2000),
        torqueNm: finite.min(20).max(3000),
        ratios: z.array(finite.min(0.2).max(20)).min(1).max(10),
        finalDrive: finite.min(1).max(8),
        grip: finite.min(0.5).max(8),
        idleRpm: finite.min(300).max(2000).optional(),
        maxRpm: finite.min(2000).max(20000).optional(),
        reverseRatio: finite.positive().max(20).optional(),
        maxSpeedKmh: finite.positive().max(400).optional(),
        /** Soft ignition-style speed limiter (cut at `kmh`, resume `hysteresisKmh` below). */
        speedLimiter: z
          .object({
            kmh: finite.min(5).max(400),
            hysteresisKmh: finite.min(0).max(30).optional(),
          })
          .strict()
          .optional(),
        /** Traction/clutch ceiling on the force at the wheels, newtons. */
        maxWheelForceN: finite.positive().max(1000000).optional(),
        /** Shift timing, shift points, engine response and the gear-change sound. */
        shift: gearboxShiftField.optional(),
        /**
         * Two engine modes on one car: `normal` (selector D) and `beast` (selector S, «Bestia»).
         * Each overrides power, torque, idle, redline and gearbox points; the engine voice comes
         * from `audio.engineModes`. Figures are gameplay values unless a preset cites a source.
         */
        modes: z
          .object({ normal: powertrainModeField.optional(), beast: powertrainModeField.optional() })
          .strict()
          .optional(),
        /** Mode on creation when `modes` is set; default `roadVehicleDefaults.engineMode`. */
        defaultMode: z.enum(['normal', 'beast']).optional(),
      })
      .strict()
      .optional(),
    brakeForce: finite.positive().max(1000),
    driver: vector,
    cameraDistance: finite.min(2).max(30),
    /** Optional driver-local eye offset. */
    headOffset: vector.optional(),
    /**
     * Nudge for the instrument cluster, metres in chassis space, added to the authored GLB anchor.
     * +Y is up. Omitted leaves the cluster where it was modelled.
     */
    clusterOffset: z
      .tuple([finite.min(-0.2).max(0.2), finite.min(-0.2).max(0.2), finite.min(-0.2).max(0.2)])
      .optional(),
    /**
     * Camera / avatar ride smoothing strength, 0 (the view rides every bump) .. 1. Omitted uses
     * the vehicle class default (`rideSmoothingDefaults`). Presentation only.
     */
    rideSmoothing: finite.min(0).max(1).optional(),
    /** Neutral eye orientation relative to the chassis, authored in the body GLB. */
    headRotation: rotation.optional(),
    /** Authored carrier display surfaces; dimensions are metres in chassis space. */
    monitorMounts: z
      .array(
        z
          .object({
            id: z.string(),
            width: finite.positive(),
            height: finite.positive(),
            position: vector,
            rotation,
          })
          .strict(),
      )
      .optional(),
    /**
     * Flat mirror lenses in body-model space for presentations whose GLB has no lens material.
     * `normal` is the direction the glass faces; width and height are metres.
     */
    mirrors: z
      .array(
        z
          .object({
            position: vector,
            normal: vector,
            width: finite.positive().max(5),
            height: finite.positive().max(5),
          })
          .strict(),
      )
      .max(8)
      .optional(),
    /** Vertical mirror tilt in degrees; omitted uses -2 degrees (0 on two-wheelers). */
    mirrorTilt: finite.min(-5).max(12).optional(),
    /** Body finish; omitted uses the stock paint properties. */
    paintFinish: z.enum(['paint', 'chrome']).optional(),
    /**
     * Baked glass aim per mirror side (`left`, `right`, …), degrees, on top of the asset lens:
     * `yaw` + outward / − inward about the vehicle vertical, `tilt` + up (added to `mirrorTilt`).
     * The driver's «Espejos» sliders add to it. `scripts/bake-mirror-aim.mjs` writes it.
     */
    mirrorAim: z
      .record(
        z.string().min(1).max(32),
        z.object({ yaw: finite.min(-30).max(30), tilt: finite.min(-20).max(20) }).strict(),
      )
      .optional(),
    /** Enable the audible warning while this vehicle has reverse gear engaged. */
    reverseAlarm: z.boolean().optional(),
    /**
     * Motorcycle instrument cluster drawn on the GLB anchors `gauge_speedo`, `gauge_tacho`,
     * `gauge_lcd`, `lamp_signal_l|r` and `lamp_warning_1…n` (two-wheelers only). Omitted fields
     * use `motorcycleClusterDefaults`; the red zone defaults to `powertrain.maxRpm`.
     */
    cluster: z
      .object({
        /** Speedometer full scale and numbered step, km/h. */
        speedoMaxKmh: finite.min(40).max(500).optional(),
        speedoStepKmh: finite.min(5).max(100).optional(),
        /** Tachometer full scale and start of the red zone, rpm. */
        tachoMaxRpm: finite.min(1000).max(30000).optional(),
        redlineRpm: finite.min(500).max(30000).optional(),
        /** Needle sweep from zero to full scale, radians. */
        sweep: finite.min(0.5).max(6).optional(),
        /** Warning lamps in `lamp_warning_1…n` order, left to right. */
        lamps: z
          .array(z.enum(['neutral', 'high-beam', 'oil', 'fi']))
          .max(8)
          .optional(),
      })
      .strict()
      .optional(),
    /**
     * Per-vehicle sound options. Omitted keeps the road-car sound: turbo on and a clack on
     * audible gear changes. See `audio/vehicle-sound.ts`.
     */
    audio: z
      .object({
        /** Turbo whistle, spool and blow-off. Default true. */
        turbo: z.boolean().optional(),
        gearShift: z
          .object({
            /** `clack` (default), `click` (quiet, every gear change) or `none`. */
            sound: z.enum(['clack', 'click', 'none']),
            /** Loudness multiplier, 0..2. Default 1. */
            volume: finite.min(0).max(2).optional(),
          })
          .strict()
          .optional(),
        /**
         * Engine voice. `note` (default): the road-car engine note. `v4`: a procedural V4 whose
         * uneven pulse train follows the firing order of a V4 with `vAngle` between the banks and
         * `crankpin` degrees between the two crankpins. `inline`: a refined inline engine (default
         * an inline-4 turbo; `cylinders: 5` for the five-cylinder warble) with a subdued turbo.
         */
        engine: engineVoiceField.optional(),
        /**
         * Engine voice per engine mode (`powertrain.modes`): the selected mode's voice replaces
         * `engine` while that mode is active.
         */
        engineModes: z
          .object({ normal: engineVoiceField.optional(), beast: engineVoiceField.optional() })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    /**
     * Control profile id: `road`, `flight`, `none` or a host-registered profile. Picks the
     * touch rig and HUD readouts while seated (docs/vehicle-controls.md). Omitted infers one.
     */
    controls: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .optional(),
    flight: z.boolean().optional(),
    /** Light airplane: plane-helm uses wing lift instead of the carrier's cruise. */
    plane: z.boolean().optional(),
    boat: z.boolean().optional(),
    interior: z.object({ min: vector, max: vector, exit: vector }).strict().optional(),
    garage: z
      .object({
        min: vector,
        max: vector,
        ramp: z
          .object({
            colliderIndex: z.number().int().min(0).max(31),
            hinge: vector,
            closeAngle: finite.min(-Math.PI).max(Math.PI),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

/** GLB body, wheels, steering wheel and ramp nodes. Asset names are not physics. */
export const visualField = z
  .object({
    body: assetPart,
    /** Host-registered presentation adapter. Omit for a plain model without equipment. */
    presentation: z
      .string()
      .regex(/^[a-zA-Z0-9._-]{1,80}$/)
      .optional(),
    ramp: z
      .object({
        nodes: z.array(z.string()).min(1).max(8),
        hinge: vector,
        closeAngle: finite.min(-Math.PI).max(Math.PI),
      })
      .strict()
      .optional(),
    wheel: assetPart.optional(),
    /** Optional individual wheel models in hub order (front left/right, rear left/right). */
    wheels: z
      .union([
        z.tuple([assetPart, assetPart]),
        z.tuple([assetPart, assetPart, assetPart, assetPart]),
        z.tuple([assetPart, assetPart, assetPart, assetPart, assetPart, assetPart]),
      ])
      .optional(),
    steering: steeringPart.optional(),
    wheelRotations: z
      .union([
        z.tuple([rotation, rotation]),
        z.tuple([rotation, rotation, rotation, rotation]),
        z.tuple([rotation, rotation, rotation, rotation, rotation, rotation]),
      ])
      .optional(),
    /** Optional cargo or equipment GLBs composed onto the chassis at spawn. */
    attachments: z.array(assetPart).max(8).optional(),
  })
  .strict()

export type VehicleDefinition = z.infer<typeof vehicleField>
export type TwoWheeledDefinition = z.infer<typeof twoWheeledField>
export type VisualDefinition = z.infer<typeof visualField>
