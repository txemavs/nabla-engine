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

/** Chassis, four hubs, and the optional cabin, garage and flight flag. */
export const vehicleField = z
  .object({
    colliders: z.array(boxCollider).min(1).max(32),
    hubs: z.union([
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
        maxRpm: finite.min(2000).max(10000).optional(),
        reverseRatio: finite.positive().max(20).optional(),
        maxSpeedKmh: finite.positive().max(400).optional(),
        /** Traction/clutch ceiling on the force at the wheels, newtons. */
        maxWheelForceN: finite.positive().max(1000000).optional(),
        /** Shift timing, shift points, engine response and the gear-change sound. */
        shift: z
          .object({
            seconds: finite.min(0.02).max(2).optional(),
            cooldownSeconds: finite.min(0.05).max(5).optional(),
            upshiftRpm: finite.min(400).max(10000).optional(),
            downshiftRpm: finite.min(300).max(9000).optional(),
            torqueFraction: finite.min(0).max(1).optional(),
            rpmResponse: finite.min(1).max(40).optional(),
            launchRpm: finite.min(300).max(6000).optional(),
            directionSeconds: finite.min(0).max(3).optional(),
            directionShiftSeconds: finite.min(0).max(2).optional(),
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
          .optional(),
      })
      .strict()
      .optional(),
    brakeForce: finite.positive().max(1000),
    driver: vector,
    cameraDistance: finite.min(2).max(30),
    /** Optional driver-local eye offset. */
    headOffset: vector.optional(),
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
    /** Vertical mirror tilt in degrees; omitted uses -2 degrees. */
    mirrorTilt: finite.min(-5).max(12).optional(),
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
        z.tuple([assetPart, assetPart, assetPart, assetPart]),
        z.tuple([assetPart, assetPart, assetPart, assetPart, assetPart, assetPart]),
      ])
      .optional(),
    steering: steeringPart.optional(),
    wheelRotations: z
      .union([
        z.tuple([rotation, rotation, rotation, rotation]),
        z.tuple([rotation, rotation, rotation, rotation, rotation, rotation]),
      ])
      .optional(),
  })
  .strict()

export type VehicleDefinition = z.infer<typeof vehicleField>
export type VisualDefinition = z.infer<typeof visualField>
